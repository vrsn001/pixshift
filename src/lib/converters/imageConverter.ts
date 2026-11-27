import { ConversionSettings } from "@/types/converter";
import { encodeBmpFromImageData, encodeIcoFromPngBytes } from "./encoders";
import { inspectImageMetadata, stripJpegBinaryMetadata } from "./exif";

let cachedAvifSupport: boolean | null = null;

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
      return { width: Math.max(1, Math.round(targetW)), height: Math.max(1, Math.round(targetW / ratio)) };
    }
    if (!targetW && targetH) {
      return { width: Math.max(1, Math.round(targetH * ratio)), height: Math.max(1, Math.round(targetH)) };
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

/**
 * Converts an image file to the desired target format with custom settings.
 * Inspects EXIF metadata & orientation before choosing lossless fast-paths so
 * rotated JPEGs always bake upright via createImageBitmap({ imageOrientation: "from-image" }).
 */
export async function convertImage(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const format = targetFormat.toLowerCase();

  if (format === "pdf") {
    const { mergeImagesToPdf } = await import("./documentConverter");
    return mergeImagesToPdf([file], onProgress);
  }

  onProgress?.(10);
  const processedBlob = await preprocessImageFile(file);
  const exifInfo = await inspectImageMetadata(processedBlob);
  onProgress?.(25);

  const stripExif = settings.stripExif !== false;
  const isJpegSource =
    processedBlob.type === "image/jpeg" || /\.(jpe?g)$/i.test(file.name);
  const isJpegTarget = format === "jpeg" || format === "jpg";
  const noResize = !settings.width && !settings.height;
  const uprightOrientation = !exifInfo.orientation || exifInfo.orientation === 1;

  // Lossless binary fast-path ONLY when orientation is absent or 1 (never bypass baking when rotated > 1)
  if (isJpegSource && isJpegTarget && noResize && settings.quality >= 98 && uprightOrientation) {
    if (!stripExif && settings.quality === 100) {
      onProgress?.(100);
      return processedBlob;
    }
    if (stripExif) {
      const rawBytes = new Uint8Array(await processedBlob.arrayBuffer());
      const strippedBytes = stripJpegBinaryMetadata(rawBytes);
      onProgress?.(100);
      return new Blob([strippedBytes.buffer as ArrayBuffer], { type: "image/jpeg" });
    }
  }

  const bitmap = await createImageBitmap(processedBlob, {
    imageOrientation: "from-image",
  });

  try {
    onProgress?.(60);

    const baseDims = calculateDimensions(bitmap.width, bitmap.height, settings);
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

    ctx.drawImage(bitmap, 0, 0, width, height);
    onProgress?.(80);

    if (format === "bmp") {
      const imageData = ctx.getImageData(0, 0, width, height);
      const bmpBlob = encodeBmpFromImageData(imageData);
      onProgress?.(100);
      return bmpBlob;
    }

    if (format === "ico") {
      const pngBlob = await encodeCanvasToBlob(canvas, "image/png", 1);
      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      const icoBlob = encodeIcoFromPngBytes(pngBytes, width, height);
      onProgress?.(100);
      return icoBlob;
    }

    const mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
    const qualityRatio = Math.max(0.01, Math.min(1.0, settings.quality / 100));

    let resultBlob: Blob;
    try {
      resultBlob = await encodeCanvasToBlob(canvas, mimeType, qualityRatio);
    } catch (err) {
      if (format === "avif") {
        throw new Error("AVIF encoding is not supported in this browser. Select WebP or JPEG instead.");
      }
      throw err;
    }

    if (format === "avif" && resultBlob.type !== "image/avif") {
      throw new Error("AVIF encoding is not supported in this browser. Select WebP or JPEG instead.");
    }

    onProgress?.(100);
    return resultBlob;
  } finally {
    bitmap.close();
  }
}
