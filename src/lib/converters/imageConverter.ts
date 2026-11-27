import type {
  ConversionSettings,
  ImageCropRect,
  WatermarkSettings,
} from "@/types/converter";
import { encodeBmpFromImageData, encodeIcoFromPngBytes } from "./encoders";
import { inspectImageMetadata, stripJpegBinaryMetadata } from "./exif";

let cachedAvifSupport: boolean | null = null;

export interface ImageConversionResult {
  blob: Blob;
  targetUnreachableWarning?: string;
}

/**
 * Probes whether this browser natively encodes image/avif via OffscreenCanvas/HTMLCanvasElement.
 * Memoized for browser runtime calls so dropdown checks do not re-allocate canvases.
 */
export async function supportsAvifEncoding(): Promise<boolean> {
  if (cachedAvifSupport !== null) {
    return cachedAvifSupport;
  }

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cachedAvifSupport = false;
        return false;
      }
      ctx.fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: "image/avif", quality: 0.8 });
      cachedAvifSupport = blob.type === "image/avif";
      return cachedAvifSupport;
    }

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cachedAvifSupport = false;
        return false;
      }
      ctx.fillRect(0, 0, 1, 1);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/avif", 0.8);
      });
      cachedAvifSupport = blob?.type === "image/avif";
      return cachedAvifSupport;
    }
  } catch {
    cachedAvifSupport = false;
    return false;
  }

  cachedAvifSupport = false;
  return false;
}

/**
 * Resolves a pixel or percentage crop rectangle clamped safely inside source image bounds.
 */
export function resolveCropRect(
  srcWidth: number,
  srcHeight: number,
  crop?: ImageCropRect | null
): { sx: number; sy: number; sw: number; sh: number } {
  if (!crop || crop.width <= 0 || crop.height <= 0) {
    return { sx: 0, sy: 0, sw: srcWidth, sh: srcHeight };
  }

  const rawX = crop.unit === "percent" ? (crop.x / 100) * srcWidth : crop.x;
  const rawY = crop.unit === "percent" ? (crop.y / 100) * srcHeight : crop.y;
  const rawW = crop.unit === "percent" ? (crop.width / 100) * srcWidth : crop.width;
  const rawH = crop.unit === "percent" ? (crop.height / 100) * srcHeight : crop.height;

  const sx = Math.max(0, Math.min(srcWidth - 1, Math.round(rawX)));
  const sy = Math.max(0, Math.min(srcHeight - 1, Math.round(rawY)));
  const sw = Math.max(1, Math.min(srcWidth - sx, Math.round(rawW)));
  const sh = Math.max(1, Math.min(srcHeight - sy, Math.round(rawH)));

  return { sx, sy, sw, sh };
}

/**
 * Calculates output dimensions based on user settings and source aspect ratio
 */
export function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  settings: ConversionSettings
): { width: number; height: number } {
  const targetW = settings.width;
  const targetH = settings.height;

  if (!targetW && !targetH) {
    return { width: srcWidth, height: srcHeight };
  }

  if (settings.maintainAspectRatio) {
    const ratio = srcWidth / srcHeight;
    if (targetW && !targetH) {
      return {
        width: Math.max(1, Math.round(targetW)),
        height: Math.max(1, Math.round(targetW / ratio)),
      };
    }
    if (!targetW && targetH) {
      return {
        width: Math.max(1, Math.round(targetH * ratio)),
        height: Math.max(1, Math.round(targetH)),
      };
    }
    if (targetW && targetH) {
      const scale = Math.min(targetW / srcWidth, targetH / srcHeight);
      return {
        width: Math.max(1, Math.round(srcWidth * scale)),
        height: Math.max(1, Math.round(srcHeight * scale)),
      };
    }
  }

  return {
    width: Math.max(1, targetW ?? srcWidth),
    height: Math.max(1, targetH ?? srcHeight),
  };
}

/**
 * Scales dimensions proportionally so both width and height fit within maxSide (e.g. 256 for ICO).
 */
export function capDimensionsToMax(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) {
    return { width, height };
  }
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.min(maxSide, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxSide, Math.round(height * scale))),
  };
}

/**
 * Preprocesses HEIC/HEIF files into a browser-decodable PNG blob.
 */
export async function preprocessImageFile(file: File): Promise<Blob> {
  const lower = file.name.toLowerCase();
  const isHeic = lower.endsWith(".heic") || lower.endsWith(".heif");
  if (isHeic) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/png",
      });
      if (Array.isArray(converted)) {
        const first = converted[0];
        if (!first) {
          throw new Error("HEIC decoder returned an empty image array");
        }
        return first;
      }
      return converted;
    } catch (err) {
      console.warn("HEIC conversion failed, attempting raw decode:", err);
      return file;
    }
  }
  return file;
}

async function encodeCanvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string,
  qualityRatio: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mimeType, quality: qualityRatio });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Canvas failed to export ${mimeType}`));
        }
      },
      mimeType,
      qualityRatio
    );
  });
}

function createDrawingCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      return { canvas, ctx };
    }
  }
  if (typeof document !== "undefined") {
    const domCanvas = document.createElement("canvas");
    domCanvas.width = width;
    domCanvas.height = height;
    const ctx = domCanvas.getContext("2d");
    if (ctx) {
      return { canvas: domCanvas, ctx };
    }
  }
  throw new Error("Could not acquire 2D canvas context");
}

async function renderWatermarkLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  watermark: WatermarkSettings
): Promise<void> {
  if (!watermark.enabled) return;

  const alpha = Math.max(0.05, Math.min(1, watermark.opacity));
  const scaleFactor = Math.max(0.25, Math.min(3, watermark.scale || 1));
  const margin = Math.max(12, Math.round(Math.min(width, height) * 0.04));

  ctx.save();
  ctx.globalAlpha = alpha;

  if (watermark.mode === "image" && watermark.imageDataUrl) {
    try {
      const resp = await fetch(watermark.imageDataUrl);
      const wmBlob = await resp.blob();
      const wmBitmap = await createImageBitmap(wmBlob);
      try {
        const targetW = Math.max(16, Math.round(width * 0.2 * scaleFactor));
        const ratio = wmBitmap.height / Math.max(1, wmBitmap.width);
        const targetH = Math.max(16, Math.round(targetW * ratio));

        if (watermark.position === "tile") {
          const stepX = Math.max(targetW + 40, Math.round(width / 3));
          const stepY = Math.max(targetH + 40, Math.round(height / 3));
          for (let y = margin; y < height; y += stepY) {
            for (let x = margin; x < width; x += stepX) {
              ctx.drawImage(wmBitmap, x, y, targetW, targetH);
            }
          }
        } else {
          let x = margin;
          let y = margin;
          if (watermark.position === "top-right") x = width - targetW - margin;
          else if (watermark.position === "bottom-left") y = height - targetH - margin;
          else if (watermark.position === "bottom-right") {
            x = width - targetW - margin;
            y = height - targetH - margin;
          } else if (watermark.position === "center") {
            x = Math.round((width - targetW) / 2);
            y = Math.round((height - targetH) / 2);
          }
          ctx.drawImage(wmBitmap, x, y, targetW, targetH);
        }
      } finally {
        wmBitmap.close();
      }
    } catch {
      // Skip unreadable watermark asset cleanly
    } finally {
      ctx.restore();
    }
    return;
  }

  const label = (watermark.text ?? "").trim();
  if (!label) {
    ctx.restore();
    return;
  }

  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.055 * scaleFactor));
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.fillStyle = watermark.color ?? "#ffffff";

  if (watermark.position === "tile") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const stepX = Math.max(fontSize * 4, Math.round(width / 3));
    const stepY = Math.max(fontSize * 3, Math.round(height / 3));
    for (let y = fontSize; y < height; y += stepY) {
      for (let x = fontSize * 2; x < width; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  } else {
    let x = margin;
    let y = margin;
    if (watermark.position === "top-left") {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    } else if (watermark.position === "top-right") {
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      x = width - margin;
    } else if (watermark.position === "bottom-left") {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      y = height - margin;
    } else if (watermark.position === "bottom-right") {
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      x = width - margin;
      y = height - margin;
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      x = Math.round(width / 2);
      y = Math.round(height / 2);
    }
    ctx.fillText(label, x, y);
  }

  ctx.restore();
}

const LOSSY_TARGETS = new Set(["webp", "jpeg", "jpg", "avif"]);

/**
 * Full-featured client-side image conversion with EXIF fast-path preservation,
 * crop/rotate/flip geometry transforms, text/image watermarks, binary encoders,
 * and bounded binary-search auto target-size compression.
 */
export async function convertImageWithMeta(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<ImageConversionResult> {
  const format = targetFormat.toLowerCase();

  if (format === "pdf") {
    const { mergeImagesToPdf } = await import("./documentConverter");
    return { blob: await mergeImagesToPdf([file], onProgress) };
  }

  onProgress?.(10);
  const processedBlob = await preprocessImageFile(file);
  const exifInfo = await inspectImageMetadata(processedBlob);
  onProgress?.(25);

  const stripExif = settings.stripExif !== false;
  const isJpegSource =
    processedBlob.type === "image/jpeg" || /\.(jpe?g)$/i.test(file.name);
  const isJpegTarget = format === "jpeg" || format === "jpg";
  const hasGeometryEdits = Boolean(
    settings.width ||
      settings.height ||
      settings.crop ||
      (settings.rotateDeg ?? 0) !== 0 ||
      settings.flipH ||
      settings.flipV ||
      settings.watermark?.enabled ||
      (settings.targetSizeKb && settings.targetSizeKb > 0)
  );
  const uprightOrientation = !exifInfo.orientation || exifInfo.orientation === 1;

  if (isJpegSource && isJpegTarget && !hasGeometryEdits && settings.quality >= 98 && uprightOrientation) {
    if (!stripExif && settings.quality === 100) {
      onProgress?.(100);
      return { blob: processedBlob };
    }
    if (stripExif) {
      const rawBytes = new Uint8Array(await processedBlob.arrayBuffer());
      const strippedBytes = stripJpegBinaryMetadata(rawBytes);
      onProgress?.(100);
      return {
        blob: new Blob([strippedBytes.buffer as ArrayBuffer], { type: "image/jpeg" }),
      };
    }
  }

  const bitmap = await createImageBitmap(processedBlob, {
    imageOrientation: "from-image",
  });

  try {
    onProgress?.(55);

    const cropRect = resolveCropRect(bitmap.width, bitmap.height, settings.crop);
    const rotateDeg = settings.rotateDeg ?? 0;
    const isQuarterTurn = rotateDeg === 90 || rotateDeg === 270;
    const orientedW = isQuarterTurn ? cropRect.sh : cropRect.sw;
    const orientedH = isQuarterTurn ? cropRect.sw : cropRect.sh;

    const baseDims = calculateDimensions(orientedW, orientedH, settings);
    const { width, height } =
      format === "ico" ? capDimensionsToMax(baseDims.width, baseDims.height, 256) : baseDims;

    const { canvas, ctx } = createDrawingCanvas(width, height);

    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      (ctx as CanvasRenderingContext2D).imageSmoothingQuality = "high";
    }

    if (format === "jpeg" || format === "jpg" || format === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    const flipH = Boolean(settings.flipH);
    const flipV = Boolean(settings.flipV);
    if (rotateDeg !== 0 || flipH || flipV) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      if (rotateDeg !== 0) {
        ctx.rotate((rotateDeg * Math.PI) / 180);
      }
      if (flipH || flipV) {
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      }
      const drawW = isQuarterTurn ? height : width;
      const drawH = isQuarterTurn ? width : height;
      ctx.drawImage(
        bitmap,
        cropRect.sx,
        cropRect.sy,
        cropRect.sw,
        cropRect.sh,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH
      );
      ctx.restore();
    } else if (
      cropRect.sx !== 0 ||
      cropRect.sy !== 0 ||
      cropRect.sw !== bitmap.width ||
      cropRect.sh !== bitmap.height
    ) {
      ctx.drawImage(
        bitmap,
        cropRect.sx,
        cropRect.sy,
        cropRect.sw,
        cropRect.sh,
        0,
        0,
        width,
        height
      );
    } else {
      ctx.drawImage(bitmap, 0, 0, width, height);
    }

    if (settings.watermark?.enabled) {
      await renderWatermarkLayer(ctx, width, height, settings.watermark);
    }

    onProgress?.(80);

    if (format === "bmp") {
      const imageData = ctx.getImageData(0, 0, width, height);
      const bmpBlob = encodeBmpFromImageData(imageData);
      onProgress?.(100);
      return { blob: bmpBlob };
    }

    if (format === "ico") {
      const pngBlob = await encodeCanvasToBlob(canvas, "image/png", 1);
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const icoBlob = encodeIcoFromPngBytes(pngBytes, width, height);
      onProgress?.(100);
      return { blob: icoBlob };
    }

    const mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
    const encodeWithGuard = async (qualityRatio: number): Promise<Blob> => {
      let resultBlob: Blob;
      try {
        resultBlob = await encodeCanvasToBlob(canvas, mimeType, qualityRatio);
      } catch (err) {
        if (format === "avif") {
          throw new Error(
            "AVIF encoding is not supported in this browser. Select WebP or JPEG instead."
          );
        }
        throw err;
      }
      if (format === "avif" && resultBlob.type !== "image/avif") {
        throw new Error(
          "AVIF encoding is not supported in this browser. Select WebP or JPEG instead."
        );
      }
      return resultBlob;
    };

    const targetKb = settings.targetSizeKb;
    if (targetKb && targetKb > 0 && LOSSY_TARGETS.has(format)) {
      const targetBytes = Math.round(targetKb * 1024);
      let low = 0.05;
      let high = Math.max(0.1, Math.min(0.98, settings.quality / 100));
      let bestUnder: Blob | null = null;
      let smallestOverall: Blob = await encodeWithGuard(low);

      if (smallestOverall.size <= targetBytes) {
        bestUnder = smallestOverall;
        // Binary search upward for highest quality still <= targetBytes (max 6 extra encodes)
        for (let iter = 0; iter < 6; iter++) {
          const mid = (low + high) / 2;
          const probe = await encodeWithGuard(mid);
          if (probe.size < smallestOverall.size) {
            smallestOverall = probe;
          }
          if (probe.size <= targetBytes) {
            bestUnder = probe;
            low = mid;
          } else {
            high = mid;
          }
        }
      }

      if (bestUnder) {
        onProgress?.(100);
        return { blob: bestUnder };
      }

      onProgress?.(100);
      return {
        blob: smallestOverall,
        targetUnreachableWarning: `Could not compress "${file.name}" under ${targetKb} KB (smallest achieved: ${(smallestOverall.size / 1024).toFixed(1)} KB).`,
      };
    }

    const qualityRatio = Math.max(0.01, Math.min(1.0, settings.quality / 100));
    const resultBlob = await encodeWithGuard(qualityRatio);
    onProgress?.(100);
    return { blob: resultBlob };
  } finally {
    bitmap.close();
  }
}

/**
 * Converts an image file to the desired target format with custom settings.
 */
export async function convertImage(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { blob } = await convertImageWithMeta(file, targetFormat, settings, onProgress);
  return blob;
}
