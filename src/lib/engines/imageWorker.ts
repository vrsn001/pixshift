import { convertImageWithMeta } from "@/lib/converters/imageConverter";
import type { ConversionSettings } from "@/types/converter";

export interface ImageWorkerRequest {
  id: string;
  file: File;
  targetFormat: string;
  settings: ConversionSettings;
}

export type ImageWorkerMessage =
  | { id: string; type: "progress"; pct: number }
  | {
      id: string;
      type: "done";
      buffer: ArrayBuffer;
      mimeType: string;
      targetUnreachableWarning?: string;
    }
  | { id: string; type: "error"; message: string };

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const { id, file, targetFormat, settings } = event.data;
  try {
    const result = await convertImageWithMeta(file, targetFormat, settings, (pct) => {
      const msg: ImageWorkerMessage = { id, type: "progress", pct };
      self.postMessage(msg);
    });
    const buffer = await result.blob.arrayBuffer();
    const doneMsg: ImageWorkerMessage = {
      id,
      type: "done",
      buffer,
      mimeType: result.blob.type || "application/octet-stream",
      targetUnreachableWarning: result.targetUnreachableWarning,
    };
    (self as unknown as Worker).postMessage(doneMsg, [buffer]);
  } catch (err: unknown) {
    const errMsg: ImageWorkerMessage = {
      id,
      type: "error",
      message: err instanceof Error ? err.message : "Worker image conversion failed",
    };
    self.postMessage(errMsg);
  }
};
