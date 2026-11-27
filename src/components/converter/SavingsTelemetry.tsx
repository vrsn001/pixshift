"use client";

import React from "react";
import NumberFlow from "@number-flow/react";
import type { BatchTelemetrySnapshot } from "@/types/converter";

interface SavingsTelemetryProps {
  totalInputBytes: number;
  totalOutputBytes: number;
  completedCount: number;
  telemetry?: BatchTelemetrySnapshot;
  isConverting?: boolean;
}

export function SavingsTelemetry({
  totalInputBytes,
  totalOutputBytes,
  completedCount,
  telemetry,
  isConverting = false,
}: SavingsTelemetryProps) {
  const activeCount = telemetry?.processingCount ?? 0;
  const totalCount = telemetry?.totalCount ?? completedCount;
  const overallPct = telemetry?.overallProgressPct ?? (completedCount > 0 ? 100 : 0);
  const zipPct = telemetry?.zipProgressPct ?? null;

  if (completedCount === 0 && !isConverting && activeCount === 0 && zipPct === null) {
    return null;
  }

  const savedBytes = totalInputBytes - totalOutputBytes;
  const isSaved = savedBytes >= 0;
  const absBytes = Math.abs(savedBytes);
  const useMb = absBytes >= 1024 * 1024;
  const displayValue = useMb
    ? Number((absBytes / (1024 * 1024)).toFixed(2))
    : Number((absBytes / 1024).toFixed(1));
  const unitLabel = useMb ? " MB" : " KB";

  const pctDelta =
    totalInputBytes > 0 ? Math.abs(Math.round((savedBytes / totalInputBytes) * 100)) : 0;

  const filesPerSec = telemetry?.filesPerSec ?? 0;
  const remainingCount = Math.max(0, totalCount - (telemetry?.completedCount ?? completedCount) - (telemetry?.errorCount ?? 0));
  const etaSec =
    isConverting && filesPerSec > 0 && remainingCount > 0
      ? Math.max(1, Math.round(remainingCount / filesPerSec))
      : null;

  return (
    <div
      data-testid="batch-savings-telemetry"
      className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#0a0a0b] border border-white/[0.08] font-mono text-xs tabular-nums"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] tracking-widest uppercase text-[#8a8980]">
          03 // TELEMETRY
        </span>

        {totalCount > 0 && (
          <span className="text-[#f0efe9]">
            <NumberFlow value={telemetry?.completedCount ?? completedCount} respectMotionPreference={true} />
            <span className="text-[#8a8980]">/{totalCount}</span>{" "}
            <span className="text-[#c8f03c] font-bold">
              (<NumberFlow value={overallPct} suffix="%" respectMotionPreference={true} />)
            </span>
          </span>
        )}

        {completedCount > 0 && totalInputBytes > 0 && (
          <>
            <span className="text-[#9a9992]">
              {isSaved ? "Saved" : "Delta"}:{" "}
              <span className={isSaved ? "text-[#c8f03c] font-bold" : "text-[#f03c8c] font-bold"}>
                <NumberFlow
                  value={displayValue}
                  suffix={unitLabel}
                  respectMotionPreference={true}
                />
              </span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                isSaved
                  ? "bg-[#c8f03c]/10 border-[#c8f03c]/40 text-[#c8f03c]"
                  : "bg-[#f03c8c]/10 border-[#f03c8c]/40 text-[#f03c8c]"
              }`}
            >
              {isSaved ? "-" : "+"}
              <NumberFlow value={pctDelta} suffix="%" respectMotionPreference={true} />
            </span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#9a9992]">
        {filesPerSec > 0 && (
          <span>
            <NumberFlow value={filesPerSec} respectMotionPreference={true} /> files/s
          </span>
        )}
        {telemetry && telemetry.mbPerSec > 0 && (
          <span>
            <NumberFlow value={telemetry.mbPerSec} respectMotionPreference={true} /> MB/s
          </span>
        )}
        {etaSec !== null && (
          <span className="text-[#60a5fa]">
            ETA <NumberFlow value={etaSec} suffix="s" respectMotionPreference={true} />
          </span>
        )}
        {zipPct !== null && (
          <span className="text-[#c8f03c] font-bold">
            ZIP <NumberFlow value={zipPct} suffix="%" respectMotionPreference={true} />
          </span>
        )}
      </div>
    </div>
  );
}
