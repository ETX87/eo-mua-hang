import { laNhomR1_24h } from "./chuanHoa";

/**
 * BANG MA LOI ER.MH (v0.091, chot theo ../MA_LOI_HE_THONG.md) - 1 nguon duy nhat cho UI (bang ma loi tung buoc o popup, Vi pham theo ma,
 * Ca ton CEO) va API doc (/api/partner/...). Ma KHONG luu DB: tinh luc doc tu tl_loi (quy_tac + loi_ma) + doi tac / han.
 *  001-099 loi he thong (R1/R3/R4, phai giai trinh) · 101-199 loi ghi tay khi giai trinh (danh muc tl_danh_muc LOI)
 *  201-203 canh bao cap CEO (khong ghi tl_loi) · 301-308 tre han giai doan G1-G8 (chi do)
 * R1: 001 = nhom Karofi / Livotec / Korihome 24h (dong bat dau tu R1_24H_TU), 002 = 48h. DB chi luu R1 chung -> tach theo doi tac + han
 * (han >= ngay sau R1_24H_TU ~ dong bat dau tu moc do; dong bat dau sat moc co the xep lech - chap nhan, xem MA_LOI_HE_THONG.md muc 5).
 */
export interface MaLoiDef {
  ma: string; ten: string;
  nhom: "HE_THONG" | "TAY" | "CEO" | "GIAI_DOAN";
  /** buoc (giai doan) gan voi loi - null = khong gan buoc */
  buoc: string | null;
  giai_trinh: boolean; mo_ta: string;
  /** khoa trong DB: loi_ma (TAY) / quy_tac (he thong) / ma CEO (LUI/XA/LOI) / giai doan */
  khoa: string;
  /** v0.092: yeu cau giai trinh + khi nao he thong tu dong (dien sau, theo nhom / khoa - YEU_CAU) */
  yeu_cau_gt?: string; tu_dong?: string;
}
const YEU_CAU: Record<string, [string, string]> = {
  R1_24: ["Bắt buộc: Do ai (mặc định NCC — giai đoạn chờ NCC) + Lỗi gì + nội dung. Ảnh / thư bằng chứng: tuỳ chọn.", "Tự đóng khi dòng đã có ngày dự kiến (không tính vi phạm). Hết hạn giải trình 16 giờ làm việc mà không giải trình → ghi VI PHẠM."],
  R1_48: ["Bắt buộc: Do ai (mặc định NCC — giai đoạn chờ NCC) + Lỗi gì + nội dung. Ảnh / thư bằng chứng: tuỳ chọn.", "Tự đóng khi dòng đã có ngày dự kiến (không tính vi phạm). Hết hạn giải trình 16 giờ làm việc mà không giải trình → ghi VI PHẠM."],
  R3: ["Bắt buộc: Do ai (mặc định Nội bộ — người đặt, khâu gửi / thúc NCC) + Lỗi gì + nội dung. Bằng chứng: tuỳ chọn.", "Tự đóng khi sau đó có mail (CC hộp theo dõi) / push / gọi-Zalo với NCC (không tính vi phạm). Hết hạn giải trình 16 giờ làm việc mà không giải trình → ghi VI PHẠM."],
  R4: ["Bắt buộc: Do ai (mặc định NCC — giao trễ) + Lỗi gì + nội dung. Ảnh / thư bằng chứng: tuỳ chọn.", "Tự đóng khi đã nhập ngày dự kiến mới muộn hơn ngày bị quá (không tính vi phạm). Hết hạn giải trình 16 giờ làm việc mà không giải trình → ghi VI PHẠM."],
  R5: ["Bắt buộc (người duyệt): Do ai (mặc định Người duyệt) + Lỗi gì + nội dung — vì sao chưa duyệt kịp. Bằng chứng: tuỳ chọn.", "Tự đóng khi người đó đã duyệt / từ chối / bước không còn chờ (không tính vi phạm). Hết hạn giải trình 16 giờ làm việc mà không giải trình → ghi VI PHẠM."],
  TAY: ["Không — lỗi được ghi kèm giải trình ngay lúc giải trình.", "—"],
  CEO: ["Không giải trình riêng mã này — giải trình các lỗi 0xx / 1xx của dòng; theo dõi ở menu Ca tồn CEO.", "Hết khi dòng về đủ / kết thúc sớm / hủy, hoặc không còn chạm ngưỡng."],
  GIAI_DOAN: ["Không — chỉ đo để báo cáo đúng / trễ hạn từng bước.", "—"],
};
const dienYeuCau = (d: MaLoiDef): MaLoiDef => {
  const [y, t] = YEU_CAU[d.khoa] ?? YEU_CAU[d.nhom] ?? ["", ""];
  return { ...d, yeu_cau_gt: y, tu_dong: t };
};

const R1_24H_TU = "2026-11-08";

const CO_DINH: MaLoiDef[] = [
  { ma: "ER.MH-001", khoa: "R1_24", nhom: "HE_THONG", buoc: "G5", giai_trinh: true, ten: "Không có ngày dự kiến trong 8h làm việc (Karofi / Livotec / Korihome)",
    mo_ta: "Sau khi dòng bắt đầu (PO ban hành / dòng thêm sau BH được duyệt) 8 giờ làm việc vẫn chưa có ngày dự kiến. Vẫn chưa có → ghi lại mỗi thứ 3 và thứ 6." },
  { ma: "ER.MH-002", khoa: "R1_48", nhom: "HE_THONG", buoc: "G5", giai_trinh: true, ten: "Không có ngày dự kiến trong 16h làm việc (đối tác khác)",
    mo_ta: "Sau khi dòng bắt đầu 16 giờ làm việc vẫn chưa có ngày dự kiến. Vẫn chưa có → ghi lại mỗi thứ 3 và thứ 6." },
  { ma: "ER.MH-003", khoa: "R3", nhom: "HE_THONG", buoc: "G4", giai_trinh: true, ten: "Không thúc / push đối tác (thứ 2 / thứ 4)",
    mo_ta: "Hết thứ 2 / thứ 4, dòng chưa có ngày dự kiến mà trong kỳ không có push, mail với NCC (CC hộp theo dõi) hay ghi nhận gọi / Zalo. Mỗi ngày kiểm tra = 1 lỗi." },
  { ma: "ER.MH-004", khoa: "R4", nhom: "HE_THONG", buoc: "G6", giai_trinh: true, ten: "Quá ngày dự kiến không cập nhật ngày mới",
    mo_ta: "Quá ngày dự kiến mà chưa về đủ, 8 giờ làm việc sau đó chưa nhập ngày dự kiến mới. Mỗi mốc quá hạn = 1 lỗi." },
  // v0.125: R5 cham duyet - nguoi duyet giu buoc tham dinh / duyet mua / dong sau BH qua han G2 / G3 (8h LV). buoc G3 (G2 khi tham dinh - xem mo_ta)
  { ma: "ER.MH-005", khoa: "R5", nhom: "HE_THONG", buoc: "G3", giai_trinh: true, ten: "Chậm duyệt (thẩm định / duyệt mua / dòng thêm sau BH)",
    mo_ta: "Bước thẩm định hoặc duyệt mua của PO, hoặc dòng thêm sau ban hành, chờ người duyệt quá hạn G2 / G3 (mặc định 8 giờ làm việc từ lúc được giao). Mỗi lượt chờ = 1 lỗi cho đúng người duyệt. Áp dụng từ 27/11/2026 08:00." },
  { ma: "ER.MH-201", khoa: "LUI", nhom: "CEO", buoc: "G6", giai_trinh: false, ten: "Lùi ngày dự kiến nhiều lần", mo_ta: "Lùi ngày dự kiến ≥ 3 lần (đếm theo từng đợt)." },
  { ma: "ER.MH-202", khoa: "XA", nhom: "CEO", buoc: "G6", giai_trinh: false, ten: "Ngày dự kiến quá xa ngày đặt", mo_ta: "Ngày dự kiến gần nhất cách ngày đặt ≥ 30 ngày." },
  { ma: "ER.MH-203", khoa: "LOI", nhom: "CEO", buoc: null, giai_trinh: false, ten: "Tích lũy nhiều lỗi", mo_ta: "≥ 3 lỗi (hệ thống + ghi tay) trên dòng." },
  { ma: "ER.MH-301", khoa: "G1", nhom: "GIAI_DOAN", buoc: "G1", giai_trinh: false, ten: "Trễ hạn G1 Lập & trình EO", mo_ta: "Người tạo EO — hạn mặc định 8 giờ làm việc." },
  { ma: "ER.MH-302", khoa: "G2", nhom: "GIAI_DOAN", buoc: "G2", giai_trinh: false, ten: "Trễ hạn G2 Thẩm định", mo_ta: "Người thẩm định — 8 giờ làm việc." },
  { ma: "ER.MH-303", khoa: "G3", nhom: "GIAI_DOAN", buoc: "G3", giai_trinh: false, ten: "Trễ hạn G3 Duyệt mua & ban hành", mo_ta: "Người duyệt mua — 8 giờ làm việc." },
  { ma: "ER.MH-304", khoa: "G4", nhom: "GIAI_DOAN", buoc: "G4", giai_trinh: false, ten: "Trễ hạn G4 Gửi đơn cho NCC (mail)", mo_ta: "NV đặt hàng — 8 giờ làm việc." },
  { ma: "ER.MH-305", khoa: "G5", nhom: "GIAI_DOAN", buoc: "G5", giai_trinh: false, ten: "Trễ hạn G5 Chờ ngày DK", mo_ta: "Nhà cung cấp (từ khi gửi đơn) — 8 giờ làm việc (lỗi thật ghi theo 001 / 002)." },
  { ma: "ER.MH-306", khoa: "G6", nhom: "GIAI_DOAN", buoc: "G6", giai_trinh: false, ten: "Trễ hạn G6 Chờ giao hàng", mo_ta: "NCC — hạn theo ngày dự kiến lần đầu." },
  { ma: "ER.MH-307", khoa: "G7", nhom: "GIAI_DOAN", buoc: "G7", giai_trinh: false, ten: "Trễ hạn G7 Nhập kho & lên hệ thống", mo_ta: "Kho / Kế toán — 8 giờ làm việc." },
  { ma: "ER.MH-308", khoa: "G8", nhom: "GIAI_DOAN", buoc: "G8", giai_trinh: false, ten: "Trễ hạn G8 Giao bù đến đủ", mo_ta: "Nhà cung cấp — 56 giờ làm việc." },
];
/** Loi ghi tay da co ma co dinh (MA_LOI_HE_THONG.md muc 2); danh muc moi Admin them -> cap tiep 106, 107... theo thu tu */
const TAY_CO_DINH: Record<string, [string, string | null]> = {
  NCC_KHONG_PHAN_HOI: ["ER.MH-101", "G6"], NCC_BAO_TRE: ["ER.MH-102", "G6"], NCC_HET_HANG: ["ER.MH-103", "G6"],
  DAT_SAI: ["ER.MH-104", "G1"], CHAM_DUYET: ["ER.MH-105", "G3"], KHAC: ["ER.MH-199", null],
};
/** v0.121: "Do ai" MAC DINH theo giai doan cua loi he thong (tl_danh_muc AI): R1 cho ngay DK (G5) / R4 qua ngay DK (G6) = NCC;
 *  R3 khong thuc NCC (G4) = noi bo - nguoi dat. Nguoi giai trinh van doi duoc. FE lib/giaiTrinh.tsx AI_MAC_DINH dong bo tay. */
export const AI_MAC_DINH: Record<string, string> = { R1: "DOI_TAC", R4: "DOI_TAC", R3: "NGUOI_DAT", R5: "NGUOI_DUYET" };
/** Ben chiu cua 1 ma "Do ai": DOI_TAC = NCC, con lai = noi bo. */
export const benCuaAi = (ma: string | null | undefined): "NCC" | "NOI_BO" => (ma === "DOI_TAC" ? "NCC" : "NOI_BO");
/** SQL ben chiu cua loi (alias l = tl_loi, g = tl_giai_trinh LEFT JOIN): co giai trinh THAT -> theo "Do ai" da chon; chua / tu dong -> mac dinh
 *  theo quy tac (R1/R4 NCC, R3 noi bo, TAY theo ai_ma). Loi KHONG GIAI TRINH (AUTO:QUA_HAN) dem rieng, khong nam trong ben nay. */
export const BEN_SQL = `CASE WHEN g.id IS NOT NULL AND COALESCE(g.pham_vi, '') <> 'AUTO' THEN (CASE WHEN l.ai_ma = 'DOI_TAC' THEN 'NCC' ELSE 'NOI_BO' END)
  WHEN l.quy_tac IN ('R1', 'R4') THEN 'NCC' WHEN l.quy_tac = 'TAY' AND l.ai_ma = 'DOI_TAC' THEN 'NCC' ELSE 'NOI_BO' END`;
/** v0.129: ben chiu cua 1 loi trong JS - CUNG LUAT voi BEN_SQL (l = dong tl_loi, gt_pham_vi = pham vi giai trinh, null = chua giai trinh). */
export function benLoi(l: { quy_tac: string; ai_ma: string | null; giai_trinh_id?: number | null; gt_pham_vi?: string | null }): "NCC" | "NOI_BO" {
  if (l.giai_trinh_id && l.gt_pham_vi && l.gt_pham_vi !== "AUTO") return l.ai_ma === "DOI_TAC" ? "NCC" : "NOI_BO";
  if (l.quy_tac === "R1" || l.quy_tac === "R4") return "NCC";
  return l.quy_tac === "TAY" && l.ai_ma === "DOI_TAC" ? "NCC" : "NOI_BO";
}
const LOI_HE_THONG = new Set(["KHONG_NDK_24H", "KHONG_NDK_QUA_HAN", "KHONG_PUSH"]);

export interface BangMaLoi { ds: MaLoiDef[]; tay: Map<string, MaLoiDef>; theoMa: Map<string, MaLoiDef> }

/** Bang ma day du (doc danh muc LOI de cap ma cho loi ghi tay). */
export async function layBangMaLoi(db: D1Database): Promise<BangMaLoi> {
  const dm = (await db.prepare("SELECT ma, ten, thu_tu FROM tl_danh_muc WHERE loai = 'LOI' ORDER BY thu_tu, ma").all<{ ma: string; ten: string; thu_tu: number }>()).results;
  const tay: MaLoiDef[] = [];
  let tiep = 106;
  for (const d of dm) {
    if (LOI_HE_THONG.has(d.ma)) continue;
    const cd = TAY_CO_DINH[d.ma];
    tay.push({ ma: cd ? cd[0] : `ER.MH-${tiep++}`, khoa: d.ma, nhom: "TAY", buoc: cd ? cd[1] : null, giai_trinh: true, ten: d.ten,
      mo_ta: "Lỗi ghi khi giải trình (chọn ở \"Lỗi gì\") — vẫn tính vào tổng lỗi và ngưỡng cấp CEO." });
  }
  if (!tay.some((x) => x.khoa === "KHAC")) tay.push({ ma: "ER.MH-199", khoa: "KHAC", nhom: "TAY", buoc: null, giai_trinh: true, ten: "Khác", mo_ta: "Lỗi ghi khi giải trình." });
  const ds = [...CO_DINH.filter((x) => x.nhom === "HE_THONG"), ...tay.sort((a, b) => a.ma.localeCompare(b.ma)), ...CO_DINH.filter((x) => x.nhom !== "HE_THONG")].map(dienYeuCau);
  return { ds, tay: new Map(tay.map((x) => [x.khoa, x])), theoMa: new Map(ds.map((x) => [x.ma, x])) };
}

/** Ma ER.MH cua 1 ban ghi tl_loi. doiTac = supplier cua dong (tach R1 24h / 48h). */
export function maCuaLoi(b: BangMaLoi, l: { quy_tac: string; loi_ma: string | null; han: string | null }, doiTac: string | null | undefined): MaLoiDef {
  if (l.quy_tac === "R1") return CO_DINH[laNhomR1_24h(doiTac) && String(l.han ?? "").slice(0, 10) > R1_24H_TU ? 0 : 1];
  if (l.quy_tac === "R3") return CO_DINH[2];
  if (l.quy_tac === "R4") return CO_DINH[3];
  if (l.quy_tac === "R5") return CO_DINH.find((x) => x.khoa === "R5")!;
  return b.tay.get(String(l.loi_ma ?? "")) ?? b.tay.get("KHAC")!;
}
/** Ma CEO (201-203) theo CeoChiTiet.ma, ma tre giai doan (301-308) theo G1..G8. */
export const maCeo = (k: string) => CO_DINH.find((x) => x.nhom === "CEO" && x.khoa === k) ?? null;
export const maTreGd = (g: string) => CO_DINH.find((x) => x.nhom === "GIAI_DOAN" && x.khoa === g) ?? null;

/** Gan ma_loi / ten_ma / buoc vao danh sach tl_loi (can doi tac theo dong). */
export function ganMaLoi<T extends { quy_tac: string; loi_ma: string | null; han: string | null }>(b: BangMaLoi, ds: T[], doiTacCua: (l: T) => string | null | undefined) {
  return ds.map((l) => { const m = maCuaLoi(b, l, doiTacCua(l)); return { ...l, ma_loi: m.ma, ten_ma: m.ten, buoc: m.buoc, vp_khoa: khoaViPham(l as any) }; });
}

/**
 * VI PHAM GOP (v0.093, yeu cau lanh dao 2026-11-18: "cung 1 loi tren cung 1 PO gop thanh 1 vi pham chung" - vd 3/6 dong chua co ngay DK = 1 lan).
 * tl_loi van ghi theo DONG (biet dong nao) nhung DEM / HIEN / GIAI TRINH theo khoa vi pham:
 *   R1  = PO (1 PO chua co ngay du kien = 1 vi pham, du bao nhieu dong / bao nhieu moc han); R1 lap lai thu 3 / thu 6 (v0.095) = PO + ngay do
 *   R3  = PO + ngay kiem tra (thu 2 / thu 4)
 *   R4  = PO + ngay du kien bi qua
 *   TAY = PO + loi gi + ngay ghi
 * Trang thai 1 vi pham: con dong CHO -> cho giai trinh; het cho: co giai trinh THAT -> da giai trinh; con lai -> tu dong (qua han neu moi dong qua han).
 * khoaViPham (JS) va VP_SQL (SQL, alias bang tl_loi) phai khop nhau.
 */
// v0.125: R5 gop theo PO + NGUOI DUYET + ngay bat dau cho (2 nguoi tham dinh cung PO = 2 vi pham, moi nguoi giai trinh phan minh)
export const khoaViPham = (l: { eo_id: number; quy_tac: string; ngay_tham_chieu?: string | null; han?: string | null; loi_ma?: string | null; created_at?: string | null; ai_email?: string | null }) =>
  l.quy_tac === "R5" ? `${l.eo_id}|R5|${l.ai_email ?? ""}|${l.ngay_tham_chieu ?? String(l.han ?? "").slice(0, 10)}`
  : l.quy_tac === "R1" ? (l.ngay_tham_chieu ? `${l.eo_id}|R1|${l.ngay_tham_chieu}` : `${l.eo_id}|R1`)
    : l.quy_tac === "TAY" ? `${l.eo_id}|TAY|${l.loi_ma ?? ""}|${String(l.created_at ?? "").slice(0, 10)}`
      : `${l.eo_id}|${l.quy_tac}|${l.ngay_tham_chieu ?? String(l.han ?? "").slice(0, 10)}`;
export const VP_SQL = (a = "l") =>
  `CASE ${a}.quy_tac WHEN 'R5' THEN ${a}.eo_id || '|R5|' || COALESCE(${a}.ai_email, '') || '|' || COALESCE(${a}.ngay_tham_chieu, substr(${a}.han, 1, 10)) WHEN 'R1' THEN ${a}.eo_id || '|R1' || CASE WHEN ${a}.ngay_tham_chieu IS NOT NULL THEN '|' || ${a}.ngay_tham_chieu ELSE '' END WHEN 'TAY' THEN ${a}.eo_id || '|TAY|' || COALESCE(${a}.loi_ma, '') || '|' || substr(${a}.created_at, 1, 10)
   ELSE ${a}.eo_id || '|' || ${a}.quy_tac || '|' || COALESCE(${a}.ngay_tham_chieu, substr(${a}.han, 1, 10)) END`;
