import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type EncryptedAppleCode = { authTag: string; ciphertext: string; nonce: string; version: string };

export function encryptAppleGiftCardCode(code: string, keyMaterial: string): EncryptedAppleCode {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(keyMaterial, "utf8").digest(), nonce);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), nonce: nonce.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url"), version: "aes-256-gcm:v1" };
}

export function decryptAppleGiftCardCode(value: EncryptedAppleCode, keyMaterial: string): string {
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(keyMaterial, "utf8").digest(), Buffer.from(value.nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
