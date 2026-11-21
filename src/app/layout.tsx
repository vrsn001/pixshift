import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pixyshift.vercel.app"),
  title: {
    default: "Pixshift — Universal In-Browser File Converter (Free & Private)",
    template: "%s | Pixshift",
  },
  description:
    "Convert any image, video, audio, or PDF directly in your browser. 100% private, zero uploads, zero server tracking, no daily limits — powered by WebAssembly.",
  keywords: [
    "file converter",
    "image converter",
    "video converter",
    "audio converter",
    "pdf converter",
    "webp converter",
    "cloudconvert alternative",
    "free online converter",
    "client-side file converter",
    "heic to png",
    "mp4 to mp3",
    "video to gif",
    "merge images to pdf",
    "ffmpeg wasm",
  ],
  authors: [{ name: "Laksh Rohilla", url: "https://github.com/vrsn001" }],
  creator: "Laksh Rohilla",
  publisher: "Pixshift",
  alternates: {
    canonical: "https://pixyshift.vercel.app",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://pixyshift.vercel.app",
    siteName: "Pixshift",
    title: "Pixshift — Convert Any File to Anything",
    description:
      "100% browser-based, zero uploads, unlimited and free forever. Convert images, videos, audio, and documents locally on your device.",
    images: [
      {
        url: "/logo.svg",
        width: 1200,
        height: 630,
        alt: "Pixshift — Universal In-Browser File Converter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pixshift — Universal In-Browser File Converter",
    description: "Convert any file locally with WebAssembly. 100% private, zero server uploads, free forever.",
    creator: "@lakshayyy",
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": "https://pixyshift.vercel.app/#app",
        "name": "Pixshift",
        "url": "https://pixyshift.vercel.app",
        "applicationCategory": "MultimediaApplication",
        "operatingSystem": "All",
        "browserRequirements": "Requires WebAssembly and HTML5 Canvas support",
        "description": "Universal in-browser file converter supporting Images (WebP, PNG, JPEG, AVIF, HEIC, SVG), Video (MP4, WebM, GIF), Audio (MP3, WAV, AAC), and PDF documents with zero server uploads.",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
        "author": {
          "@type": "Person",
          "name": "Laksh Rohilla",
          "url": "https://github.com/vrsn001",
        },
      },
      {
        "@type": "FAQPage",
        "@id": "https://pixyshift.vercel.app/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Do my files ever get uploaded to a server?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Never. Pixshift operates 100% locally on your computer inside your browser using WebAssembly and HTML5 Canvas. Your files never touch external servers.",
            },
          },
          {
            "@type": "Question",
            "name": "Is there any file size limit or daily quota?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Pixshift is unlimited and free forever with no credit quotas or artificial paywalls.",
            },
          },
          {
            "@type": "Question",
            "name": "How does Pixshift convert video and audio without a server?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Pixshift runs WebAssembly-compiled FFmpeg inside dedicated Web Workers, enabling full-powered transcoding directly on your device CPU.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I convert multiple images into a single PDF document?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes, Pixshift includes a 'Merge images to single PDF' feature that compiles multiple selected images into a single ordered PDF file.",
            },
          },
        ],
      },
    ],
  };

  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} dark`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-body bg-[#0a0a0b] text-[#f0efe9] selection:bg-[#c8f03c] selection:text-[#0a0a0b]">
        {children}
      </body>
    </html>
  );
}
