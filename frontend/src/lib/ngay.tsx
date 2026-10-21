/**
 * 3 loai ngay cua 1 dong linh kien - DUNG CHUNG ten + dinh nghia o moi man (tranh nham "ngay ve" thuc te vs du kien):
 *   VE = Ngay hang ve        : thuc te hang nhap kho, lay tu phieu nhap AMIS (khong nhap tay)
 *   DK = Ngay du kien        : uoc tinh hang se ve (item_plan.planned_date) - quy tac nhac han / qua han / so lan lui dua vao ngay nay
 *   NM = Ngay nha may cam ket: nha may / NCC xac nhan (item_plan.factory_committed_date). Thuong DK = NM -> form tu dien DK theo NM.
 */
export const NGAY = {
  VE: { l: "Ngày hàng về", ngan: "Hàng về", mau: "#15803D", nen: "#F0FDF4", mo_ta: "Ngày thực tế hàng nhập kho — tự động lấy từ phiếu nhập AMIS, không nhập tay." },
  DK: { l: "Ngày dự kiến", ngan: "Dự kiến", mau: "#1D4ED8", nen: "#EFF6FF", mo_ta: "Ngày ước tính hàng sẽ về kho. Thường = ngày nhà máy cam kết. Dùng để nhắc hạn, tính quá hạn & số lần lùi." },
  NM: { l: "Ngày nhà máy cam kết", ngan: "NM cam kết", mau: "#B45309", nen: "#FFFBEB", mo_ta: "Ngày nhà máy / NCC xác nhận sẽ giao — xin từ nhà máy (mail, file push), ghi nguồn ở Ghi chú." },
} as const;
export type LoaiNgay = keyof typeof NGAY;

/** Tieu de cot / nhan co cham mau + tooltip dinh nghia. */
export function NhanNgay({ k, ngan, req }: { k: LoaiNgay; ngan?: boolean; req?: boolean }) {
  const n = NGAY[k];
  return (
    <span title={n.mo_ta} style={{ whiteSpace: "nowrap", cursor: "help" }}>
      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: n.mau, marginRight: 5, verticalAlign: 1 }} />
      {ngan ? n.ngan : n.l}{req && <span className="req"> *</span>}
    </span>
  );
}

/** Khung chu giai 3 loai ngay - dat o dau cac man / modal nhap ngay. */
export function ChuGiaiNgay({ gon }: { gon?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, fontSize: 12, marginBottom: 10 }}>
      {(Object.keys(NGAY) as LoaiNgay[]).map((k) => (
        <div key={k} style={{ background: NGAY[k].nen, borderLeft: `3px solid ${NGAY[k].mau}`, borderRadius: 6, padding: gon ? "5px 8px" : "7px 10px" }}>
          <b style={{ color: NGAY[k].mau }}>{NGAY[k].l}</b>
          {!gon && <div className="muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{NGAY[k].mo_ta}</div>}
        </div>
      ))}
    </div>
  );
}

/** O bang: 3 ngay xep doc, cung mau voi chu giai. dd/mm cho gon; tooltip day du. */
export function BaNgay({ nm, dk, ve, veDu }: { nm?: string | null; dk?: string | null; ve?: string | null; veDu?: boolean }) {
  const f = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");
  const dong = (k: LoaiNgay, d: string | null | undefined, extra?: string) => (
    <div title={`${NGAY[k].l}: ${d ? f(d) : "chưa có"}${extra ?? ""}\n${NGAY[k].mo_ta}`} style={{ color: d ? NGAY[k].mau : "var(--text-muted)", fontWeight: k === "DK" ? 700 : 500, whiteSpace: "nowrap", lineHeight: 1.35 }}>
      <span style={{ display: "inline-block", width: 24, fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{k === "VE" ? "Về" : k}</span>{f(d)}{extra && d ? <span style={{ fontSize: 10 }}>{extra}</span> : null}
    </div>
  );
  return <div style={{ fontSize: 12 }}>{dong("NM", nm)}{dong("DK", dk)}{dong("VE", ve, ve ? (veDu ? " đủ" : " thiếu") : "")}</div>;
}

export const BA_NGAY_HEAD = "NM cam kết · Dự kiến · Hàng về";
