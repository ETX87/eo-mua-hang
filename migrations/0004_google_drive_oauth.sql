-- Uy quyen 1 tai khoan Google THAT (OAuth, scope drive.file) de upload file dinh kem EO len Google
-- Drive - port nguyen ban tu ../linh-kien-app (backend/src/lib/googleDrive.ts). Refresh token ma
-- hoa bang secretBox.ts (khoa dan xuat tu SESSION_SECRET co san, khong can them Worker secret rieng).
CREATE TABLE google_drive_oauth (
  id                 INTEGER PRIMARY KEY,
  google_email       TEXT NOT NULL,
  refresh_token_enc  TEXT NOT NULL,
  folder_id          TEXT NOT NULL,
  authorized_by      TEXT REFERENCES users(email),
  authorized_at      TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
