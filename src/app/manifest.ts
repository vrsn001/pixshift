import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pixshift — Universal In-Browser File Converter",
    short_name: "Pixshift",
    description:
      "Convert images, videos, audio, OCR, and PDFs directly in your browser. 100% private, anonymous, free forever.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    file_handlers: [
      {
        action: "/",
        accept: {
          "image/*": [".png", ".jpg", ".jpeg", ".webp", ".avif", ".bmp", ".ico", ".heic", ".heif"],
          "video/*": [".mp4", ".webm", ".mkv", ".mov", ".avi", ".gif"],
          "audio/*": [".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac"],
          "application/pdf": [".pdf"],
        },
      },
    ],
    share_target: {
      action: "/",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: ["image/*", "video/*", "audio/*", "application/pdf"],
          },
        ],
      },
    },
  };
}
