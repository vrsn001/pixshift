import { convertImageWithMeta, type ImageConversionResult } from "@/lib/converters/imageConverter";
import type { ImageWorkerMessage } from "@/lib/engines/imageWorker";
import type { ConversionSettings } from "@/types/converter";

interface QueuedTask {
  file: File;
  targetFormat: string;
  settings: ConversionSettings;
  onProgress?: (pct: number) => void;
  resolve: (res: ImageConversionResult) => void;
  reject: (err: Error) => void;
}

class DedicatedImageWorkerPool {
  private workers: Worker[] = [];
  private busy = new Set<Worker>();
  private queue: QueuedTask[] = [];
  private taskCounter = 0;

  private canUseWorkers(): boolean {
    return (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof window !== "undefined"
    );
  }

  private getPoolLimit(): number {
    if (typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)) {
      return Math.max(2, Math.min(4, navigator.hardwareConcurrency));
    }
    return 2;
  }

  private spawnWorker(): Worker {
    const worker = new Worker(new URL("./imageWorker.ts", import.meta.url), {
      type: "module",
    });
    this.workers.push(worker);
    return worker;
  }

  private dispatchNext(): void {
    if (this.queue.length === 0) return;

    let idleWorker = this.workers.find((w) => !this.busy.has(w));
    if (!idleWorker && this.workers.length < this.getPoolLimit()) {
      idleWorker = this.spawnWorker();
    }
    if (!idleWorker) return;

    const task = this.queue.shift();
    if (!task) return;

    this.busy.add(idleWorker);
    const taskId = `img-${++this.taskCounter}`;

    const cleanup = () => {
      idleWorker?.removeEventListener("message", onMessage);
      idleWorker?.removeEventListener("error", onError);
      if (idleWorker) {
        this.busy.delete(idleWorker);
      }
      this.dispatchNext();
    };

    const onMessage = (ev: MessageEvent<ImageWorkerMessage>) => {
      const data = ev.data;
      if (!data || data.id !== taskId) return;
      if (data.type === "progress") {
        task.onProgress?.(data.pct);
        return;
      }
      cleanup();
      if (data.type === "done") {
        const blob = new Blob([data.buffer], { type: data.mimeType });
        task.resolve({
          blob,
          targetUnreachableWarning: data.targetUnreachableWarning,
        });
      } else {
        task.reject(new Error(data.message));
      }
    };

    const onError = (err: ErrorEvent) => {
      cleanup();
      // Fall back to main thread if worker script fails under restricted runtime
      convertImageWithMeta(task.file, task.targetFormat, task.settings, task.onProgress)
        .then(task.resolve)
        .catch((fallbackErr) =>
          task.reject(
            fallbackErr instanceof Error
              ? fallbackErr
              : new Error(err.message || "Worker execution error")
          )
        );
    };

    idleWorker.addEventListener("message", onMessage);
    idleWorker.addEventListener("error", onError);
    idleWorker.postMessage({
      id: taskId,
      file: task.file,
      targetFormat: task.targetFormat,
      settings: task.settings,
    });
  }

  async convert(
    file: File,
    targetFormat: string,
    settings: ConversionSettings,
    onProgress?: (pct: number) => void
  ): Promise<ImageConversionResult> {
    const isHeic = /\.(heic|heif)$/i.test(file.name);
    if (!this.canUseWorkers() || isHeic || targetFormat.toLowerCase() === "pdf") {
      return convertImageWithMeta(file, targetFormat, settings, onProgress);
    }

    return new Promise<ImageConversionResult>((resolve, reject) => {
      this.queue.push({ file, targetFormat, settings, onProgress, resolve, reject });
      this.dispatchNext();
    });
  }
}

const sharedPool = new DedicatedImageWorkerPool();

/**
 * Executes image conversion inside a bounded OffscreenCanvas Web Worker pool
 * with automatic main-thread fallback for HEIC, PDF, or non-worker runtimes.
 */
export async function convertImageViaPool(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<ImageConversionResult> {
  return sharedPool.convert(file, targetFormat, settings, onProgress);
}
