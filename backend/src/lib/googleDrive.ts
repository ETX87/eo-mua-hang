import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../types";
import { decryptSecret } from "./secretBox";

// Upload file len Google Drive qua OAuth uy quyen 1 tai khoan Google THAT (khong dung Service
// Account - he chi co tai khoan Gmail ca nhan, Service Account khong co storage quota rieng nen bi
// 403 tru khi dich la Shared Drive tra phi Google Workspace). Port nguyen ban tu ../linh-kien-app
// (backend/src/lib/googleDrive.ts) - da chay that trong production o he do.

function buildMultipartBody(metadata: Record<string, unknown>, bytes: ArrayBuffer, mimeType: string, boundary: string): Uint8Array {
  // multipart/related thu cong (Drive KHONG chap nhan multipart/form-data cua FormData) - 2 phan:
  // JSON metadata roi den binary file, ngan cach boundary theo dung chuan RFC 2387.
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.byteLength + bytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(new Uint8Array(bytes), preamble.byteLength);
  body.set(closing, preamble.byteLength + bytes.byteLength);
  return body;
}

/**
 * Upload file dinh kem EO qua OAuth uy quyen 1 tai khoan Google THAT (xem
 * routes/danhMuc.ts phan "Google Drive OAuth"). Sau khi upload, chia se cong khai
 * "anyone with link" (Drive API permissions.create) roi tra ve link xem truc tiep, khong can nguoi
 * xem dang nhap Google (chap nhan don gian/nhanh hon proxy qua Worker - noi bo, khong nhay cam).
 */
async function getUserAccessToken(env: Env, db: D1Database): Promise<{ accessToken: string; folderId: string }> {
  const row = await db
    .prepare("SELECT refresh_token_enc, folder_id FROM google_drive_oauth WHERE id = 1")
    .first<{ refresh_token_enc: string; folder_id: string }>();
  if (!row) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED: chua ket noi tai khoan Google Drive - vao Cai dat de ket noi.");

  const refreshToken = await decryptSecret(env, row.refresh_token_enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google Drive token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return { accessToken: json.access_token, folderId: row.folder_id };
}

export async function uploadPublicFile(
  env: Env,
  db: D1Database,
  bytes: ArrayBuffer,
  mimeType: string,
  filename: string,
): Promise<{ id: string; url: string }> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const metadata = { name: filename, parents: [folderId] };
  const boundary = `eomua-${crypto.randomUUID()}`;
  const body = buildMultipartBody(metadata, bytes, mimeType, boundary);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!uploadRes.ok) throw new Error(`Google Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id } = (await uploadRes.json()) as { id: string };

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) throw new Error(`Google Drive set-public failed: ${permRes.status} ${await permRes.text()}`);

  return { id, url: `https://drive.google.com/file/d/${id}/view` };
}
