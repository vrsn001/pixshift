import { afterEach, describe, expect, it, vi } from "vitest";
import { createBatchedUpdater, runConcurrentPool } from "@/lib/utils/concurrency";

describe("concurrency utilities", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves exact input order even when worker completion times invert", async () => {
    const items = [40, 10, 30, 5, 20];
    const output = await runConcurrentPool(items, 3, async (delayMs, idx) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return `${idx}:${delayMs}`;
    });

    expect(output).toEqual(["0:40", "1:10", "2:30", "3:5", "4:20"]);
  });

  it("never exceeds the configured concurrency cap and handles empty or <=0 limits", async () => {
    expect(await runConcurrentPool([], 4, async () => 1)).toEqual([]);

    let active = 0;
    let peak = 0;
    const result = await runConcurrentPool([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);

    let sequentialPeak = 0;
    let sequentialActive = 0;
    const seqResult = await runConcurrentPool([1, 2, 3], 0, async (item) => {
      sequentialActive += 1;
      sequentialPeak = Math.max(sequentialPeak, sequentialActive);
      await Promise.resolve();
      sequentialActive -= 1;
      return item;
    });

    expect(sequentialPeak).toBe(1);
    expect(seqResult).toEqual([1, 2, 3]);
  });

  it("fails fast on worker errors and respects AbortSignal", async () => {
    let started = 0;
    await expect(
      runConcurrentPool([1, 2, 3, 4, 5], 1, async (item) => {
        started += 1;
        if (item === 2) {
          throw new Error("boom");
        }
        return item;
      })
    ).rejects.toThrow("boom");
    expect(started).toBe(2);

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      runConcurrentPool([1, 2], 2, async (x) => x, { signal: preAborted.signal })
    ).rejects.toMatchObject({ name: "AbortError" });

    const midController = new AbortController();
    const promise = runConcurrentPool(
      [1, 2, 3, 4],
      2,
      async (x) => {
        if (x === 1) {
          midController.abort();
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return x;
      },
      { signal: midController.signal }
    );
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("coalesces rapid updates with createBatchedUpdater and cleans up on cancel/dispose", () => {
    vi.useFakeTimers();
    const flushes: number[][] = [];
    const updater = createBatchedUpdater<number>((items) => {
      flushes.push(items);
    }, 50);

    for (let i = 0; i < 200; i++) {
      updater.enqueue(i);
    }
    expect(updater.pendingCount()).toBe(200);
    expect(flushes).toHaveLength(0);

    vi.advanceTimersByTime(50);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toHaveLength(200);
    expect(updater.pendingCount()).toBe(0);

    updater.enqueueMany([201, 202]);
    updater.flush();
    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual([201, 202]);

    updater.enqueue(300);
    updater.cancel();
    vi.advanceTimersByTime(100);
    expect(flushes).toHaveLength(2);
    expect(updater.pendingCount()).toBe(0);

    updater.dispose();
    updater.enqueue(400);
    vi.advanceTimersByTime(100);
    expect(flushes).toHaveLength(2);
  });
});
