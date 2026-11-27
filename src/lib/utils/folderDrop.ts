import type { DroppedFileEntry } from "@/types/converter";

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  isFile: true;
  file: (successCallback: (file: File) => void, errorCallback?: (err: unknown) => void) => void;
}

interface FileSystemDirectoryReaderLike {
  readEntries: (
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (err: unknown) => void
  ) => void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  isDirectory: true;
  createReader: () => FileSystemDirectoryReaderLike;
}

/**
 * Normalizes relative paths from drag-and-drop `fullPath` or `webkitRelativePath`
 * into clean `/` separated paths with no leading/trailing slashes or dot traversal segments.
 */
export function normalizeRelativePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  return segments.join("/");
}

/**
 * Extracts the parent folder path from a relative path, returning `""` for root files.
 */
export function extractFolderPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : "";
}

function hasHiddenPathSegment(normalizedRelativePath: string): boolean {
  if (!normalizedRelativePath) return true;
  return normalizedRelativePath.split("/").some((segment) => segment.startsWith("."));
}

/**
 * Excludes hidden dotfiles (e.g. `.DS_Store`) and 0-byte empty placeholder files.
 */
export function filterValidDroppedFiles(files: File[]): File[] {
  return files.filter((file) => !file.name.startsWith(".") && file.size > 0);
}

/**
 * Normalizes FileList or File[] (including `<input webkitdirectory>` files) into
 * `DroppedFileEntry` records with normalized `relativePath` and `folderPath`.
 */
export function normalizeInputFileEntries(
  files: readonly File[] | FileList
): DroppedFileEntry[] {
  const result: DroppedFileEntry[] = [];
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    if (file.name.startsWith(".") || file.size <= 0) {
      continue;
    }

    const rawRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const sourcePath =
      typeof rawRelative === "string" && rawRelative.trim().length > 0
        ? rawRelative
        : file.name;
    const relativePath = normalizeRelativePath(sourcePath);

    if (!relativePath || hasHiddenPathSegment(relativePath)) {
      continue;
    }

    result.push({
      file,
      relativePath,
      folderPath: extractFolderPath(relativePath),
    });
  }

  return result;
}

async function readDirectoryBatch(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function traverseEntry(
  entry: FileSystemEntryLike,
  parentFolder: string,
  collected: DroppedFileEntry[]
): Promise<void> {
  if (entry.name.startsWith(".")) {
    return;
  }

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntryLike;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    if (file.name.startsWith(".") || file.size <= 0) {
      return;
    }

    const fromFullPath = entry.fullPath ? normalizeRelativePath(entry.fullPath) : "";
    const fallbackName = entry.name || file.name;
    const fallbackPath = normalizeRelativePath(
      parentFolder ? `${parentFolder}/${fallbackName}` : fallbackName
    );
    const relativePath = fromFullPath || fallbackPath;

    if (!relativePath || hasHiddenPathSegment(relativePath)) {
      return;
    }

    collected.push({
      file,
      relativePath,
      folderPath: extractFolderPath(relativePath),
    });
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntryLike;
    const fromFullPath = entry.fullPath ? normalizeRelativePath(entry.fullPath) : "";
    if (fromFullPath && hasHiddenPathSegment(fromFullPath)) {
      return;
    }

    const nextFolder =
      fromFullPath ||
      normalizeRelativePath(parentFolder ? `${parentFolder}/${entry.name}` : entry.name);
    if (nextFolder && hasHiddenPathSegment(nextFolder)) {
      return;
    }

    const reader = dirEntry.createReader();

    // Spec requires looping readEntries() until empty array because browsers batch directory entries
    while (true) {
      const batch = await readDirectoryBatch(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        await traverseEntry(child, nextFolder, collected);
      }
    }
  }
}

/**
 * Extracts dropped files along with normalized relative paths and folder paths,
 * recursively traversing dropped folders via `webkitGetAsEntry()` or falling back
 * to `dataTransfer.files`.
 */
export async function extractDroppedFileEntries(
  dataTransfer: DataTransfer
): Promise<DroppedFileEntry[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries = items
    .map((item) => {
      const candidate = item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null };
      return candidate.webkitGetAsEntry?.() ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length > 0) {
    const collected: DroppedFileEntry[] = [];
    for (const entry of entries) {
      await traverseEntry(entry, "", collected);
    }
    return collected;
  }

  const fallbackFiles = dataTransfer.files ? Array.from(dataTransfer.files) : [];
  return normalizeInputFileEntries(fallbackFiles);
}

/**
 * Extracts all dropped files from DataTransfer, recursively traversing dropped folders
 * via webkitGetAsEntry() and filtering hidden dotfiles / zero-byte files.
 */
export async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = await extractDroppedFileEntries(dataTransfer);
  return entries.map((entry) => entry.file);
}
