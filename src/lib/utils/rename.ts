import type { RenameSettings } from "@/types/converter";

export interface RenameContext {
  originalName: string;
  targetFormat: string;
  index?: number;
  folderPath?: string;
  width?: number | null;
  height?: number | null;
  date?: Date | string;
  settings?: RenameSettings | null;
  pageNumber?: number;
}

export type RenameCandidate = RenameContext;

const WINDOWS_RESERVED_NAME_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const MAX_STEM_LENGTH = 200;

function stripControlChars(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 32 && code !== 127) {
      out += input[i] ?? "";
    }
  }
  return out;
}

function normalizeTargetExtension(targetFormat: string): string {
  const cleaned = targetFormat
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : "bin";
}

function normalizeFolderScopePath(folderPath?: string): string {
  if (!folderPath) return "";
  return folderPath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .join("/");
}

function extractOriginalStem(originalName: string): string {
  const normalized = originalName.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  const lastDot = base.lastIndexOf(".");
  return lastDot > 0 ? base.slice(0, lastDot) : base;
}

function formatUtcDate(dateInput?: Date | string): string {
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const parsed =
    dateInput instanceof Date
      ? dateInput
      : dateInput !== undefined
        ? new Date(dateInput)
        : new Date();
  const valid = !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return valid.toISOString().slice(0, 10);
}

function stripTrailingExtension(stem: string, ext: string): string {
  const suffix = `.${ext}`.toLowerCase();
  let current = stem;
  while (current.toLowerCase().endsWith(suffix)) {
    current = current.slice(0, current.length - suffix.length);
  }
  return current;
}

/**
 * Sanitizes a single filename or folder segment by stripping ASCII control characters,
 * replacing invalid OS filename characters, neutralizing `..` traversal, trimming
 * outer whitespace/dots, and guarding Windows reserved device names.
 */
export function sanitizeFilenameSegment(raw: string): string {
  let cleaned = stripControlChars(raw)
    .replace(/(?:\.\.[\\/])+/g, "")
    .replace(/(?:[\\/]\.\.)+/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\.{2,}/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");

  if (cleaned.length > MAX_STEM_LENGTH) {
    cleaned = cleaned.slice(0, MAX_STEM_LENGTH).replace(/[\s.]+$/g, "");
  }

  const reservedMatch = WINDOWS_RESERVED_NAME_RE.exec(cleaned);
  if (reservedMatch) {
    const base = reservedMatch[1] ?? cleaned;
    const rest = reservedMatch[2] ?? "";
    cleaned = `${base}_${rest}`;
  }

  return cleaned;
}

function formatFolderToken(folderPath?: string): string {
  const normalized = normalizeFolderScopePath(folderPath);
  if (!normalized) return "";
  return normalized
    .split("/")
    .map((segment) => sanitizeFilenameSegment(segment))
    .filter((segment) => segment.length > 0)
    .join("_");
}

/**
 * Formats a deterministic, sanitized output filename (including `.ext`) using
 * Pixshift rename tokens, optional prefix/suffix, and optional page number.
 */
export function formatOutputFilename(ctx: RenameContext): string {
  const ext = normalizeTargetExtension(ctx.targetFormat);
  const rawStem = extractOriginalStem(ctx.originalName);
  const safeOriginalStem = sanitizeFilenameSegment(rawStem) || "file";
  const settings = ctx.settings;

  const hasValidPage =
    ctx.pageNumber !== undefined && Number.isFinite(ctx.pageNumber) && ctx.pageNumber >= 1;
  const pageSuffix = hasValidPage ? `_page_${Math.floor(ctx.pageNumber as number)}` : "";

  if (!settings?.enabled) {
    const stemWithPage = sanitizeFilenameSegment(`${safeOriginalStem}${pageSuffix}`) || "file";
    return `${stemWithPage}.${ext}`;
  }

  const rawPattern = settings.pattern.trim() || "{name}";
  const hasIndexToken = /\{index(?::\d+)?\}/i.test(rawPattern);
  const rawIndex = ctx.index ?? settings.startIndex ?? 1;
  const effectiveIndex = Math.max(0, Math.floor(Number.isFinite(rawIndex) ? rawIndex : 1));
  const rawPad = settings.zeroPad ?? 1;
  const defaultPad = Math.min(12, Math.max(1, Math.floor(Number.isFinite(rawPad) ? rawPad : 1)));

  const folderToken = formatFolderToken(ctx.folderPath);
  const widthToken =
    ctx.width != null && Number.isFinite(ctx.width) && ctx.width > 0
      ? String(Math.round(ctx.width))
      : "";
  const heightToken =
    ctx.height != null && Number.isFinite(ctx.height) && ctx.height > 0
      ? String(Math.round(ctx.height))
      : "";
  const dateToken = formatUtcDate(ctx.date);

  const expandedPattern = rawPattern.replace(
    /\{(index(?::(\d+))?|name|format|ext|folder|width|height|date)\}/gi,
    (fullMatch, tokenName: string, padDigits?: string) => {
      const lower = tokenName.toLowerCase();
      if (lower.startsWith("index")) {
        const pad = padDigits
          ? Math.min(12, Math.max(1, Number.parseInt(padDigits, 10) || defaultPad))
          : defaultPad;
        return String(effectiveIndex).padStart(pad, "0");
      }
      switch (lower) {
        case "name":
          return safeOriginalStem;
        case "format":
        case "ext":
          return ext;
        case "folder":
          return folderToken;
        case "width":
          return widthToken;
        case "height":
          return heightToken;
        case "date":
          return dateToken;
        default:
          return fullMatch;
      }
    }
  );

  const patternWithoutDupExt = stripTrailingExtension(expandedPattern, ext);
  const combined = `${settings.prefix ?? ""}${patternWithoutDupExt}${settings.suffix ?? ""}`;
  const combinedWithoutDupExt = stripTrailingExtension(combined, ext);
  const withPage =
    hasValidPage && !hasIndexToken
      ? `${combinedWithoutDupExt}${pageSuffix}`
      : combinedWithoutDupExt;

  const finalStem = sanitizeFilenameSegment(withPage) || "file";
  return `${finalStem}.${ext}`;
}

/**
 * Resolves output filenames for an ordered batch with case-insensitive collision
 * deduplication (`base (N).ext`), scoped per folder when `preserveFolderScope` is
 * true or globally when false.
 */
export function resolveBatchOutputNames(
  items: readonly RenameCandidate[],
  preserveFolderScope: boolean
): string[] {
  const usedKeys = new Set<string>();
  const resolved: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const startIndex = item.settings?.startIndex ?? 1;
    const effectiveIndex = item.index ?? startIndex + i;
    const candidate = formatOutputFilename({ ...item, index: effectiveIndex });

    const scopeFolder = preserveFolderScope ? normalizeFolderScopePath(item.folderPath) : "";
    const makeKey = (name: string): string =>
      scopeFolder ? `${scopeFolder.toLowerCase()}/${name.toLowerCase()}` : name.toLowerCase();

    if (!usedKeys.has(makeKey(candidate))) {
      usedKeys.add(makeKey(candidate));
      resolved.push(candidate);
      continue;
    }

    const lastDot = candidate.lastIndexOf(".");
    const hasExt = lastDot > 0 && lastDot < candidate.length - 1;
    const base = hasExt ? candidate.slice(0, lastDot) : candidate;
    const extWithDot = hasExt ? candidate.slice(lastDot) : "";

    let counter = 1;
    while (usedKeys.has(makeKey(`${base} (${counter})${extWithDot}`))) {
      counter++;
    }

    const uniqueName = `${base} (${counter})${extWithDot}`;
    usedKeys.add(makeKey(uniqueName));
    resolved.push(uniqueName);
  }

  return resolved;
}
