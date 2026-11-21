import { ConversionSettings } from "@/types/converter";

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
      return { width: Math.round(targetW), height: Math.round(targetW / ratio) };
    }
    if (!targetW && targetH) {
      return { width: Math.round(targetH * ratio), height: Math.round(targetH) };
    }
    if (targetW && targetH) {
      const scale = Math.min(targetW / srcWidth, targetH / srcHeight);
      return {
        width: Math.round(srcWidth * scale),
        height: Math.round(srcHeight * scale),
      };
    }
  }

  return {
    width: targetW || srcWidth,
    height: targetH || srcHeight,
  };
}

/**
 * Preprocesses file if it's HEIC/HEIF into a standard image blob
 */
async function preprocessImageFile(file: File): Promise<Blob> {
  const isHeic = file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");
  if (isHeic) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/png",
      });
      return Array.isArray(converted) ? converted[0] : converted;
    } catch (err) {
      console.warn("HEIC conversion failed, attempting raw decode:", err);
      return file;
    }
  }
  return file;
}

/**
 * Converts an image file to the desired target format with custom settings.
 * Uses createImageBitmap for fast off-thread decoding and OffscreenCanvas when available.
 */
export async function convertImage(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(10);
  const processedBlob = await preprocessImageFile(file);
  onProgress?.(30);

  // Use createImageBitmap for faster off-thread image decoding (2-5x vs new Image())
  const bitmap = await createImageBitmap(processedBlob);
  onProgress?.(60);

    const { width, height } = calculateDimensions(bitmap.width, bitmap.height, settings);

    const format = targetFormat.toLowerCase();

    // Use OffscreenCanvas for standard formats; fall back to DOM canvas for exotic ones (BMP/ICO)
    const canUseOffscreen = typeof OffscreenCanvas !== "undefined" && !["bmp", "ico"].includes(format);

    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

    if (canUseOffscreen) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext("2d");
    } else {
      const domCanvas = document.createElement("canvas");
      domCanvas.width = width;
      domCanvas.height = height;
      canvas = domCanvas;
      ctx = domCanvas.getContext("2d");
    }

    if (!ctx) {
      bitmap.close();
      throw new Error("Could not acquire 2D canvas context");
    }

    // High quality rendering
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      (ctx as CanvasRenderingContext2D).imageSmoothingQuality = "high";
    }

    // If exporting to JPEG or BMP, fill white background to prevent black transparent areas
    if (format === "jpeg" || format === "jpg" || format === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); // Free memory immediately
    onProgress?.(80);

    // Map format to MIME type
    let mimeType = `image/${format}`;
    if (format === "jpg") mimeType = "image/jpeg";
    if (format === "ico") mimeType = "image/x-icon";
    if (format === "bmp") mimeType = "image/bmp";

  const qualityRatio = Math.max(0.01, Math.min(1.0, settings.quality / 100));

      let resultBlob: Blob;

      if (canUseOffscreen) {
        // OffscreenCanvas.convertToBlob is faster than DOM canvas toBlob
        resultBlob = await(canvas as OffscreenCanvas).convertToBlob({
          type: mimeType,
          quality: qualityRatio,
        });
      } else {
        resultBlob = await new Promise<Blob>((resolve, reject) => {
          (canvas as HTMLCanvasElement).toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                // Fallback for formats not natively supported by canvas.toBlob (e.g. BMP/ICO)
                try {
                  const dataUrl = (canvas as HTMLCanvasElement).toDataURL(mimeType, qualityRatio);
                  const byteString = atob(dataUrl.split(",")[1]);
                  const ab = new ArrayBuffer(byteString.length);
                  const ia = new Uint8Array(ab);
                  for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                  }
                  resolve(new Blob([ab], { type: mimeType }));
                } catch (canvasErr) {
                  reject(new Error(`Failed to export image as ${format}`));
                }
              }
            },
            mimeType,
            qualityRatio
          );
        });
      }

    onProgress?.(100);
    return resultBlob;
  }
