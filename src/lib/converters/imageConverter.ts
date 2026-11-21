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
 * Converts an image file to the desired target format with custom settings
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

  const img = new Image();
  const objectUrl = URL.createObjectURL(processedBlob);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
      img.src = objectUrl;
    });

    onProgress?.(60);

    const { width, height } = calculateDimensions(img.naturalWidth, img.naturalHeight, settings);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not acquire 2D canvas context");
    }

    // High quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // If exporting to JPEG or BMP, fill white background to prevent black transparent areas
    const format = targetFormat.toLowerCase();
    if (format === "jpeg" || format === "jpg" || format === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);
    onProgress?.(80);

    // Map format to MIME type
    let mimeType = `image/${format}`;
    if (format === "jpg") mimeType = "image/jpeg";
    if (format === "ico") mimeType = "image/x-icon";
    if (format === "bmp") mimeType = "image/bmp";

    const qualityRatio = Math.max(0.01, Math.min(1.0, settings.quality / 100));

    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback for formats not natively supported by canvas.toBlob (e.g. BMP/ICO)
            try {
              const dataUrl = canvas.toDataURL(mimeType, qualityRatio);
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

    onProgress?.(100);
    return resultBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
