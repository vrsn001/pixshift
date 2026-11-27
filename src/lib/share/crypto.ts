export interface ShareFileMetadata {
  name: string;
  mime: string;
  size: number;
}

export interface EncryptedSharePayload {
  cipherBytes: Uint8Array;
  keyBase64Url: string;
}

export interface DecryptedSharePayload {
  meta: ShareFileMetadata;
  data: Uint8Array;
}

const MAGIC_BYTES = new Uint8Array([0x50, 0x58, 0x45, 0x31]); // "PXE1"
const IV_LENGTH = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts file metadata + raw bytes locally with AES-256-GCM.
 * Returns opaque ciphertext prefixed with PXE1 + 12-byte IV, plus the exportable base64url key.
 */
export async function encryptSharePayload(
  fileBytes: Uint8Array,
  meta: ShareFileMetadata
): Promise<EncryptedSharePayload> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const metaJson = new TextEncoder().encode(JSON.stringify(meta));
  const plaintext = new Uint8Array(4 + metaJson.byteLength + fileBytes.byteLength);
  new DataView(plaintext.buffer).setUint32(0, metaJson.byteLength, false);
  plaintext.set(metaJson, 4);
  plaintext.set(fileBytes, 4 + metaJson.byteLength);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  const cipherBody = new Uint8Array(encryptedBuffer);

  const output = new Uint8Array(MAGIC_BYTES.byteLength + IV_LENGTH + cipherBody.byteLength);
  output.set(MAGIC_BYTES, 0);
  output.set(iv, MAGIC_BYTES.byteLength);
  output.set(cipherBody, MAGIC_BYTES.byteLength + IV_LENGTH);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    cipherBytes: output,
    keyBase64Url: toBase64Url(rawKey),
  };
}

/**
 * Decrypts a PXE1 AES-256-GCM envelope using the fragment key from URL `#k=...`.
 */
export async function decryptSharePayload(
  cipherBytes: Uint8Array,
  keyBase64Url: string
): Promise<DecryptedSharePayload> {
  if (cipherBytes.byteLength <= MAGIC_BYTES.byteLength + IV_LENGTH) {
    throw new Error("Encrypted payload is truncated or invalid.");
  }

  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (cipherBytes[i] !== MAGIC_BYTES[i]) {
      throw new Error("Unrecognized encrypted payload header.");
    }
  }

  const rawKey = fromBase64Url(keyBase64Url.trim());
  const keyBytes = rawKey.slice();
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const iv = cipherBytes.slice(MAGIC_BYTES.byteLength, MAGIC_BYTES.byteLength + IV_LENGTH);
  const body = cipherBytes.slice(MAGIC_BYTES.byteLength + IV_LENGTH);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    body
  );
  const plain = new Uint8Array(decryptedBuffer);
  if (plain.byteLength < 4) {
    throw new Error("Decrypted payload is malformed.");
  }

  const metaLen = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0, false);
  if (4 + metaLen > plain.byteLength) {
    throw new Error("Decrypted metadata header is invalid.");
  }

  const metaJson = new TextDecoder().decode(plain.slice(4, 4 + metaLen));
  const meta = JSON.parse(metaJson) as ShareFileMetadata;
  const data = plain.slice(4 + metaLen);
  return { meta, data };
}
