import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env.agentKeyEncKey, "hex");
  if (k.length !== 32) throw new Error("AGENT_KEY_ENC_KEY must be 32 bytes hex");
  return k;
}

/** AES-256-GCM; output base64(iv | tag | ciphertext). */
export function encryptSecret(plain: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(enc: string): Uint8Array {
  const b = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(28)), d.final()]));
}

export const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest();
export const sha256hex = (s: string | Uint8Array) => sha256(s).toString("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
