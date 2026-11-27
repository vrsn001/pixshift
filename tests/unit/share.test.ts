import { describe, expect, it } from "vitest";

describe("anonymous encrypted output sharing & QR", () => {
  it("encrypts and decrypts payload with AES-256-GCM and rejects wrong keys or tampering", async () => {
    const { encryptSharePayload, decryptSharePayload } = await import("@/lib/share/crypto");
    const sampleBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]);

    const encrypted = await encryptSharePayload(sampleBytes, {
      name: "secret-photo.png",
      mime: "image/png",
      size: sampleBytes.byteLength,
    });

    expect(encrypted.keyBase64Url.length).toBeGreaterThan(20);
    // Ciphertext must not contain plaintext filename
    expect(Buffer.from(encrypted.cipherBytes).includes(Buffer.from("secret-photo.png"))).toBe(false);

    const restored = await decryptSharePayload(encrypted.cipherBytes, encrypted.keyBase64Url);
    expect(restored.meta).toEqual({
      name: "secret-photo.png",
      mime: "image/png",
      size: sampleBytes.byteLength,
    });
    expect([...restored.data]).toEqual([...sampleBytes]);

    // Wrong key must reject
    const alt = await encryptSharePayload(sampleBytes, {
      name: "other.png",
      mime: "image/png",
      size: sampleBytes.byteLength,
    });
    await expect(
      decryptSharePayload(encrypted.cipherBytes, alt.keyBase64Url)
    ).rejects.toThrow();

    // Tampered ciphertext must reject
    const tampered = new Uint8Array(encrypted.cipherBytes);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    await expect(decryptSharePayload(tampered, encrypted.keyBase64Url)).rejects.toThrow();
  });

  it("enforces 25 MB limit in share storage validation and generates valid SVG QR", async () => {
    const { MAX_SHARE_BYTES } = await import("@/lib/share/storage");
    const { encodeQrSvg } = await import("@/lib/share/qr");

    expect(MAX_SHARE_BYTES).toBe(25 * 1024 * 1024);

    const svg = encodeQrSvg("https://pixyshift.vercel.app/s/demo#k=abc123");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<path");
  });
});
