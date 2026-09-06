import { createHash, randomBytes } from "node:crypto";

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** PKCE code verifier — high-entropy random string (RFC 7636 §4.1). */
export function generateVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256 code challenge for a given verifier. The realm rejects anything
 * else (`code_challenge_method` other than `S256` is not offered). */
export function challengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** Per-request state, checked against what the realm echoes back on the
 * callback — the standard CSRF guard for the authorization code flow. */
export function generateState(): string {
  return base64url(randomBytes(16));
}
