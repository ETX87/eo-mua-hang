import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, tien, ngay, ngayGio, ten } from "../../lib/format";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { I } from "../../lib/icons";
import { BaNgay, NhanNgay } from "../../lib/ngay";
import { Hoi } from "../../lib/thuatNgu";
import { khopTim } from "../../lib/tonDong";
import { QvHeader, Kpi, DongLink, PartLink, useQuickView } from "./QuickView";
import { QuyTrinh, TienTrinhGon, ceoTxt, type GdDef } from "../TienTrinh";
import { GdBadge } from "../../lib/giaiDoan";
import {
  quyenEo, TabKeHoach, TabTaiLieu, QtyModal, CancelModal, RecallModal, ReplacePartModal, AddItemModal, BulkPlanModal,
  actionsFor, ApprovalActionModal, NhanSauBH, TuChoiDongModal, HuyDongModal, KetThucSomModal, SuaThongTinDongModal, KetThucSomPoModal, xuatDongEo,
} from "../../pages/eo/eoActions";
import { gopTrung, gopLienTiep, khoaMail, lietKe } from "../../lib/gopTrung";
import { NhatKyGop } from "../NhatKyGop";
import { type Dong, NgayHangVeModal, GiaiTrinhModal, LichSuModal, taoPushDoiTac, PushKetQua } from "../../pages/theodoi/shared";
import { GiaiTrinhPoModal } from "../../pages/theodoi/GiaiTrinhPo";
import { Kho, khoGon } from "../../lib/kho";
import { DataTable, type Col } from "../DataTable";

/**
 * Popup xem nhanh 1 EO (95% man hinh). Du lieu: GET /eo/:id (goc) + GET /xem/eo/:id/bo-sung (theo doi, loi, giai trinh,
 * push, mail theodoimuahang, phieu AMIS, canh bao). Trai: tab noi dung; phai: nhat ky hop nhat co loc.
 */
const TT: Record<string, { l: string; c: string }> = {
  CHO_NDK: { l: "Chờ ngày DK", c: "final" }, TRE_NDK: { l: "Trễ hạn chưa ngày DK", c: "reject" },
  QUA_HAN_NDK: { l: "Quá ngày DK", c: "reject" }, CHO_HANG: { l: "Chờ hàng", c: "review" }, DONG: { l: "Đã đóng", c: "issued" },
};
const QUY_TAC: Record<string, string> = { R1: "Không có ngày DK trong 24h/48h", R3: "Không push đối tác", R4: "Quá hạn không cập nhật ngày DK", TAY: "Lỗi ghi khi giải trình" };
const APR: Record<string, { l: string; c: string }> = {
  PENDING: { l: "Chờ xử lý", c: "final" }, APPROVED: { l: "Đồng ý", c: "issued" }, REJECTED: { l: "Từ chối", c: "reject" },
  REQUEST_UPDATE: { l: "Yêu cầu cập nhật", c: "final" }, WITHDRAWN: { l: "Đã rút", c: "nhap" }, SKIPPED: { l: "Bỏ qua", c: "nhap" },
};
type Nhom = "all" | "duyet" | "capnhat" | "kehoach" | "loi" | "mail" | "binhluan";
const NHOM_TL: { k: Nhom; l: string }[] = [
  { k: "all", l: "Tất cả" }, { k: "duyet", l: "Duyệt" }, { k: "capnhat", l: "Cập nhật" }, { k: "kehoach", l: "Kế hoạch" },
  { k: "loi", l: "Lỗi & giải trình" }, { k: "mail", l: "Mail & push" }, { k: "binhluan", l: "Bình luận" },
];
const MAU: Record<Nhom, string> = { all: "#94A3B8", duyet: "#F59E0B", capnhat: "#3B82F6", kehoach: "#10B981", loi: "#EF4444", mail: "#8B5CF6", binhluan: "#64748B" };
const nhomCua = (t: string): Nhom =>
  /SUBMIT|APPROVE|REJECT|REVIEW|ISSUE|RECALL|REQUEST_UPDATE|CANCEL_EO/.test(t) ? "duyet"
    : /PLAN/.test(t) ? "kehoach" : /GIAI_TRINH/.test(t) ? "loi" : "capnhat";

type Tab = "lk" | "kh" | "duyet" | "file" | "mail";
/** Dong cua EO nhan 1 thu: backend (xemNhanh) da gom 1 thu = 1 ban ghi kem item_ids "1,2,3"; ban ghi tung dong (cu) dung eo_item_id. */
const idsThu = (ds: any[]): number[] => ds.flatMap((y) => String(y.item_ids ?? y.eo_item_id ?? "").split(",").filter(Boolean).map(Number));

export default function EoQuickView({ id, onClose, onCloseAll, coTruoc }: { id: number; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const goc = useQuery({ queryKey: ["eo", String(id)], queryFn: () => api.get<any>(`/eo/${id}`) });
  const bs = useQuery({ queryKey: ["eo-bo-sung", id], queryFn: () => api.get<any>(`/xem/eo/${id}/bo-sung`) });
  // giai doan tung dong (cung nguon Quan ly don hang) -> duong tien trinh EO + cot giai doan
  const sdh = useQuery({ queryKey: ["so-don-hang", "eo", id], queryFn: () => api.get<{ giai_doan: GdDef[]; sla: Record<string, number>; rows: any[] }>(`/so-don-hang?eo_id=${id}`) });
  const qv = useQuickView();
  const [tab, setTab] = useState<Tab>("lk");
  const [nhom, setNhom] = useState<Nhom>("all");
  const [cmt, setCmt] = useState("");
  const [busy, setBusy] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  // 1 modal thao tac tai 1 thoi diem; mo len tren popup (Modal zIndex > qv-overlay)
  const [md, setMd] = useState<{ k: string; x?: any } | null>(null);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [pushKq, setPushKq] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [tim, setTim] = useState(""); // tim nhanh trong tab dang mo
  const [timTl, setTimTl] = useState(""); // tim trong nhat ky
  const [xemHuy, setXemHuy] = useState(false); // #29: mac dinh an dong huy / tu choi

  const d = goc.data;
  const b = bs.data;
  const tdBy = useMemo(() => new Map((b?.theo_doi ?? []).map((t: any) => [t.item_id, t])), [b]);
  const itemBy = useMemo(() => new Map((d?.items ?? []).map((i: any) => [i.id, i])), [d]);

  const tl = useMemo(() => {
    if (!d) return [];
    // loai: dung gom muc lien tiep cung loai (NhatKyGop, #30); ma: ma LK cua muc (tom tat nhom)
    const out: { at: string; nhom: Nhom; h: string; ai?: string | null; text?: string; loai?: string; ma?: string | null }[] = [];
    // gom muc trung (lib/gopTrung): su kien giong het (du lieu chuyen tu Sheet cu), loi cung quy tac & han tren nhieu dong,
    // thu luu 1 ban ghi / dong -> 1 muc kem so dong / ma LK
    const lk = (ids: number[]) => lietKe(ids.map((x) => (itemBy.get(x) as any)?.part_code));
    for (const { x: e, ds } of gopTrung(d.events as any[], (e) => `${e.event_type}|${e.entity_type}|${e.entity_id}|${e.created_at}|${moTaSuKien(e) ?? ""}`)) {
      const it = itemBy.get(e.entity_id) as any;
      out.push({ at: e.created_at, nhom: nhomCua(e.event_type), h: `${EVENT_LABEL[e.event_type] ?? e.event_type}${e.entity_type === "eo_item" && it ? ` · ${it.part_code}` : ""}${ds.length > 1 ? ` (×${ds.length})` : ""}`, ai: e.user_email, text: moTaSuKien(e),
        loai: EVENT_LABEL[e.event_type] ?? e.event_type, ma: e.entity_type === "eo_item" ? it?.part_code ?? null : null });
    }
    for (const c of d.comments) out.push({ at: c.created_at, nhom: "binhluan", h: "Bình luận", ai: c.user_email, text: c.noi_dung });
    // loi: 1 muc / (quy tac, trang thai) - "x n lan" (R3 ghi moi thu 2 / thu 4, R4 moi moc qua han), moc = lan gan nhat
    for (const { x: l, ds } of gopTrung((b?.loi ?? []) as any[], (l) => `${l.quy_tac}|${l.trang_thai}`)) {
      const ids = ds.map((y) => y.eo_item_id);
      const moi = ds.map((y) => String(y.han || y.created_at)).sort().pop()!;
      out.push({ at: moi, nhom: "loi", h: `Lỗi: ${QUY_TAC[l.quy_tac] ?? l.quy_tac}${ds.length > 1 ? ` × ${ds.length} lần` : ""} · ${new Set(ids).size > 1 ? `${new Set(ids).size} dòng` : lk(ids)}`, ai: l.ai_email,
        text: `${l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"}${new Set(ids).size > 1 ? ` — ${lk(ids)}` : ""}${ds.length > 1 ? ` · từ ${ngay(ds.map((y) => String(y.han || y.created_at)).sort()[0])} đến ${ngay(moi)}` : ""}` });
    }
    for (const p of b?.push ?? []) out.push({ at: p.created_at, nhom: "mail", h: `Tạo push ${p.ma_push} · ${p.doi_tac}`, ai: p.created_by, text: `${p.so_dong} dòng · ${p.trang_thai === "DA_TAO" ? "đã tạo file" : p.trang_thai === "DA_GUI" ? "đã gửi mail" : "đối tác đã phản hồi"}` });
    for (const { x: m, ds } of gopTrung((b?.mail ?? []) as any[], khoaMail)) {
      const ids = idsThu(ds).filter((x) => itemBy.has(x));
      out.push({ at: m.thoi_gian || m.synced_at, nhom: "mail", h: `${m.huong === "GUI" ? "✉ Gửi" : "✉ Nhận"}: ${m.tieu_de ?? ""}`, ai: m.huong === "GUI" ? m.den : m.tu, loai: m.huong === "GUI" ? "✉ Gửi mail" : "✉ Nhận mail",
        text: [m.tom_tat, ids.length ? `${new Set(ids).size} dòng của EO: ${lk(ids)}` : ""].filter(Boolean).join(" · ") });
    }
    return out.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 1500);
  }, [d, b, itemBy]);

  if (goc.isLoading) return <Spinner />;
  if (!d) return <div style={{ padding: 30 }}>Không tải được EO. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const eo = d.eo;
  const P = quyenEo(eo, me.data);
  // phieu duyet dang cho CHINH TOI o lan trinh dang mo -> nut Dong y / Tu choi / Yeu cau cap nhat ngay tren popup
  const myApr = d.approvals.find((a: any) => a.status === "PENDING" && a.approver_email === me.data?.email &&
    d.submissions.find((s: any) => s.id === a.submission_id)?.status === "PENDING");
  const xong = () => { setMd(null); qc.invalidateQueries(); };
  const activeItems = d.items.filter((i: any) => i.line_status !== "CANCELLED_LINE");
  // DONE (2026-11-08): da ban hanh + moi dong song ve >= SL dat
  const poDone = eo.trang_thai === "ISSUED" && activeItems.length > 0 && activeItems.every((i: any) => (i.chua_dat ?? 0) <= 0);
  const ndkCua = (r: any) => (tdBy.get(r.id) as any)?.ngay_du_kien_gan_nhat ?? d.plans.filter((p: any) => p.eo_item_id === r.id).map((p: any) => p.planned_date).sort().pop() ?? null;
  // dong theo doi (lib/theoDoi) neu co, khong thi dung tu dong EO - du truong cho modal ngay DK / giai trinh / lich su
  const asDong = (r: any): Dong => (tdBy.get(r.id) as Dong) ?? ({
    item_id: r.id, eo_id: id, eo_code: eo.eo_code, ma_phe_duyet: eo.approval_code, id_dat_lk: r.legacy_id ?? "", part_code: r.part_code,
    part_name: r.part_name, kho: r.warehouse, doi_tac: r.supplier, nguoi_dat: eo.created_by, so_luong_dat: r.current_qty,
    sl_nhap_amis: r.da_dat, so_luong_con_thieu: r.chua_dat, ngay_du_kien_gan_nhat: ndkCua(r),
  } as any);
  const coChon = P.issued && P.canEditPlan;
  const chonDuoc = activeItems.filter((r: any) => r.chua_dat > 0);
  const tatCa = chonDuoc.length > 0 && chonDuoc.every((r: any) => chon.has(r.id));
  const doiChon = (rid: number) => setChon((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });
  const push = async () => {
    if (!chon.size || !confirm(`Tạo file push đối tác cho ${chon.size} dòng? (mỗi đối tác 1 file + tiêu đề mail chuẩn)`)) return;
    setErr(""); setBusy(true);
    try { setPushKq(await taoPushDoiTac([...chon])); setChon(new Set()); qc.invalidateQueries(); }
    catch (e: any) { setErr(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền push một số dòng đã chọn." : "Lỗi tạo push."); }
    finally { setBusy(false); }
  };
  const duyetDong = async (r: any) => {
    if (!confirm(`Duyệt dòng ${r.part_code} (SL ${soLuong(r.current_qty)}) thêm sau ban hành?`)) return;
    setErr("");
    try { await api.post(`/eo/items/${r.id}/approve-post-issue`); qc.invalidateQueries(); }
    catch (e: any) { setErr(e?.body?.error === "ONLY_FINAL_APPROVER" ? "Chỉ người duyệt mua của EO được duyệt dòng này." : "Lỗi duyệt dòng."); }
  };
  const loiCho = (b?.loi ?? []).filter((l: any) => l.trang_thai === "CHO_GIAI_TRINH").length;
  // nguoi phu trach tung giai doan -> "Van de theo buoc" (ai tre han)
  const nguoiTD = [...new Set(d.approvals.filter((a: any) => a.step_type === "REVIEW" && a.submission_id === eo.current_submission_id).map((a: any) => ten(a.approver_email)))].join(", ");
  const ncc = [...new Set(activeItems.map((i: any) => i.supplier).filter(Boolean))].join(", ");
  const phuTrach: Record<string, string> = {
    G1: `Người tạo — ${ten(eo.created_by)}`, G2: nguoiTD ? `Thẩm định — ${nguoiTD}` : "Người thẩm định", G3: `Duyệt mua — ${ten(eo.final_approver_email)}`,
    G4: `NV đặt hàng — ${ten(eo.created_by)}`, G5: `NV đặt hàng — ${ten(eo.created_by)}`, G6: `NCC${ncc ? ` — ${ncc}` : ""}`, G8: `NCC${ncc ? ` — ${ncc}` : ""} + NV theo dõi`,
  };
  const k = khopTim(tim);
  const kTl = khopTim(timTl);
  const tlLoc = tl.filter((x) => (nhom === "all" || x.nhom === nhom) && kTl(x));
  // #30: muc lien tiep cung loai + cung nguoi + cach nhau <= 2 gio -> 1 dong "(×n)" (binh luan khong gom)
  const tlGop = gopLienTiep(tlLoc, (x) => (x.nhom === "binhluan" || !x.loai ? null : `${x.nhom}|${x.loai}|${x.ai ?? ""}`), (x) => x.at);

  // ---- #29 bang dong linh kien (DataTable): an don huy mac dinh, dong con thieu len dau (thieu nhieu truoc)
  const huy = (r: any) => r.line_status === "CANCELLED_LINE";
  const soHuy = d.items.filter(huy).length;
  const lkRows = d.items.map((r: any, i: number) => {
    const t = tdBy.get(r.id) as any;
    const kh = d.plans.filter((p: any) => p.eo_item_id === r.id);
    const ndk = t?.ngay_du_kien_gan_nhat ?? kh.map((p: any) => p.planned_date).sort().pop();
    const nm = t?.ngay_nm_cam_ket ?? [...kh].filter((p: any) => p.factory_committed_date).sort((a: any, b: any) => String(a.updated_at ?? a.created_at).localeCompare(String(b.updated_at ?? b.created_at))).pop()?.factory_committed_date;
    const ve = (b?.phieu_nhap ?? []).filter((x: any) => x.matched_eo_item_id === r.id).map((x: any) => x.doc_date).sort().pop();
    const g = (sdh.data?.rows ?? []).find((x: any) => x.item_id === r.id);
    return { r, t, i, ndk, nm, ve, g };
  }).filter((x: any) => (xemHuy || !huy(x.r)) && k({ ...x.r, ...(x.t ?? {}) }))
    .sort((a: any, b: any) => {
      const mo = (x: any) => !huy(x.r) && (x.r.chua_dat ?? 0) > 0;
      return Number(mo(b)) - Number(mo(a)) || (mo(a) ? (b.r.chua_dat ?? 0) - (a.r.chua_dat ?? 0) : 0) || a.i - b.i;
    });
  const lkCols: Col<any>[] = [
    { key: "act", header: <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{coChon && <input type="checkbox" title="Chọn mọi dòng còn thiếu" checked={tatCa} onChange={() => setChon(tatCa ? new Set() : new Set(chonDuoc.map((r: any) => r.id)))} />}Thao tác</span>,
      render: ({ r, t }: any) => { const active = !huy(r); return (
      <span style={{ display: "inline-flex", gap: 2, alignItems: "center", opacity: active ? 1 : 0.6 }} onClick={(e) => e.stopPropagation()}>
        {coChon && (active && r.chua_dat > 0 ? <input type="checkbox" checked={chon.has(r.id)} onChange={() => doiChon(r.id)} title="Chọn để push đối tác" /> : <span style={{ width: 13 }} />)}
        <button className="btn ghost sm" title="Xem đơn hàng: tiến trình giai đoạn, thời gian, lỗi" onClick={() => qv.openDong(r.id)}><I.trend width={14} height={14} /></button>
        {P.issued && active && <button className="btn ghost sm" title="Ngày nhà máy cam kết · dự kiến · hàng về (xem / cập nhật)" onClick={() => setMd({ k: "ndk", x: asDong(r) })}><I.calendar width={14} height={14} /></button>}
        {P.canEditQty && active && <button className="btn ghost sm" title="Sửa số lượng / ghi chú / ID CRM" onClick={() => setMd({ k: "qty", x: r })}><I.edit width={14} height={14} /></button>}
        {P.canSuaThongTin && r.line_status === "ACTIVE" && !poDone && <button className="btn ghost sm" title="Sửa mã LK / kho / đối tác (nhập sai) — ghi lịch sử" onClick={() => setMd({ k: "sua-tt", x: r })}><I.tag width={14} height={14} /></button>}
        {P.issued && P.canManage && r.line_status === "ACTIVE" && <button className="btn ghost sm" title="Thay mã linh kiện tương đương" onClick={() => setMd({ k: "thay", x: r })}><I.refresh width={14} height={14} /></button>}
        {P.issued && P.canEditPlan && active && <button className="btn ghost sm" title="Giải trình lỗi (Ai + Lỗi gì)" style={{ fontWeight: 900, width: 26, color: t?.so_loi_cho_gt ? "var(--danger)" : undefined }} onClick={() => setMd({ k: "gt", x: asDong(r) })}>!</button>}
        {P.issued && <button className="btn ghost sm" title="Lịch sử theo dõi (lỗi, giải trình, push, mail)" onClick={() => setMd({ k: "ls", x: asDong(r) })}><I.clock width={14} height={14} /></button>}
        {P.canApprovePostIssue && r.post_issue_status === "PENDING" && <><button className="btn sm primary" onClick={() => duyetDong(r)}>Duyệt</button> <button className="btn sm danger" onClick={() => setMd({ k: "tuchoi", x: r })}>Từ chối</button></>}
        {P.canCancelLine && r.line_status === "ACTIVE" && r.post_issue_status !== "PENDING" && (r.da_dat ?? 0) > 0 && (r.da_dat ?? 0) < r.current_qty && <button className="btn ghost sm" title={`Kết thúc sớm — SL đặt về đúng SL đã về (${soLuong(r.da_dat)}), không chờ phần còn lại`} onClick={() => setMd({ k: "kts", x: r })}><I.check width={14} height={14} /></button>}
        {P.canCancelLine && r.line_status === "ACTIVE" && r.post_issue_status !== "PENDING" && <button className="btn ghost sm danger" title="Hủy đơn đặt (không đặt nữa, SL đã về không tính) — bắt buộc lý do" onClick={() => setMd({ k: "huy", x: r })}><I.trash width={14} height={14} /></button>}
      </span>); } },
    { key: "stt", header: "#", align: "right", sapXep: true, gt: (x: any) => x.i + 1, render: (x: any) => <span className="muted">{x.i + 1}</span> },
    { key: "ma", header: "Mã LK", loc: "chu", gt: ({ r }: any) => `${r.part_code} ${r.part_code_goc ?? ""}`, gtSap: ({ r }: any) => r.part_code, wrap: true,
      render: ({ r }: any) => <span style={{ whiteSpace: "nowrap", opacity: huy(r) ? 0.6 : 1 }}><DongLink id={r.id} ma={r.part_code} />{r.part_code_goc && <div className="muted" style={{ fontSize: 10.5 }}>thay từ {r.part_code_goc}</div>}<div style={{ marginLeft: -6 }}><NhanSauBH r={r} nguoiDuyet={eo.final_approver_email} /></div>{huy(r) && <span className="badge nhap" style={{ fontSize: 10 }}>Đã hủy / từ chối</span>}</span> },
    { key: "ten", header: "Tên linh kiện", loc: "chu", gt: ({ r }: any) => r.part_name, maxW: 170, render: ({ r }: any) => r.part_name },
    { key: "kho", header: "Kho", loc: "chon", gt: ({ r }: any) => r.warehouse, nhanChon: (v) => (khoGon(v) !== v ? `${khoGon(v)} — ${v}` : v), render: ({ r }: any) => <Kho t={r.warehouse} /> },
    { key: "ncc", header: "Đối tác", loc: "chon", gt: ({ r }: any) => r.supplier ?? "", maxW: 110, render: ({ r }: any) => r.supplier || "—" },
    { key: "dat", header: <Hoi k="SL_DAT" nhan="Đặt" />, align: "right", loc: "so", gt: ({ r }: any) => r.current_qty, render: ({ r }: any) => soLuong(r.current_qty) },
    { key: "ve", header: <Hoi k="SL_VE" nhan="Về" />, align: "right", loc: "so", gt: ({ r }: any) => r.da_dat, render: ({ r }: any) => <span style={{ color: "var(--ok-ink)" }}>{soLuong(r.da_dat)}</span> },
    { key: "thieu", header: <Hoi k="SL_THIEU" nhan="Thiếu" />, align: "right", loc: "so", gt: ({ r }: any) => r.chua_dat, render: ({ r }: any) => <b>{soLuong(r.chua_dat)}</b> },
    { key: "ngay", header: <><NhanNgay k="NM" ngan /><br /><NhanNgay k="DK" ngan /><br /><NhanNgay k="VE" ngan /></>, loc: "ngay", gt: (x: any) => x.ndk, wrap: true,
      render: (x: any) => <BaNgay nm={x.nm} dk={x.ndk} ve={x.ve} veDu={x.r.da_dat >= x.r.current_qty} /> },
    { key: "td", header: "Theo dõi", loc: "chon", gt: ({ t }: any) => (t ? TT[t.tinh_trang]?.l ?? t.tinh_trang : ""), wrap: true,
      render: ({ t }: any) => t ? <span style={{ whiteSpace: "nowrap" }}><span className={`badge ${TT[t.tinh_trang]?.c ?? "nhap"}`}>{TT[t.tinh_trang]?.l}</span>{t.so_loi > 0 && <span className="badge reject" style={{ marginLeft: 4 }}>{t.so_loi} lỗi</span>}{t.ceo_ly_do.length > 0 && <span className="badge reject" style={{ marginLeft: 4 }} title={ceoTxt(t.ceo_chi_tiet, t.ceo_ly_do)}>CEO</span>}</span> : <span className="muted">—</span> },
    { key: "gd", header: <span title="8 giai đoạn: bấm để xem chi tiết đơn hàng (thời gian, hạn, lỗi từng bước)">Tiến trình</span>, loc: "chon", gt: ({ g }: any) => g?.gd_hien_tai_ten ?? "", wrap: true,
      render: ({ r, t, g }: any) => g ? <TienTrinhGon r={g} soLoi={t?.so_loi} loiCho={t?.so_loi_cho_gt} onClick={() => qv.openDong(r.id)} /> : <span className="muted">—</span> },
    { key: "gc", header: "Ca / ghi chú", loc: "chu", gt: ({ r }: any) => [r.crm_id && `Ca ${r.crm_id}`, r.order_id, r.ghi_chu].filter(Boolean).join(" · "), maxW: 120,
      render: ({ r }: any) => [r.crm_id && `Ca ${r.crm_id}`, r.order_id, r.ghi_chu].filter(Boolean).join(" · ") || "—" },
  ];

  const guiBinhLuan = async () => {
    if (!cmt.trim()) return;
    setBusy(true);
    try { await api.post(`/eo/${id}/comments`, { noi_dung: cmt.trim() }); setCmt(""); qc.invalidateQueries({ queryKey: ["eo", String(id)] }); }
    finally { setBusy(false); }
  };

  const mailGop = gopTrung((b?.mail ?? []) as any[], khoaMail);
  const tabs: { k: Tab; l: string }[] = [
    { k: "lk", l: `Linh kiện (${d.items.length})` },
    { k: "kh", l: `Kế hoạch & hàng về (${d.plans.length} · ${(b?.phieu_nhap ?? []).length})` },
    { k: "duyet", l: `Quy trình duyệt (${d.submissions.length})` },
    { k: "file", l: `Tài liệu (${d.files.length})` },
    { k: "mail", l: `Mail & push (${mailGop.length + (b?.push ?? []).length})` },
  ];

  return (
    <>
      <div className="qv-head">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll} actions={<>
          {myApr && actionsFor(myApr.step_type).map((a) => (
            <button key={a.key} className={`btn sm ${a.cls || ""}`} onClick={() => setMd({ k: "duyet", x: { row: { id: myApr.id, eo_code: eo.eo_code }, action: a.key } })}>
              {a.key === "approve" && <I.check width={13} height={13} />} {a.label}
            </button>
          ))}
          {P.canEditDraft && <button className="btn sm" onClick={() => { onCloseAll(); nav(`/eo/${id}/edit`); }}><I.edit width={13} height={13} /> Sửa / gửi trình</button>}
          {P.canRecall && <button className="btn sm" onClick={() => setMd({ k: "recall" })}><I.edit width={13} height={13} /> Rút về &amp; sửa</button>}
          {P.canCancel && <button className="btn sm ghost danger" onClick={() => setMd({ k: "cancel" })}><I.x width={13} height={13} /> Hủy EO</button>}
          {P.canKetThucSomPo && !poDone && <button className="btn sm" title="Mọi dòng đang chờ hàng: SL đặt = SL đã về thực tế (xem trước + cảnh báo)" onClick={() => setMd({ k: "kts-po" })}><I.check width={13} height={13} /> Kết thúc sớm PO</button>}
          {loiCho > 0 && <button className="btn sm" title="1 nội dung giải trình cho mọi linh kiện có lỗi trong PO này" onClick={() => setMd({ k: "gt-po" })}>Giải trình cả PO ({loiCho} lỗi)</button>}
          {P.canCopy && <button className="btn sm" title="Tạo EO mới với thông tin phiếu giống EO này (không chép danh sách linh kiện)" onClick={() => { onCloseAll(); nav(`/eo/new?copy=${id}`); }}><I.copy width={13} height={13} /> Copy EO</button>}
        </>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "var(--brand-ink)" }}>{eo.eo_code}</span>
            <StatusBadge status={poDone ? "DONE" : eo.trang_thai} />
            {eo.approval_code ? <span className="badge issued">{eo.approval_code}</span> : <span className="badge nhap">Chưa ban hành</span>}
            <Clip w="min(60vw, 720px)" style={{ fontSize: 15, fontWeight: 600 }}>{eo.tieu_de || "(không tiêu đề)"}</Clip>
          </div>
          <div className="muted qv-meta" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 12, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span>Người tạo <b>{ten(eo.created_by)}</b> · {ngayGio(eo.created_at)}</span>
            <span>Phòng ban <b>{eo.phong_ban || "—"}</b></span>
            <span>Loại hình <b>{eo.loai_hinh || "—"}</b></span>
            <span>Duyệt mua <b>{ten(eo.final_approver_email)}</b></span>
            {eo.issued_at && <span>Ban hành <b>{ngayGio(eo.issued_at)}</b></span>}
            {eo.cancelled_at && <span style={{ color: "var(--danger-ink)" }}>Hủy {ngayGio(eo.cancelled_at)}{eo.cancel_reason ? ` — ${eo.cancel_reason}` : ""}</span>}
            {/* so lieu chinh ngay tren dong thong tin; o so lieu day du + canh bao nam trong "Xem chi tiết" cua QuyTrinh (#22) */}
            <span>Đặt <b>{soLuong(d.tong.tong_sl_dat)}</b> · về <b style={{ color: "var(--ok-ink)" }}>{soLuong(d.tong.sl_da_dat)}</b> · thiếu <b style={{ color: d.tong.sl_chua_dat > 0 ? "var(--warn-ink)" : undefined }}>{soLuong(d.tong.sl_chua_dat)}</b></span>
            {(b?.canh_bao ?? []).length > 0 && <span title={b.canh_bao.map((c: any) => c.text).join("\n")} style={{ color: "var(--danger-ink)", fontWeight: 700 }}>⚠ {b.canh_bao.length} cảnh báo</span>}
          </div>
        </QvHeader>
        {/* THU GON = chi 1 dong quy trinh (~80% man cho danh sach); so lieu + canh bao + hang ve + van de theo buoc trong "Xem chi tiết" */}
        {sdh.data && <QuyTrinh defs={sdh.data.giai_doan} sla={sdh.data.sla} rows={sdh.data.rows} loi={b?.loi ?? []}
          phieuNhap={bs.data ? b?.phieu_nhap ?? [] : undefined} slDat={d.tong.tong_sl_dat} phuTrach={phuTrach}
          chiTiet={<>
            <div className="qv-kpis" style={{ marginTop: 6 }}>
              <Kpi l="Số dòng" v={soLuong(d.tong.so_dong)} />
              <Kpi l="Tổng SL đặt" v={soLuong(d.tong.tong_sl_dat)} />
              <Kpi l="Đã về (AMIS)" v={soLuong(d.tong.sl_da_dat)} tone="ok" />
              <Kpi l="Còn thiếu" v={soLuong(d.tong.sl_chua_dat)} tone={d.tong.sl_chua_dat > 0 ? "warn" : undefined} />
              <Kpi l="Tiền dự kiến" v={tien(d.tong.tong_tien_du_kien)} />
              <Kpi l="Lỗi chờ giải trình" v={soLuong(loiCho)} tone={loiCho ? "danger" : undefined} />
              <Kpi l="Tài liệu" v={soLuong(d.files.length)} />
            </div>
            <div className="qv-alerts">
              {bs.isLoading ? <span className="muted" style={{ fontSize: 12 }}>Đang kiểm tra cảnh báo…</span>
                : (b?.canh_bao ?? []).length === 0 ? <span className="qv-alert ok">✓ Không có cảnh báo</span>
                : b.canh_bao.map((c: any, i: number) => <span key={i} className={`qv-alert ${c.muc}`}>{c.muc === "danger" ? "⚠ " : c.muc === "warn" ? "! " : "i "}{c.text}</span>)}
            </div>
          </>} />}
      </div>

      <div className="qv-body">
        {/* ------- trai: noi dung ------- */}
        <div className="qv-col">
          <div className="qv-tabs">{tabs.map((t) => <button key={t.k} className={`qv-tab ${tab === t.k ? "on" : ""}`} onClick={() => { setTab(t.k); setTim(""); }}>{t.l}</button>)}{["lk", "mail"].includes(tab) && <input className="input qv-tim" placeholder="🔍 Tìm nhanh trong tab (không dấu)…" value={tim} onChange={(e) => setTim(e.target.value)} />}</div>
          <div className="qv-scroll">
            {tab === "lk" && (
              <div className="qv-toolbar">
                <button className="btn sm" title="Tải Excel mọi dòng linh kiện của EO (kèm kế hoạch, hàng về, theo dõi)" onClick={() => xuatDongEo(eo, d.items, d.plans, b)}><I.download width={13} height={13} /> Tải danh sách linh kiện</button>
                {P.issued && coChon && <>
                  <button className="btn sm primary" disabled={!chon.size || busy} onClick={push}><I.send width={13} height={13} /> Push đối tác ({chon.size})</button>
                  <button className="btn sm" onClick={() => setMd({ k: "bulk" })}><I.calendar width={13} height={13} /> Lập kế hoạch hàng loạt</button>
                </>}
                {P.issued && P.canManage && <button className="btn sm" onClick={() => setMd({ k: "add" })}><I.plus width={13} height={13} /> Thêm dòng (duyệt sau BH)</button>}
                <span className="sp muted" style={{ fontSize: 11.5 }}>Cột Thao tác: 3 loại ngày · sửa dòng · thay mã · ! giải trình · lịch sử</span>
              </div>
            )}
            {err && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "6px 12px" }}>{err}</div>}
            {tab === "lk" && (
              // #29 (2026-11-08): bang dung chung DataTable - loc / sap xep kieu Excel tren tieu de; mac dinh AN don huy / tu choi
              // (tick "Xem cả đơn hủy"); thu tu mac dinh: dong con thieu len dau, thieu nhieu xep truoc. Loc tren may nguoi dung.
              <>
                <label className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, padding: "6px 12px" }}>
                  <input type="checkbox" checked={xemHuy} onChange={(e) => setXemHuy(e.target.checked)} />
                  Xem cả đơn hủy / từ chối{soHuy ? ` (${soHuy})` : ""}
                </label>
                <DataTable timKiem={false} cols={lkCols} rows={lkRows} keyOf={(x: any) => x.r.id} empty="Không có dòng linh kiện khớp bộ lọc" />
              </>
            )}
            {tab === "kh" && (
              <>
                <div className="qv-pad">
                  <TabKeHoach eo={eo} items={d.items} plans={d.plans} issued={P.issued} canEdit={P.canEditPlan} onChanged={() => qc.invalidateQueries()} />
                </div>
                {(b?.phieu_khong_khop ?? []).length > 0 && (
                  <>
                    <div className="qv-sec" style={{ color: "var(--warn-ink)" }}>Phiếu AMIS có mã {eo.approval_code} nhưng KHÔNG khớp dòng</div>
                    <table className="tbl tbl-dense">
                      <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th>Mã hàng</th><th>Tên hàng</th><th style={{ textAlign: "right" }}>SL</th></tr></thead>
                      <tbody>{b.phieu_khong_khop.filter(k).map((r: any) => <tr key={r.id}><td>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td><Clip w={180}>{r.warehouse_name}</Clip></td><td><PartLink ma={r.part_code} /></td><td><Clip w={190}>{r.part_name}</Clip></td><td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td></tr>)}</tbody>
                    </table>
                  </>
                )}
              </>
            )}
            {tab === "duyet" && (
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {d.submissions.length === 0 && <div className="muted">Chưa gửi trình duyệt.</div>}
                {[...d.submissions].reverse().map((s: any) => (
                  <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, opacity: ["SUPERSEDED", "CANCELLED"].includes(s.status) ? 0.6 : 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Lần trình #{s.version} · {ten(s.submitted_by)} · {ngayGio(s.submitted_at)} <span className="badge nhap" style={{ marginLeft: 6 }}>{s.status}</span></div>
                    {s.note && <div className="muted" style={{ fontSize: 12 }}>{s.note}</div>}
                    {d.approvals.filter((a: any) => a.submission_id === s.id).map((a: any) => (
                      <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 6 }}>
                        <span className="badge nhap">{a.step_type === "FINAL" ? "Duyệt mua trên hệ thống" : "Thẩm định"}</span>
                        <b>{ten(a.approver_email)}</b>
                        <span className={`badge ${APR[a.status]?.c ?? "nhap"}`}>{APR[a.status]?.l ?? a.status}</span>
                        <span className="muted">{a.action_at ? ngayGio(a.action_at) : `giao ${ngayGio(a.assigned_at)}`}</span>
                        {a.comment && <Clip w={360} style={{ color: "var(--text-muted)" }}>— {a.comment}</Clip>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {tab === "file" && (
              <div className="qv-pad">
                <TabTaiLieu eoId={String(id)} files={d.files} onUploaded={() => qc.invalidateQueries()} canDelete={P.canDeleteFile}
                  myEmail={me.data?.email} preIssue={!["ISSUED", "CANCELLED"].includes(eo.trang_thai)} />
              </div>
            )}
            {tab === "mail" && (
              <>
                {coChon && <div className="qv-toolbar"><span className="muted" style={{ fontSize: 12 }}>Tạo push mới: tab <b>Linh kiện</b> → tick dòng còn thiếu → <b>Push đối tác</b>.</span>
                  <button className="btn sm" onClick={() => setTab("lk")}>Chọn dòng để push</button></div>}
                <div className="qv-sec">Đợt push đối tác</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Mã push</th><th>Đối tác</th><th style={{ textAlign: "right" }}>Dòng</th><th>Trạng thái</th><th>Người tạo</th><th>Lúc</th></tr></thead>
                  <tbody>
                    {(b?.push ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa push đối tác.</td></tr>}
                    {(b?.push ?? []).filter(k).map((p: any) => <tr key={p.id}><td style={{ fontFamily: "monospace" }}>{p.ma_push}</td><td><Clip w={160}>{p.doi_tac}</Clip></td><td style={{ textAlign: "right" }}>{p.so_dong}</td><td><span className="badge nhap">{p.trang_thai === "DA_TAO" ? "Đã tạo file" : p.trang_thai === "DA_GUI" ? "Đã gửi" : "Đã phản hồi"}</span></td><td>{ten(p.created_by)}</td><td>{ngayGio(p.created_at)}</td></tr>)}
                  </tbody>
                </table>
                <div className="qv-sec">Luồng mail theodoimuahang@gmail.com</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th></th><th>Lúc</th><th>Từ → Đến</th><th>Tiêu đề / tóm tắt</th><th title="Thư chung cho nhiều dòng — app đọc mail lưu 1 bản ghi / dòng">Dòng của EO</th></tr></thead>
                  <tbody>
                    {mailGop.length === 0 && <tr><td colSpan={5} className="muted">Chưa có mail đồng bộ (app theo-doi-mua-hang).</td></tr>}
                    {mailGop.filter(({ x }) => k(x)).map(({ x: m, ds }) => {
                      const ids = idsThu(ds).filter((x: number) => itemBy.has(x));
                      return <tr key={m.id}><td>{m.huong === "GUI" ? "→" : "←"}</td><td style={{ whiteSpace: "nowrap" }}>{ngayGio(m.thoi_gian)}</td><td><Clip w={220}>{m.tu} → {m.den}</Clip></td><td><Clip w={420}><b>{m.tieu_de}</b>{m.tom_tat ? ` — ${m.tom_tat}` : ""}</Clip></td>
                        <td><Clip w={160}>{ids.length ? `${new Set(ids).size}: ${lietKe(ids.map((x: number) => (itemBy.get(x) as any)?.part_code))}` : "—"}</Clip></td></tr>;
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        {/* ------- phai: nhat ky ------- */}
        <div className="qv-col">
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>Nhật ký xử lý ({tlLoc.length}{tlGop.length < tlLoc.length ? ` — gọn ${tlGop.length} mục` : ""})</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {NHOM_TL.map((n) => <button key={n.k} className={`qv-chip ${nhom === n.k ? "on" : ""}`} onClick={() => setNhom(n.k)}>{n.l}</button>)}
              <input className="input" style={{ height: 28, fontSize: 12, marginTop: 6, width: "100%" }} placeholder="🔍 Tìm trong nhật ký (người, mã LK, nội dung…)" value={timTl} onChange={(e) => setTimTl(e.target.value)} />
            </div>
          </div>
          <div className="qv-scroll">
            <NhatKyGop nhom={tlGop} khoa={(x, i) => `${i}|${x.at}|${x.h}`} dot={(x) => MAU[x.nhom]} luc={(x) => x.at} ai={(x) => (x.ai ? ten(x.ai) : null)}
              tieu={(x) => x.h} tieuNhom={(x) => x.loai ?? x.h} moTa={(x) => x.text ?? null}
              tomTat={(ds) => { const ma = lietKe(ds.map((y) => y.ma), 6); return ma ? `Mã LK: ${ma}` : ds[0].text ?? null; }} />
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 6 }}>
            <input className="input" placeholder="Viết bình luận / trao đổi…" value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guiBinhLuan()} />
            <button className="btn primary" disabled={busy || !cmt.trim()} onClick={guiBinhLuan}>Gửi</button>
          </div>
        </div>
      </div>

      {md?.k === "duyet" && <ApprovalActionModal act={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "recall" && <RecallModal eo={eo} onClose={() => setMd(null)} onDone={() => { xong(); onCloseAll(); nav(`/eo/${id}/edit`); }} />}
      {md?.k === "cancel" && <CancelModal eo={eo} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "qty" && <QtyModal item={md.x} issued={P.issued} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "thay" && <ReplacePartModal item={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "add" && <AddItemModal eoId={String(id)} phongBan={eo.phong_ban} nguoiDuyet={eo.final_approver_email} meEmail={me.data?.email} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "bulk" && <BulkPlanModal po={eo.approval_code || eo.eo_code} items={activeItems} plans={d.plans} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "ndk" && <NgayHangVeModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "gt-po" && <GiaiTrinhPoModal eoId={id} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "gt" && <GiaiTrinhModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "huy" && <HuyDongModal item={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "sua-tt" && <SuaThongTinDongModal item={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "kts-po" && <KetThucSomPoModal eo={eo} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "kts" && <KetThucSomModal item={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "tuchoi" && <TuChoiDongModal item={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "ls" && <LichSuModal dong={md.x} onClose={() => setMd(null)} />}
      {pushKq && <PushKetQua dot={pushKq} onClose={() => setPushKq(null)} />}
    </>
  );
}
