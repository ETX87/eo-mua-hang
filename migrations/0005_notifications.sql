-- Thong bao ca nhan cho nguoi tao EO khi EO cua ho doi trang thai do duyet (yeu cau cap nhat/tu choi
-- duyet cuoi/ban hanh). Port rut gon tu thong_bao_ktv cua ../linh-kien-app (bo phan push/preferences
-- khong co ha tang tuong ung o day).
CREATE TABLE notification (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL REFERENCES users(email),
  loai        TEXT NOT NULL,   -- request_update | rejected | issued
  noi_dung    TEXT NOT NULL,
  eo_id       INTEGER NOT NULL REFERENCES eo(id),
  da_doc      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_notification_email ON notification(email, da_doc);
