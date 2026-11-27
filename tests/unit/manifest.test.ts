import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("exposes standalone mode, file_handlers, and share_target for OS integration", () => {
    const data = manifest() as unknown as Record<string, unknown>;
    expect(data.name).toContain("Pixshift");
    expect(data.display).toBe("standalone");
    expect(Array.isArray(data.file_handlers)).toBe(true);
    const handlers = data.file_handlers as { accept?: Record<string, string[]> }[];
    expect(handlers.length).toBeGreaterThanOrEqual(1);
    const acceptKeys = Object.keys(handlers[0]?.accept ?? {});
    expect(acceptKeys).toEqual(
      expect.arrayContaining(["image/*", "video/*", "audio/*", "application/pdf"])
    );
    expect(data.share_target).toBeDefined();
  });
});
