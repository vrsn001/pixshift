import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
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
    default: "Pixshift — Client-Side Image, Video, Audio & PDF Converter",
    template: "%s | Pixshift",
  },
  description:
    "Convert images, video, audio, and PDFs directly in your browser. Your files stay on your disk with WebAssembly FFmpeg, WebCodecs, Canvas, and PDF processing.",
  keywords: [
    "file converter",
    "image converter",
    "video converter",
    "audio converter",
    "pdf converter",
    "webp converter",
    "exif stripper",
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
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://pixyshift.vercel.app",
    siteName: "Pixshift",
    title: "Pixshift — Convert Images, Video, Audio & PDFs on Your Device",
    description:
      "Runs in your browser using WebAssembly, WebCodecs, and Canvas. Nothing gets uploaded because your browser does the work.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pixshift — Client-Side File Converter",
    description: "Convert images, video, audio, and PDFs directly in your browser. Nothing gets uploaded.",
    creator: "@lakshayyy",
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
        "description":
          "Client-side media and document converter supporting Images (WebP, PNG, JPEG, AVIF, BMP, ICO, HEIC), Video (MP4, WebM, GIF), Audio (MP3, WAV, AAC), and PDF documents directly in your browser.",
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
              "text":
                "Never. Pixshift operates locally inside your browser using WebAssembly, WebCodecs, and HTML5 Canvas. Your files stay on your device.",
            },
          },
          {
            "@type": "Question",
            "name": "Is there any file size limit or daily quota?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "No. Pixshift has no artificial file-count caps or paywalls. The practical ceiling is your browser's available memory.",
            },
          },
          {
            "@type": "Question",
            "name": "How does Pixshift convert video and audio without a server?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Pixshift uses browser hardware WebCodecs where supported and a self-hosted WebAssembly FFmpeg engine directly inside your browser tab.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I convert multiple images into a single PDF document?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Yes. Add multiple images targeting PDF and enable the 'Merge images to single PDF' toggle in the action toolbar.",
            },
          },
        ],
      },
    ],
  };

  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable} dark`}>
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
