export interface ConcurrentPoolOptions {
  signal?: AbortSignal;
}

function createAbortError(message = "Operation aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/**
 * Runs `workerFn` across `items` using a bounded work-stealing pool of at most
 * `concurrency` parallel workers, preserving exact input index order.
 */
export async function runConcurrentPool<T, R>(
  items: readonly T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>,
  options?: ConcurrentPoolOptions
): Promise<R[]> {
  const signal = options?.signal;
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (items.length === 0) {
    return [];
  }

  const rawConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1;
  const limit = Math.max(1, Math.min(items.length, rawConcurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let abortedOrFailed = false;

  const runWorker = async (): Promise<void> => {
    while (!abortedOrFailed) {
      if (signal?.aborted) {
        abortedOrFailed = true;
        throw createAbortError();
      }

      const current = nextIndex++;
      if (current >= items.length) {
        return;
      }

      const item = items[current] as T;
      try {
        const value = await workerFn(item, current);
        results[current] = value;
      } catch (err) {
        abortedOrFailed = true;
        throw err;
      }
    }
  };

  const workersPromise = Promise.all(
    Array.from({ length: limit }, () => runWorker())
  ).then(() => results);

  if (!signal) {
    return workersPromise;
  }

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      abortedOrFailed = true;
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([workersPromise, abortPromise]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export interface BatchedUpdater<T> {
  enqueue: (item: T) => void;
  enqueueMany: (items: readonly T[]) => void;
  flush: () => void;
  cancel: () => void;
  dispose: () => void;
  pendingCount: () => number;
}

/**
 * Coalesces rapid progress/state updates into periodic `setTimeout` flushes.
 * Safe in both Node (Vitest) and browser environments.
 */
export function createBatchedUpdater<T>(
  flushFn: (items: T[]) => void,
  intervalMs = 50
): BatchedUpdater<T> {
  const delay = Number.isFinite(intervalMs) ? Math.max(0, intervalMs) : 50;
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearScheduledTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearScheduledTimer();
    if (queue.length === 0) {
      return;
    }
    const batch = queue;
    queue = [];
    flushFn(batch);
  };

  const scheduleFlush = () => {
    if (timer === null && !disposed) {
      timer = setTimeout(flush, delay);
    }
  };

  const enqueue = (item: T) => {
    if (disposed) {
      return;
    }
    queue.push(item);
    scheduleFlush();
  };

  const enqueueMany = (items: readonly T[]) => {
    if (disposed || items.length === 0) {
      return;
    }
    for (const item of items) {
      queue.push(item);
    }
    scheduleFlush();
  };

  const cancel = () => {
    clearScheduledTimer();
    queue = [];
  };

  const dispose = () => {
    disposed = true;
    cancel();
  };

  const pendingCount = () => queue.length;

  return {
    enqueue,
    enqueueMany,
    flush,
    cancel,
    dispose,
    pendingCount,
  };
}
