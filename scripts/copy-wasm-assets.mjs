import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const assets = [
  {
    src: path.join(projectRoot, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.js"),
    dest: path.join(projectRoot, "public", "ffmpeg", "ffmpeg-core.js"),
  },
  {
    src: path.join(projectRoot, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.wasm"),
    dest: path.join(projectRoot, "public", "ffmpeg", "ffmpeg-core.wasm"),
  },
  {
    src: path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "worker.js"),
    dest: path.join(projectRoot, "public", "ffmpeg", "worker.js"),
  },
  {
    src: path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "const.js"),
    dest: path.join(projectRoot, "public", "ffmpeg", "const.js"),
  },
  {
    src: path.join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "errors.js"),
    dest: path.join(projectRoot, "public", "ffmpeg", "errors.js"),
  },
  {
    src: path.join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    dest: path.join(projectRoot, "public", "pdfjs", "pdf.worker.min.mjs"),
  },
];

for (const { src, dest } of assets) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required WASM/worker asset: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log(`Synced ${assets.length} self-hosted WASM/worker assets.`);
