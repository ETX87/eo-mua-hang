import type { Env } from "../types";

// Ma hoa doi xung nho gon (AES-GCM) de luu bi mat (vd refresh_token OAuth) trong D1 - khoa duoc
// dan xuat tu SESSION_SECRET (da co san, khong can them 1 Worker secret rieng) qua SHA-256 voi
// tien to phan tach ("domain separation") de khong trung khoa voi bat ky muc dich nao khac dung
// SESSION_SECRET (vd ky JWT phien dang nhap, xem lib/jwt.ts).
async function deriveKey(env: Env): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`secretBox:v1:${env.SESSION_SECRET}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encryptSecret(env: Env, plaintext: string): Promise<string> {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${toB64(iv)}:${toB64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(env: Env, stored: string): Promise<string> {
  const [ivB64, ciphertextB64] = stored.split(":");
  const key = await deriveKey(env);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ciphertextB64));
  return new TextDecoder().decode(plaintext);
}
