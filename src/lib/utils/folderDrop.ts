interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
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
 * Excludes hidden dotfiles (e.g. `.DS_Store`) and 0-byte empty placeholder files.
 */
export function filterValidDroppedFiles(files: File[]): File[] {
  return files.filter((file) => !file.name.startsWith(".") && file.size > 0);
}

async function readDirectoryBatch(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function traverseEntry(entry: FileSystemEntryLike, collected: File[]): Promise<void> {
  if (entry.name.startsWith(".")) {
    return;
  }

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntryLike;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    collected.push(file);
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntryLike;
    const reader = dirEntry.createReader();

    // Spec requires looping readEntries() until empty array because browsers batch directory entries
    while (true) {
      const batch = await readDirectoryBatch(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        await traverseEntry(child, collected);
      }
    }
  }
}

/**
 * Extracts all dropped files from DataTransfer, recursively traversing dropped folders
 * via webkitGetAsEntry() and filtering hidden dotfiles / zero-byte files.
 */
export async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries = items
    .map((item) => {
      const candidate = item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null };
      return candidate.webkitGetAsEntry?.() ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length > 0) {
    const collected: File[] = [];
    for (const entry of entries) {
      await traverseEntry(entry, collected);
    }
    return filterValidDroppedFiles(collected);
  }

  const fallbackFiles = dataTransfer.files ? Array.from(dataTransfer.files) : [];
  return filterValidDroppedFiles(fallbackFiles);
}
