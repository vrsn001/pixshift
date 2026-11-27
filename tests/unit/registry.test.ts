import { describe, expect, it } from "vitest";
import { AVAILABLE_TARGETS } from "@/lib/converters/registry";

describe("converter format registry", () => {
  it("test_document_targets_exclude_pdf", () => {
    expect(AVAILABLE_TARGETS.document).toEqual(["png", "jpeg"]);
    expect(AVAILABLE_TARGETS.document).not.toContain("pdf");
  });

  it("test_image_targets_include_pdf_bmp_ico_avif", () => {
    expect(AVAILABLE_TARGETS.image).toEqual(
      expect.arrayContaining(["webp", "png", "jpeg", "avif", "bmp", "ico", "pdf"])
    );
  });
});
