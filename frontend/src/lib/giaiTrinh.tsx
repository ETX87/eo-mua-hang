import { ngay, ngayGio } from "./format";
import { gioTxt } from "./giaiDoan";

/**
 * QUAN DIEM "CAN GIAI TRINH" vs "VI PHAM" (v0.109, chu he thong 2026-11-23):
 *   "phan biet ro la giai doan can giai trinh (co han giai trinh) - het han khong giai trinh thi moi tinh la vi pham loi".
 * 1 loi tl_loi di qua cac trang thai:
 *   CAN_GT     cham quy tac -> PHAI giai trinh trong GIO_HAN_GT gio LAM VIEC tinh tu moc (tl_loi.han, khong co thi created_at)
 *   DA_GT      da giai trinh (that) trong han
 *   KHAC_PHUC  he thong tu dong vi da khac phuc / da co giai trinh cung loi (tl_giai_trinh AUTO:KHAC_PHUC)
 *   VI_PHAM    het han giai trinh ma khong giai trinh (AUTO:QUA_HAN) - hoac da qua han, cho he thong chot
 *   TAY        loi ghi tay khi giai trinh
 * Han giai trinh PHAI khop backend lib/theoDoi.ts (hanGiaiTrinh) + lib/gioLamViec.ts.
 */
/** v0.110: 16h LV cho loi co moc tu HAN_GT_16_TU, loi cu 56h - khop backend lib/theoDoi gioHanGt / hanGiaiTrinh */
export const GIO_HAN_GT = 16;
export const HAN_GT_16_TU = "2026-11-24 00:00:00";
export const gioHanGt = (moc: string) => (moc >= HAN_GT_16_TU ? GIO_HAN_GT : 56);

// ---- ban sao backend lib/gioLamViec.ts congGioLV / demGioLV (T2-T6 8-12 + 13-17, T7 8-12, CN nghi) - sua 1 ben thi sua ca 2
const H = 3600_000, NGAY_MS = 24 * H;
const CA: [number, number][][] = [[], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12]]];
const parse = (s: string) => Date.parse(s.slice(0, 19).replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z"));
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
export function congGioLV(start: string, gio: number): string {
  let t = parse(start);
  let con = Math.round(gio * H);
  if (!(con > 0)) return fmt(t);
  for (let i = 0; i < 4000; i++) {
    const dau = t - (t % NGAY_MS);
    for (const [a, b] of CA[new Date(dau).getUTCDay()]) {
      const we = dau + b * H;
      if (t >= we) continue;
      const s = Math.max(t, dau + a * H);
      if (con <= we - s) return fmt(s + con);
      con -= we - s;
      t = we;
    }
    t = dau + NGAY_MS;
  }
  return fmt(t);
}
export function demGioLV(a: string, b: string): number {
  let tu = parse(a); const den = parse(b);
  if (!(den > tu)) return 0;
  let ms = 0;
  for (let i = 0; i < 4000 && tu < den; i++) {
    const dau = tu - (tu % NGAY_MS);
    for (const [x, y] of CA[new Date(dau).getUTCDay()]) {
      const s = Math.max(tu, dau + x * H), e = Math.min(den, dau + y * H);
      if (e > s) ms += e - s;
    }
    tu = dau + NGAY_MS;
  }
  return Math.round((ms / H) * 10) / 10;
}
/** gio tuong VN hien tai 'YYYY-MM-DD HH:MM:SS' */
export const nowVN = () => fmt(Date.now() + 7 * H);

export type TrangThaiGt = "CAN_GT" | "DA_GT" | "KHAC_PHUC" | "VI_PHAM" | "BO_QUA" | "TAY";
/** v0.113: loi co moc truoc ngay nay = vi pham cu, bo qua (khop backend lib/theoDoi VP_CU_TRUOC) */
export const VP_CU_TRUOC = "2026-11-01";
export const NHAN_GT: Record<TrangThaiGt, { l: string; cls: string; mau: string; mo: string }> = {
  CAN_GT: { l: "Cần giải trình", cls: "final", mau: "#B45309", mo: "Đang trong hạn giải trình — chưa phải vi phạm" },
  DA_GT: { l: "Đã giải trình", cls: "issued", mau: "#15803D", mo: "Đã giải trình trong hạn" },
  KHAC_PHUC: { l: "Đã khắc phục", cls: "nhap", mau: "#475569", mo: "Hệ thống tự đóng vì đã khắc phục / đã giải trình cùng lỗi" },
  VI_PHAM: { l: "VI PHẠM", cls: "reject", mau: "#B91C1C", mo: "Hết hạn giải trình mà không giải trình" },
  BO_QUA: { l: "Bỏ qua · lỗi cũ", cls: "nhap", mau: "#64748B", mo: "Lỗi cũ trước 01/11/2026 — hệ thống tự bỏ, không tính vi phạm" },
  TAY: { l: "Ghi khi giải trình", cls: "nhap", mau: "#475569", mo: "Lỗi do người giải trình tự ghi nhận" },
};

/** Moc tinh han giai trinh cua 1 loi (= backend COALESCE(han, created_at)). */
export const mocLoi = (l: any): string | null => l.han ?? l.created_at ?? null;

export interface KqGt { tt: TrangThaiGt; hanGt: string | null; conGio: number | null; gt: any | null; gio?: number }
/** Trang thai giai trinh cua 1 loi. gtBy = map id tl_giai_trinh -> ban ghi (de biet AUTO:QUA_HAN / KHAC_PHUC). */
export function trangThaiGt(l: any, gtBy: Map<number, any>, now = nowVN()): KqGt {
  const gt = l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) ?? null : null;
  const moc = mocLoi(l);
  const hanGt = l.quy_tac === "TAY" || !moc ? null : congGioLV(moc, gioHanGt(moc));
  const gio = moc ? gioHanGt(moc) : GIO_HAN_GT;
  if (l.quy_tac === "TAY") return { tt: "TAY", hanGt, conGio: null, gt };
  if (l.trang_thai === "CHO_GIAI_TRINH") {
    // qua han nhung cron chua chot -> da la vi pham
    if (moc && moc < VP_CU_TRUOC) return { tt: "BO_QUA", hanGt, conGio: null, gt, gio };
    if (hanGt && hanGt <= now) return { tt: "VI_PHAM", hanGt, conGio: 0, gt, gio };
    return { tt: "CAN_GT", hanGt, conGio: hanGt ? demGioLV(now, hanGt) : null, gt, gio };
  }
  if (gt?.pham_vi === "AUTO") return { tt: gt.nhom === "AUTO:QUA_HAN" ? "VI_PHAM" : gt.nhom === "AUTO:CU" ? "BO_QUA" : "KHAC_PHUC", hanGt, conGio: null, gt, gio };
  return { tt: "DA_GT", hanGt, conGio: null, gt, gio };
}

/** "Vi sao co loi nay" - 1 cau theo quy tac, du de nguoi bi ghi loi hieu. */
export function viSaoLoi(l: any): string {
  const tc = l.ngay_tham_chieu ? ngay(l.ngay_tham_chieu) : null;
  switch (l.quy_tac) {
    case "R1": return tc
      ? `Đến hết ${tc} đơn vẫn chưa có ngày dự kiến (nhắc lại mỗi thứ 3 / thứ 6 khi đã trễ).`
      : `Đến hạn ${ngayGio(l.han)} (8h/16h làm việc từ khi bắt đầu theo dõi) đơn chưa có ngày dự kiến.`;
    case "R3": return `Kỳ kiểm tra ${tc ?? ngay(l.han)} (thứ 2 / thứ 4): không có mail, push hay gọi/Zalo nào với NCC trong kỳ, đơn chưa có ngày dự kiến.`;
    case "R4": return `Ngày dự kiến ${tc ?? "—"} đã qua, hàng chưa về và chưa cập nhật ngày dự kiến mới trước hạn ${ngayGio(l.han)}.`;
    case "TAY": return "Lỗi do người giải trình chọn khi ghi giải trình.";
    default: return l.ten_ma ?? l.quy_tac;
  }
}

/** Cau ket luan theo trang thai - noi ro vi sao BI / KHONG bi vi pham. */
export function ketLuanGt(k: KqGt): string {
  const han = k.hanGt ? ngayGio(k.hanGt) : "—";
  switch (k.tt) {
    case "CAN_GT": return `Hạn giải trình ${han} (${k.gio ?? GIO_HAN_GT} giờ làm việc, còn ${gioTxt(k.conGio ?? 0)}). Giải trình trước hạn → không bị ghi vi phạm.`;
    case "DA_GT": return `Đã giải trình lúc ${ngayGio(k.gt?.created_at)} — trước hạn ${han}.`;
    case "KHAC_PHUC": return k.gt?.noi_dung ?? "Hệ thống tự đóng vì đã khắc phục.";
    case "BO_QUA": return "Lỗi cũ (mốc trước 01/11/2026) — hệ thống tự bỏ, không tính vi phạm.";
    case "VI_PHAM": return `Hết hạn giải trình ${han} (${k.gio ?? GIO_HAN_GT} giờ làm việc) mà không có giải trình → ghi nhận VI PHẠM.`;
    default: return "";
  }
}

/** Dem theo trang thai (cho o tom tat). */
export function demGt(loi: any[], gtBy: Map<number, any>, now = nowVN()) {
  const d: Record<TrangThaiGt, number> = { CAN_GT: 0, DA_GT: 0, KHAC_PHUC: 0, VI_PHAM: 0, BO_QUA: 0, TAY: 0 };
  for (const l of loi) d[trangThaiGt(l, gtBy, now).tt] += 1;
  return d;
}

// ------------------------------------------------------------------ v0.121 "Do ai" theo giai doan (chu he thong 2026-11-26)
/** "Do ai" MAC DINH theo quy tac loi - khop backend lib/maLoi AI_MAC_DINH: R1 cho ngay DK (G5) / R4 qua ngay DK (G6) = NCC;
 *  R3 khong thuc NCC (G4) = noi bo - nguoi dat. Nguoi giai trinh van doi duoc. */
export const AI_MAC_DINH: Record<string, string> = { R1: "DOI_TAC", R4: "DOI_TAC", R3: "NGUOI_DAT" };
/** Ben chiu cua ma "Do ai": DOI_TAC = NCC, con lai = noi bo (khop backend benCuaAi). */
export const benCuaAi = (ma: string | null | undefined): "NCC" | "NOI_BO" | "" => (!ma ? "" : ma === "DOI_TAC" ? "NCC" : "NOI_BO");
export const BEN_TEN = { NCC: "Nhà cung cấp", NOI_BO: "Nội bộ công ty" } as const;
/** Goi y "Do ai" cho 1 nhom loi: moi loi cung goi y -> goi y do; tron lan / khong co -> "" (phai chon). */
export function aiGoiY(quyTac: (string | null | undefined)[]): string {
  const ds = [...new Set(quyTac.map((q) => AI_MAC_DINH[q ?? ""] ?? ""))];
  return ds.length === 1 ? ds[0] : "";
}
const GD_CUA_QT: Record<string, string> = { R1: "G5 Chờ ngày DK — NCC chịu", R4: "G6 Chờ giao hàng — NCC chịu", R3: "G4 Gửi / thúc NCC — nội bộ chịu" };

/** O chon "Do ai" chung cho moi form giai trinh: nhom NCC / Noi bo + dong goi y theo giai doan. */
export function ChonDoAi({ value, onChange, ai, quyTac }: {
  value: string; onChange: (ma: string) => void; ai: { ma: string; ten: string }[]; quyTac?: (string | null | undefined)[];
}) {
  const ncc = ai.filter((x) => benCuaAi(x.ma) === "NCC"), noiBo = ai.filter((x) => benCuaAi(x.ma) === "NOI_BO");
  const goiY = aiGoiY(quyTac ?? []);
  const gd = [...new Set((quyTac ?? []).map((q) => GD_CUA_QT[q ?? ""]).filter(Boolean))];
  const ben = benCuaAi(value);
  return (
    <>
      <label className="field-label">Do ai <span className="req">*</span>
        {ben && <span className={`badge ${ben === "NCC" ? "final" : "review"}`} style={{ marginLeft: 6 }}>{BEN_TEN[ben]}</span>}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Chọn bên chịu lỗi —</option>
        {ncc.length > 0 && <optgroup label="Nhà cung cấp">{ncc.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}</optgroup>}
        {noiBo.length > 0 && <optgroup label="Nội bộ công ty">{noiBo.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}</optgroup>}
      </select>
      {gd.length > 0 && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
        Theo giai đoạn: {gd.join(" · ")}{goiY && value && value !== goiY ? <b style={{ color: "var(--warn-ink)" }}> — bạn đang chọn khác gợi ý, ghi rõ lý do trong nội dung.</b> : null}</div>}
    </>
  );
}
