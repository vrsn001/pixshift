"use client";

import React from "react";
import NumberFlow from "@number-flow/react";

interface SavingsTelemetryProps {
  totalInputBytes: number;
  totalOutputBytes: number;
  completedCount: number;
}

export function SavingsTelemetry({
  totalInputBytes,
  totalOutputBytes,
  completedCount,
}: SavingsTelemetryProps) {
  if (completedCount === 0 || totalInputBytes <= 0) {
    return null;
  }

  const savedBytes = totalInputBytes - totalOutputBytes;
  const isSaved = savedBytes >= 0;
  const absBytes = Math.abs(savedBytes);
  const useMb = absBytes >= 1024 * 1024;
  const displayValue = useMb ? Number((absBytes / (1024 * 1024)).toFixed(2)) : Number((absBytes / 1024).toFixed(1));
  const unitLabel = useMb ? " MB" : " KB";

  const pctDelta = Math.abs(Math.round((savedBytes / totalInputBytes) * 100));

  return (
    <div
      data-testid="batch-savings-telemetry"
      className="flex flex-wrap items-center gap-3 px-3.5 py-2 rounded-lg bg-[#0a0a0b] border border-white/[0.08] font-mono text-xs tabular-nums"
    >
      <span className="text-[10px] tracking-widest uppercase text-[#8a8980]">03 // TELEMETRY</span>
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
    </div>
  );
}
