import { ImageResponse } from "next/og";

export const alt = "Pixshift — Client-Side Media & Document Converter";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0b",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "76px",
          position: "relative",
        }}
      >
        {/* Top instrument hairline */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "#c8f03c",
            display: "flex",
          }}
        />

        {/* Brand mark & status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            marginBottom: 44,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="12" fill="#111113" stroke="rgba(255,255,255,0.16)" />
              <path d="M16 20C16 16.6863 18.6863 14 22 14H36L28 30H16V20Z" fill="#c8f03c" />
              <path d="M48 44C48 47.3137 45.3137 50 42 50H28L36 34H48V44Z" fill="#c8f03c" />
              <polygon points="34,18 48,18 40,34 26,34" fill="#f0efe9" opacity="0.9" />
              <polygon points="30,46 16,46 24,30 38,30" fill="#f03c8c" opacity="0.85" />
              <circle cx="32" cy="32" r="3" fill="#0a0a0b" stroke="#c8f03c" strokeWidth="2" />
            </svg>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>
              <div style={{ display: "flex", color: "#f0efe9" }}>Pix</div>
              <div style={{ display: "flex", color: "#c8f03c" }}>shift</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid rgba(96,165,250,0.4)",
              background: "rgba(37,99,235,0.15)",
              color: "#60a5fa",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            RUNS IN YOUR BROWSER
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 54,
            fontWeight: 800,
            color: "#f0efe9",
            lineHeight: 1.12,
            maxWidth: 920,
            marginBottom: 24,
          }}
        >
          <div>Convert images, video, audio, and PDFs</div>
          <div style={{ display: "flex", color: "#c8f03c" }}>on your device.</div>
        </div>

        {/* Subhead */}
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#9a9992",
            maxWidth: 820,
            lineHeight: 1.45,
          }}
        >
          Client-side WebCodecs, WebAssembly FFmpeg, Canvas, and PDF processing. Zero uploads.
        </div>

        {/* Format telemetry row */}
        <div style={{ display: "flex", gap: 12, marginTop: 44 }}>
          {["WebP", "AVIF", "BMP", "ICO", "MP4", "WebM", "MP3", "PDF"].map((f) => (
            <div
              key={f}
              style={{
                display: "flex",
                padding: "8px 18px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#111113",
                color: "#f0efe9",
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
