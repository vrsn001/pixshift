import type { Metadata } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pixshift — Convert Anything Locally (Acid Edition)",
  description: "Convert any image, video, audio, or document format directly in your browser. 100% private, zero uploads, no file size limits — powered by WebAssembly.",
  keywords: ["file converter", "image converter", "video converter", "audio converter", "webp converter", "cloudconvert alternative", "client side converter", "ffmpeg wasm"],
  authors: [{ name: "Laksh Rohilla", url: "https://github.com/vrsn001" }],
  openGraph: {
    title: "Pixshift — Convert Anything",
    description: "100% browser-based, zero uploads, free forever. Multi-format conversion studio.",
    url: "https://pixyshift.vercel.app",
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
    <html lang="en" className={`${syne.variable} ${dmSans.variable} dark`}>
      <body className="min-h-screen flex flex-col font-body bg-[#0a0a0b] text-[#f0efe9] selection:bg-[#c8f03c] selection:text-[#0a0a0b]">
        {children}
      </body>
    </html>
  );
}
