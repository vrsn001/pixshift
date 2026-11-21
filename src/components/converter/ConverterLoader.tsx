"use client";

import dynamic from "next/dynamic";

const ConverterWorkspace = dynamic(
  () => import("@/components/converter/ConverterWorkspace").then((m) => m.ConverterWorkspace),
  { ssr: false }
);

export function ConverterLoader() {
  return <ConverterWorkspace />;
}
