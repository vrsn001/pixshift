import { describe, expect, it } from "vitest";
import {
  extractDroppedFileEntries,
  extractDroppedFiles,
  extractFolderPath,
  filterValidDroppedFiles,
  normalizeInputFileEntries,
  normalizeRelativePath,
} from "@/lib/utils/folderDrop";

describe("folderDrop utilities", () => {
  it("test_filterValidDroppedFiles_excludes_hidden_dotfiles_and_zero_byte_files", () => {
    const valid = new File([new Uint8Array([1, 2, 3])], "nested.png", { type: "image/png" });
    const dotfile = new File([new Uint8Array([1, 2, 3])], ".DS_Store", { type: "" });
    const gitignore = new File(["node_modules"], ".gitignore", { type: "text/plain" });
    const empty = new File([], "empty.png", { type: "image/png" });

    const filtered = filterValidDroppedFiles([valid, dotfile, gitignore, empty]);
    expect(filtered.map((f) => f.name)).toEqual(["nested.png"]);
  });

  it("test_extractDroppedFiles_traverses_nested_directory_entries", async () => {
    const topFile = new File([new Uint8Array([1])], "top.png", { type: "image/png" });
    const nestedFile = new File([new Uint8Array([2])], "nested.png", { type: "image/png" });
    const dotFile = new File([new Uint8Array([3])], ".DS_Store", { type: "" });
    const emptyFile = new File([], "empty.png", { type: "image/png" });

    const subDirEntry = {
      isFile: false,
      isDirectory: true,
      name: "sub",
      createReader: () => {
        let called = false;
        return {
          readEntries: (cb: (entries: unknown[]) => void) => {
            if (!called) {
              called = true;
              cb([
                {
                  isFile: true,
                  isDirectory: false,
                  name: "nested.png",
                  file: (fCb: (f: File) => void) => fCb(nestedFile),
                },
              ]);
            } else {
              cb([]);
            }
          },
        };
      },
    };

    const rootDirEntry = {
      isFile: false,
      isDirectory: true,
      name: "folder-drop",
      createReader: () => {
        let pass = 0;
        return {
          readEntries: (cb: (entries: unknown[]) => void) => {
            if (pass === 0) {
              pass = 1;
              cb([
                subDirEntry,
                {
                  isFile: true,
                  isDirectory: false,
                  name: ".DS_Store",
                  file: (fCb: (f: File) => void) => fCb(dotFile),
                },
              ]);
            } else if (pass === 1) {
              pass = 2;
              cb([
                {
                  isFile: true,
                  isDirectory: false,
                  name: "empty.png",
                  file: (fCb: (f: File) => void) => fCb(emptyFile),
                },
                {
                  isFile: true,
                  isDirectory: false,
                  name: "top.png",
                  file: (fCb: (f: File) => void) => fCb(topFile),
                },
              ]);
            } else {
              cb([]);
            }
          },
        };
      },
    };

    const fakeDataTransfer = {
      items: [
        {
          webkitGetAsEntry: () => rootDirEntry,
          getAsFile: () => null,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    const result = await extractDroppedFiles(fakeDataTransfer);
    expect(result.map((f) => f.name).sort()).toEqual(["nested.png", "top.png"]);

    const entryResult = await extractDroppedFileEntries(fakeDataTransfer);
    expect(
      entryResult
        .map((e) => ({ relativePath: e.relativePath, folderPath: e.folderPath }))
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    ).toEqual([
      { relativePath: "folder-drop/sub/nested.png", folderPath: "folder-drop/sub" },
      { relativePath: "folder-drop/top.png", folderPath: "folder-drop" },
    ]);
  });

  it("normalizes relative paths, handles fullPath and webkitRelativePath, and filters dot-segments", async () => {
    expect(normalizeRelativePath("\\photos\\day1\\..\\img.png/")).toBe("photos/day1/img.png");
    expect(normalizeRelativePath("/root.png")).toBe("root.png");
    expect(extractFolderPath("photos/day1/img.png")).toBe("photos/day1");
    expect(extractFolderPath("root.png")).toBe("");

    const rootFile = new File([new Uint8Array([1])], "root.png", { type: "image/png" });
    const nestedFile = new File([new Uint8Array([2])], "shot.jpg", { type: "image/jpeg" });
    const hiddenDirFile = new File([new Uint8Array([3])], "secret.png", { type: "image/png" });
    const zeroFile = new File([], "empty.jpg", { type: "image/jpeg" });

    Object.defineProperty(nestedFile, "webkitRelativePath", {
      value: "vacation\\day1\\shot.jpg",
      configurable: true,
    });
    Object.defineProperty(hiddenDirFile, "webkitRelativePath", {
      value: "vacation/.git/secret.png",
      configurable: true,
    });

    expect(
      normalizeInputFileEntries([rootFile, nestedFile, hiddenDirFile, zeroFile]).map((e) => ({
        name: e.file.name,
        relativePath: e.relativePath,
        folderPath: e.folderPath,
      }))
    ).toEqual([
      { name: "root.png", relativePath: "root.png", folderPath: "" },
      { name: "shot.jpg", relativePath: "vacation/day1/shot.jpg", folderPath: "vacation/day1" },
    ]);

    const dtWithFullPath = {
      items: [
        {
          webkitGetAsEntry: () => ({
            isFile: true,
            isDirectory: false,
            name: "shot.jpg",
            fullPath: "/album/sub/shot.jpg",
            file: (cb: (f: File) => void) => cb(nestedFile),
          }),
        },
        {
          webkitGetAsEntry: () => ({
            isFile: true,
            isDirectory: false,
            name: "root.png",
            fullPath: "/root.png",
            file: (cb: (f: File) => void) => cb(rootFile),
          }),
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    const fullPathEntries = await extractDroppedFileEntries(dtWithFullPath);
    expect(fullPathEntries.map((e) => [e.relativePath, e.folderPath])).toEqual([
      ["album/sub/shot.jpg", "album/sub"],
      ["root.png", ""],
    ]);

    const dtFallback = {
      items: [],
      files: [rootFile, nestedFile, zeroFile],
    } as unknown as DataTransfer;
    const fallbackEntries = await extractDroppedFileEntries(dtFallback);
    expect(fallbackEntries.map((e) => [e.relativePath, e.folderPath])).toEqual([
      ["root.png", ""],
      ["vacation/day1/shot.jpg", "vacation/day1"],
    ]);
  });
});
