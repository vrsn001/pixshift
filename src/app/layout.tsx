import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pixshift — Universal In-Browser File Converter (Free & Private)",
  description: "Convert any image, video, audio, or document format directly in your browser. 100% private, zero uploads, no file size limits — powered by WebAssembly.",
  keywords: ["file converter", "image converter", "video converter", "audio converter", "webp converter", "cloudconvert alternative", "client side converter", "ffmpeg wasm"],
  authors: [{ name: "Laksh Rohilla", url: "https://github.com/vrsn001" }],
  openGraph: {
    title: "Pixshift — Universal In-Browser File Converter",
    description: "Convert any file into anything. 100% private and in-browser with zero server uploads.",
    url: "https://pixshift.vercel.app",
    siteName: "Pixshift",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300">
        <div className="ambient-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
