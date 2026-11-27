import { describe, expect, it } from "vitest";
import { extractDroppedFiles, filterValidDroppedFiles } from "@/lib/utils/folderDrop";

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
  });
});
