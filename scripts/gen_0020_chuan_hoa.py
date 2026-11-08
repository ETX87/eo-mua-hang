# Sinh migrations/0020_chuan_hoa_doi_tac_ly_do.sql (2026-11-08): danh muc chuan Doi tac / Ly do PS + bi danh,
# chuyen gia tri "rac" hien co cua eo_item ve gia tri chuan (giu ban goc o supplier_goc / reason_goc),
# bang user_alias (nhieu Gmail dang nhap cho 1 tai khoan), moc R1 24h cho nhom Karofi/Livotec/Korihome.
# Chay: python -I scripts/gen_0020_chuan_hoa.py  (khoa() phai khop backend/src/lib/chuanHoa.ts)
import io
import os
import unicodedata


def khoa(s):
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()
    return "".join(ch for ch in s if ch.isalnum() and ch.isascii())


def q(s):
    return "'" + s.replace("'", "''") + "'"


DOI_TAC = ["Karofi", "Livotec", "Korihome", "Mishio", "Cuckoo", "Sanaky", "Media Mart", "Gcool", "Bách Tường Phát",
           "Kangaroo", "Purastar", "Lọc tổng", "LKDH", "NCC"]
BI_DANH_DT = {
    "Karofi": ["KRF", "KARO", "Karofi", "KAROFI"],
    "Livotec": ["LVT", "LIVOTEC", "ĐIỀU HÒA LIVOTEC", "HÚT MÙI LIVOTEC", "Gia dụng LIVOTEC"],
    "Korihome": ["KRH", "KORIHOME"],
    "Sanaky": ["SNK"],
    "Media Mart": ["Media", "MM", "MEDIA MART"],
}
LY_DO = ["Ký gửi", "Đặt lần đầu", "Kế hoạch tháng", "Phát sinh"]
BI_DANH_LD = {
    "Ký gửi": ["Đơn hàng ký gửi", "Hàng ký gửi"],
    "Đặt lần đầu": ["Đơn đặt lần đầu", "Lần đầu"],
    "Kế hoạch tháng": ["Đơn kế hoạch tháng", "Đơn đặt hàng kế hoạch tháng", "KH tháng"],
    "Phát sinh": ["Đơn phát sinh không dự trữ", "Phát sinh không dự trữ", "Đơn cảnh báo hết hàng", "Cảnh báo hết hàng",
                  "Cản báo hết hàng", "Đơn phát sinh"],
}
# gia tri ly do la (khong phai bi danh dung tiep): -> Phat sinh + chep chu goc vao ghi chu (chot voi nguoi dung 2026-11-08)
LY_DO_LA_SANG = "Phát sinh"

bd_dt = {}
for t in DOI_TAC:
    bd_dt[khoa(t)] = t
for t, ds in BI_DANH_DT.items():
    for x in ds:
        bd_dt[khoa(x)] = t
bd_ld = {}
for t in LY_DO:
    bd_ld[khoa(t)] = t
for t, ds in BI_DANH_LD.items():
    for x in ds:
        bd_ld[khoa(x)] = t

out = []
w = out.append
w("-- 0020 (2026-11-08) - SINH BOI scripts/gen_0020_chuan_hoa.py, khong sua tay.")
w("-- 1) user_alias: nhieu Gmail dang nhap cho 1 tai khoan (email phu -> users.email chinh).")
w("CREATE TABLE user_alias (")
w("  email      TEXT PRIMARY KEY,")
w("  user_email TEXT NOT NULL REFERENCES users(email),")
w("  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),")
w("  created_by TEXT")
w(");")
w("CREATE INDEX idx_user_alias_user ON user_alias(user_email);")
w("")
w("-- 2) Danh muc chuan Doi tac / Ly do PS + bi danh (khoa = chu thuong khong dau, bo ky tu khac chu/so - lib/chuanHoa.ts khoa()).")
w("CREATE TABLE dm_chuan (")
w("  loai   TEXT NOT NULL CHECK (loai IN ('DOI_TAC','LY_DO')),")
w("  ten    TEXT NOT NULL,")
w("  active INTEGER NOT NULL DEFAULT 1,")
w("  thu_tu INTEGER NOT NULL DEFAULT 0,")
w("  PRIMARY KEY (loai, ten)")
w(");")
w("CREATE TABLE dm_bi_danh (")
w("  loai       TEXT NOT NULL CHECK (loai IN ('DOI_TAC','LY_DO')),")
w("  khoa       TEXT NOT NULL,")
w("  ten_chuan  TEXT NOT NULL,")
w("  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),")
w("  PRIMARY KEY (loai, khoa)")
w(");")
w("INSERT INTO dm_chuan (loai, ten, thu_tu) VALUES")
rows = [f"  ('DOI_TAC', {q(t)}, {i})" for i, t in enumerate(DOI_TAC)] + [f"  ('LY_DO', {q(t)}, {i})" for i, t in enumerate(LY_DO)]
w(",\n".join(rows) + ";")
w("INSERT INTO dm_bi_danh (loai, khoa, ten_chuan) VALUES")
rows = [f"  ('DOI_TAC', {q(k)}, {q(t)})" for k, t in sorted(bd_dt.items())] + [f"  ('LY_DO', {q(k)}, {q(t)})" for k, t in sorted(bd_ld.items())]
w(",\n".join(rows) + ";")
w("")
w("-- 3) Cot giu ban goc. Chuyen du lieu cu: file RIENG scripts/_data/0020_chuyen_du_lieu.sql (chua gia tri that - KHONG dua len git,")
w("--    repo cong khai), chay 1 lan sau migration: npx wrangler d1 execute eo-mua-hang-db --remote --file scripts/_data/0020_chuyen_du_lieu.sql")
w("ALTER TABLE eo_item ADD COLUMN supplier_goc TEXT;")
w("ALTER TABLE eo_item ADD COLUMN reason_goc TEXT;")
w("")
w("-- 4) R1 24h cho nhom Karofi / Livotec / Korihome: chi dong bat dau theo doi tu ngay nay (dong cu giu 48h, khong ghi loi hoi to).")
w("INSERT INTO app_settings (key, value) VALUES ('r1_24h_tu', '2026-11-08') ON CONFLICT(key) DO NOTHING;")
w("")
w("-- bao cao / cache theo doi tinh lai")
w("UPDATE data_versions SET version = version + 1 WHERE domain IN ('eo', 'settings', 'users');")
io.open("migrations/0020_chuan_hoa_doi_tac_ly_do.sql", "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")

# ---- du lieu that: gia tri tho tren production (2026-11-08, wrangler d1 execute --json -> TMPJSON/dt.json, ld.json)
# -> scripts/_data/ (gitignore). Chay lai vo hai: chi doi dong con gia tri tho.
out = []
w = out.append
w("-- Chuyen Doi tac / Ly do PS cu ve gia tri chuan (sau migration 0020). SINH BOI scripts/gen_0020_chuan_hoa.py.")
w("CREATE TABLE _cm (loai TEXT, raw TEXT, chuan TEXT, ghi INTEGER);")
import json
T = os.environ.get("TMPJSON", "C:/Users/HP/AppData/Local/Temp/claude")
dt_raw = [r["v"] for r in json.load(io.open(f"{T}/dt.json", encoding="utf-8"))[0]["results"] if r["v"]]
ld_raw = [r["v"] for r in json.load(io.open(f"{T}/ld.json", encoding="utf-8"))[0]["results"] if r["v"]]
maps = []
khong = []
for v in dt_raw:
    t = bd_dt.get(khoa(v))
    if t is None:
        khong.append(v)
        continue
    maps.append(("DOI_TAC", v, t, 0))
for v in ld_raw:
    t = bd_ld.get(khoa(v))
    maps.append(("LY_DO", v, t or LY_DO_LA_SANG, 0 if t else 1))
w("INSERT INTO _cm (loai, raw, chuan, ghi) VALUES")
w(",\n".join(f"  ({q(a)}, {q(b)}, {q(c)}, {d})" for a, b, c, d in maps) + ";")
w("UPDATE eo_item SET supplier_goc = supplier,")
w("  supplier = (SELECT chuan FROM _cm WHERE loai = 'DOI_TAC' AND raw = eo_item.supplier)")
w("WHERE supplier IN (SELECT raw FROM _cm WHERE loai = 'DOI_TAC' AND raw <> chuan);")
w("UPDATE eo_item SET reason_goc = reason,")
w("  ghi_chu = CASE WHEN (SELECT ghi FROM _cm WHERE loai = 'LY_DO' AND raw = eo_item.reason) = 1")
w("    THEN TRIM(COALESCE(ghi_chu, '') || CASE WHEN TRIM(COALESCE(ghi_chu, '')) <> '' THEN ' | ' ELSE '' END || 'Lý do cũ: ' || reason)")
w("    ELSE ghi_chu END,")
w("  reason = (SELECT chuan FROM _cm WHERE loai = 'LY_DO' AND raw = eo_item.reason)")
w("WHERE reason IN (SELECT raw FROM _cm WHERE loai = 'LY_DO' AND raw <> chuan);")
w("DROP TABLE _cm;")
w("UPDATE data_versions SET version = version + 1 WHERE domain IN ('eo', 'settings');")
os.makedirs("scripts/_data", exist_ok=True)
io.open("scripts/_data/0020_chuyen_du_lieu.sql", "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print("doi tac khong map:", len(khong), "| ly do la -> Phat sinh:", sum(1 for m in maps if m[0] == "LY_DO" and m[3]))
