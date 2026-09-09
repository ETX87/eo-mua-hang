# -*- coding: utf-8 -*-
import openpyxl, json, datetime

wb = openpyxl.load_workbook("bc_export.xlsx", read_only=True, data_only=True)
ws = wb["2.2. All"]

def fmt_date(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v) if v else None

def ma_hang(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()

out = []
for r in ws.iter_rows(values_only=True):
    so_ct = r[4]
    if not so_ct or str(so_ct).startswith("=") or str(so_ct) in ("Số chứng từ", "COMPUTED_VALUE"):
        continue
    out.append({
        "Số chứng từ": str(so_ct).strip(),
        "Tên kho": (str(r[5]).strip() if r[5] else None),
        "Mã hàng": ma_hang(r[6]),
        "Số lượng Nhập": (r[7] if isinstance(r[7], (int, float)) else None),
        "Ngày chứng từ": fmt_date(r[8]),
        "Mã phê duyệt": (str(r[9]).strip() if r[9] else ""),
    })

with open("amis_rows.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

print("rows:", len(out))
print("with ma phe duyet:", sum(1 for x in out if x["Mã phê duyệt"]))
print("sample:", out[0])
