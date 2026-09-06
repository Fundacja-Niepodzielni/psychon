import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sessionSecret } from "./config";

/**
 * Small authenticated-encryption envelope for cookie payloads (AES-256-GCM).
 * Keeps the token pair out of the cookie in plain text — the cookie is
 * already HttpOnly (no script on the page can read it), this adds that a
 * copied/leaked cookie value is not itself readable JSON.
 */

function key(): Buffer {
  return createHash("sha256").update(sessionSecret()).digest();
}

export function encode(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decode<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [ivPart, tagPart, dataPart] = parts;
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const data = Buffer.from(dataPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    // Tampered, wrong key (secret rotated) or garbage value — treat exactly
    // like "no cookie", never throw: a broken cookie must not break the page.
    return null;
  }
}
