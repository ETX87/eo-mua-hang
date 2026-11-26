-- v0.125 (2026-11-26, chu he thong: "Co, lam luon" - ghi loi giai trinh cho NGUOI DUYET khi duyet tre).
-- Quy tac moi R5 "Cham duyet" (ma ER.MH-005, lib/maLoi): buoc tham dinh / duyet mua dang cho, hoac dong them sau ban hanh dang cho duyet,
-- qua han G2 / G3 (mac dinh 8 gio lam viec) -> 1 loi cho dung nguoi duyet dang giu (ai_ma NGUOI_DUYET, ai_email = nguoi duyet).
-- khoa: R5:A:<eo_approval.id> (buoc duyet EO) | R5:S:<eo_item.id> (dong sau BH). eo_item_id = dong dau tien cua PO (R5:A) / chinh dong (R5:S).
--
-- CHECK cua tl_loi.quy_tac phai doi => dung lai bang (SQLite khong sua CHECK tai cho). tl_loi dang duoc 2 bang con tham chieu
-- (tl_giai_trinh.loi_id, tl_nhac_nho.loi_id): DROP truc tiep bang cha lam bo dem khoa ngoai tre khong ve 0 -> D1 rollback. Cach lam:
-- dung lai CA 3 bang, bang con moi tro vao tl_loi_moi; xoa bang cu theo thu tu con -> cha (khong dong nao mat cha), roi doi ten
-- (doi ten tl_loi_moi -> tl_loi tu sua tham chieu cua bang con moi). Giu nguyen id, du lieu, chi muc.
PRAGMA defer_foreign_keys = true;

CREATE TABLE tl_loi_moi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id    INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id         INTEGER NOT NULL REFERENCES eo(id),
  quy_tac       TEXT NOT NULL CHECK (quy_tac IN ('R1', 'R3', 'R4', 'R5', 'TAY')),
  khoa          TEXT NOT NULL UNIQUE,          -- R1:<item> | R3:<item>:<ngay> | R4:<item>:<ngay du kien> | R5:A:<approval> | R5:S:<item> | TAY:<item>:<id gt>
  han           TEXT,                          -- thoi diem het han (gio VN)
  ngay_tham_chieu TEXT,                        -- R3: ngay thu 2/4; R4: ngay du kien bi qua; R5: ngay bat dau cho duyet
  ai_ma         TEXT,
  ai_email      TEXT,
  loi_ma        TEXT,
  trang_thai    TEXT NOT NULL DEFAULT 'CHO_GIAI_TRINH' CHECK (trang_thai IN ('CHO_GIAI_TRINH', 'DA_GIAI_TRINH')),
  giai_trinh_id INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  nhac_het_han_luc TEXT
);
INSERT INTO tl_loi_moi (id, eo_item_id, eo_id, quy_tac, khoa, han, ngay_tham_chieu, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at, nhac_het_han_luc)
  SELECT id, eo_item_id, eo_id, quy_tac, khoa, han, ngay_tham_chieu, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at, nhac_het_han_luc FROM tl_loi;

CREATE TABLE tl_giai_trinh_moi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id  INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id       INTEGER NOT NULL REFERENCES eo(id),
  loi_id      INTEGER REFERENCES tl_loi_moi(id),
  ai_ma       TEXT NOT NULL,
  ai_email    TEXT,
  loi_ma      TEXT NOT NULL,
  noi_dung    TEXT NOT NULL,
  hinh_anh    TEXT,                            -- JSON [{name, drive_file_id, url}]
  created_by  TEXT NOT NULL REFERENCES users(email),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
  pham_vi     TEXT NOT NULL DEFAULT 'DONG',
  nhom        TEXT
);
INSERT INTO tl_giai_trinh_moi (id, eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom)
  SELECT id, eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom FROM tl_giai_trinh;

CREATE TABLE tl_nhac_nho_moi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id  INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id       INTEGER NOT NULL REFERENCES eo(id),
  loi_id      INTEGER REFERENCES tl_loi_moi(id),
  den_email   TEXT,                            -- nguoi duoc nhac (nguoi vi pham)
  kenh        TEXT NOT NULL CHECK (kenh IN ('HE_THONG', 'TAY')),
  noi_dung    TEXT,
  created_by  TEXT,                            -- NULL = he thong
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
INSERT INTO tl_nhac_nho_moi (id, eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_by, created_at)
  SELECT id, eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_by, created_at FROM tl_nhac_nho;

-- xoa bang cu: con truoc, cha sau
DROP TABLE tl_nhac_nho;
DROP TABLE tl_giai_trinh;
DROP TABLE tl_loi;
ALTER TABLE tl_loi_moi RENAME TO tl_loi;
ALTER TABLE tl_giai_trinh_moi RENAME TO tl_giai_trinh;
ALTER TABLE tl_nhac_nho_moi RENAME TO tl_nhac_nho;

CREATE INDEX idx_tl_loi_item ON tl_loi(eo_item_id);
CREATE INDEX idx_tl_loi_mo ON tl_loi(trang_thai) WHERE trang_thai = 'CHO_GIAI_TRINH';
CREATE INDEX idx_tl_loi_eo ON tl_loi(eo_id, trang_thai);
CREATE INDEX idx_tl_gt_item ON tl_giai_trinh(eo_item_id);
CREATE INDEX idx_tl_gt_nhom ON tl_giai_trinh(nhom) WHERE nhom IS NOT NULL;
CREATE INDEX idx_tl_nn_item ON tl_nhac_nho(eo_item_id);
CREATE INDEX idx_tl_nn_loi ON tl_nhac_nho(loi_id);
