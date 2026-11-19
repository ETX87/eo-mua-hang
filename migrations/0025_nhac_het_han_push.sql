-- v0.105 (2026-11-19): nhac sap het han giai trinh + thong bao day (Web Push).
-- Yeu cau: "He thong tu quet moi gio. Ca qua han se bao dich danh nguoi phai giai trinh, va nhac lai khi con 6 gio la het han giai trinh.
-- day qua thong bao, khi mo se hien popup nhac nho." (lam tuong tu app linh kien).

-- Moc da nhac "sap het han giai trinh" (1 lan / loi). NULL = chua nhac.
ALTER TABLE tl_loi ADD COLUMN nhac_het_han_luc TEXT;

-- Thiet bi / trinh duyet da bat thong bao day. endpoint = khoa tu nhien.
CREATE TABLE push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nguoi_dung  TEXT NOT NULL REFERENCES users(email),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  ngay_tao    TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_push_nguoi ON push_subscriptions(nguoi_dung);
