import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pixshift — Universal In-Browser File Converter",
    short_name: "Pixshift",
    description: "Convert images, videos, audio, and PDFs — all in your browser. 100% private, zero uploads, free forever.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
