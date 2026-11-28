import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, tien, ngay, ngayGio, ngayNgan, ten } from "../../lib/format";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { I } from "../../lib/icons";
import { BaNgay, NhanNgay } from "../../lib/ngay";
import { Hoi } from "../../lib/thuatNgu";
import { khopTim } from "../../lib/tonDong";
import { QvHeader, Kpi, DongLink, PartLink, useQuickView, O_TIM, useAnPhu, KhuTieuDe, CotPhu } from "./QuickView";
import { QuyTrinh, TienTrinhGon, ceoTxt, KIEU_TXT, type GdDef } from "../TienTrinh";
import { GdBadge } from "../../lib/giaiDoan";
import { BangLoiTheoBuoc } from "../BangLoiTheoBuoc";
import { TienTrinhPo } from "../TienTrinhPo";
import {
  quyenEo, TabKeHoach, TabTaiLieu, QtyModal, CancelModal, ReopenModal, RecallModal, ReplacePartModal, AddItemModal, BulkPlanModal,
  actionsFor, ApprovalActionModal, NhanSauBH, TuChoiDongModal, HuyDongModal, KetThucSomModal, SuaThongTinDongModal, KetThucSomPoModal, xuatDongEo,
} from "../../pages/eo/eoActions";
import { gopTrung, gopLienTiep, khoaMail, lietKe } from "../../lib/gopTrung";
import { NhatKyGop } from "../NhatKyGop";
import { type Dong, NgayHangVeModal, GiaiTrinhModal, LichSuModal, taoPushDoiTac, PushKetQua, BAT_TAO_MAIL_NHAC, type MailNhac, LienHeDoiTacModal } from "../../pages/theodoi/shared";
import { GiaiTrinhPoModal } from "../../pages/theodoi/GiaiTrinhPo";
import { Kho, khoGon } from "../../lib/kho";
import { DataTable, type Col } from "../DataTable";
import { MenuXo } from "../MenuXo";

/**
 * Popup xem nhanh 1 EO (95% man hinh). Du lieu: GET /eo/:id (goc) + GET /xem/eo/:id/bo-sung (theo doi, loi, giai trinh,
 * push, mail theodoimuahang, phieu AMIS, canh bao). Trai: tab noi dung; phai: nhat ky hop nhat co loc.
 */
const TT: Record<string, { l: string; c: string }> = {
  CHO_NDK: { l: "Chờ ngày DK", c: "final" }, TRE_NDK: { l: "Trễ hạn chưa ngày DK", c: "reject" },
  QUA_HAN_NDK: { l: "Quá ngày DK", c: "reject" }, CHO_HANG: { l: "Chờ hàng", c: "review" }, DONG: { l: "Đã đóng", c: "issued" },
};
const QUY_TAC: Record<string, string> = { R5: "Chậm duyệt (người duyệt)", R1: "Không có ngày DK trong 8h/16h LV", R3: "Không push đối tác", R4: "Quá hạn không cập nhật ngày DK", TAY: "Lỗi ghi khi giải trình" };
const APR: Record<string, { l: string; c: string }> = {
  PENDING: { l: "Chờ xử lý", c: "final" }, APPROVED: { l: "Đồng ý", c: "issued" }, REJECTED: { l: "Từ chối", c: "reject" },
  REQUEST_UPDATE: { l: "Yêu cầu cập nhật", c: "final" }, WITHDRAWN: { l: "Đã rút", c: "nhap" }, SKIPPED: { l: "Bỏ qua", c: "nhap" },
};
type Nhom = "all" | "duyet" | "capnhat" | "kehoach" | "loi" | "mail" | "binhluan";
const NHOM_TL: { k: Nhom; l: string }[] = [
  { k: "all", l: "Tất cả" }, { k: "duyet", l: "Duyệt" }, { k: "capnhat", l: "Cập nhật" }, { k: "kehoach", l: "Kế hoạch" },
  { k: "loi", l: "Lỗi & giải trình" }, { k: "mail", l: "Mail & push" }, { k: "binhluan", l: "Bình luận" },
];
const MAU: Record<Nhom, string> = { all: "#86868b", duyet: "#ff9500", capnhat: "#0a84ff", kehoach: "#10B981", loi: "#ff3b30", mail: "#af52de", binhluan: "#6e6e73" };
const nhomCua = (t: string): Nhom =>
  /SUBMIT|APPROVE|REJECT|REVIEW|ISSUE|RECALL|REQUEST_UPDATE|CANCEL_EO|REOPEN_EO/.test(t) ? "duyet"
    : /PLAN/.test(t) ? "kehoach" : /GIAI_TRINH/.test(t) ? "loi" : "capnhat";

// v0.131: bo tab "Quy trình duyệt" + "Mail & push" (trung nhat ky: nhom Duyệt / Mail & push) - phieu dang cho duyet hien o khu phu
type Tab = "lk" | "kh" | "file" | "loi";
/** Dong cua EO nhan 1 thu: backend (xemNhanh) da gom 1 thu = 1 ban ghi kem item_ids "1,2,3"; ban ghi tung dong (cu) dung eo_item_id. */
const idsThu = (ds: any[]): number[] => ds.flatMap((y) => String(y.item_ids ?? y.eo_item_id ?? "").split(",").filter(Boolean).map(Number));

export default function EoQuickView({ id, locLoi, moTaLoc, onClose, onCloseAll, coTruoc }: { id: number; locLoi?: boolean | number[]; moTaLoc?: string; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const goc = useQuery({ queryKey: ["eo", String(id)], queryFn: () => api.get<any>(`/eo/${id}`) });
  const bs = useQuery({ queryKey: ["eo-bo-sung", id], queryFn: () => api.get<any>(`/xem/eo/${id}/bo-sung`) });
  // giai doan tung dong (cung nguon Quan ly don hang) -> duong tien trinh EO + cot giai doan
  const sdh = useQuery({ queryKey: ["so-don-hang", "eo", id], queryFn: () => api.get<{ giai_doan: GdDef[]; sla: Record<string, number>; rows: any[] }>(`/so-don-hang?eo_id=${id}`) });
  const qv = useQuickView();
  const [tab, setTab] = useState<Tab>("lk");
  // v0.141 (chu he thong 2026-11-27 "danh sach loi, an vao se filter san cac lk co loi trong PO do"): chi hien dong LK co loi
  // (bat san khi mo tu cot loi / danh sach loi; bam o "Lỗi chờ GT", canh bao loi, tab Loi -> nut "Xem các LK có lỗi")
  const [chiCeo, setChiCeo] = useState(false);
  const [locGd, setLocGd] = useState<{ k: string; ids: Set<number>; kieu: "dang" | "loi" | "qua" } | null>(null);
  // v0.145: cot phai - tab "Tổng quát" (o so, canh bao, cho duyet) thay khoi tren cung; mac dinh nhat ky
  const [xemTq, setXemTq] = useState(false);
  const [chiLoi, setChiLoi] = useState(Array.isArray(locLoi) ? locLoi.length > 0 : !!locLoi);
  // v0.143: mo tu man Loi theo PO dang loc (vd G4) -> chi cac LK dinh loi dang loc (danh sach id truyen vao), khong phai moi LK co loi
  const dsLocVao = Array.isArray(locLoi) && locLoi.length ? new Set(locLoi) : null;
  const xemLkLoi = () => { setChiLoi(true); setTab("lk"); };
  const [nhom, setNhom] = useState<Nhom>("all");
  const [cmt, setCmt] = useState("");
  const [busy, setBusy] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  // 1 modal thao tac tai 1 thoi diem; mo len tren popup (Modal zIndex > qv-overlay)
  const [md, setMd] = useState<{ k: string; x?: any } | null>(null);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [pushKq, setPushKq] = useState<MailNhac | null>(null);
  const [lh, setLh] = useState<number[] | null>(null); // ghi nhan nhac doi tac (goi dien / tin nhan)
  const [err, setErr] = useState("");
  const [tim, setTim] = useState(""); // tim nhanh trong tab dang mo
  const [timTl, setTimTl] = useState(""); // tim trong nhat ky
  const [xemHuy, setXemHuy] = useState(false); // #29: mac dinh an dong huy / tu choi
  const [anPhu, setAnPhu] = useAnPhu(); // v0.131: thu gon khu phu (tien do, lich su)

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
    for (const p of b?.push ?? []) out.push({ at: p.created_at, nhom: "mail", h: `Tạo push ${p.ma_push} · ${p.doi_tac}`, ai: p.created_by, text: `${p.so_dong} dòng · ${p.trang_thai === "DA_TAO" ? "chưa gửi" : p.trang_thai === "DA_GUI" ? "đã gửi mail" : "đối tác đã phản hồi"}` });
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
    if (!chon.size || !confirm(`Tạo mail nhắc cho ${chon.size} dòng?`)) return;
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
  // v0.093: dem VI PHAM GOP (cung loi + cung PO + cung ky) dang cho, khong dem tung dong
  // v0.143 (gop popup PO man "Loi theo PO" vao day): loi TINH thong ke (moc tu 20/11/2026, bo vi pham cu - backend tinh) -> o so doi tac / noi bo, cot Loi gi / Ai loi
  const loiTinh = (b?.loi ?? []).filter((l: any) => l.tinh);
  const loiTinhDong = (itemId: number) => loiTinh.filter((l: any) => l.eo_item_id === itemId);
  const aiLoi = (l: any) => (l.ben === "NCC" ? `NCC · ${l.doi_tac || "?"}` : ten(l.nguoi_vp) || "—");
  const demTxt = (ds: any[], f: (l: any) => string) => { const m = new Map<string, number>(); ds.forEach((l) => m.set(f(l), (m.get(f(l)) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
  const loiCho = new Set((b?.loi ?? []).filter((l: any) => l.trang_thai === "CHO_GIAI_TRINH").map((l: any) => l.vp_khoa ?? l.id)).size;
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
  // v0.124: dong da ket thuc (huy / ket thuc som / ve du) -> khong con viec duyet dong sau BH (khop backend lib/choDuyetSauBh)
  const dongKetThuc = (r: any) => r.line_status !== "ACTIVE" || !!r.ket_thuc_som_at || (r.da_dat ?? 0) >= r.current_qty;
  const soHuy = d.items.filter(huy).length;
  // dong co loi: moi loi da ghi tren dong (tl_loi qua /xem/eo/:id/bo-sung) + dong theo doi co so_loi > 0
  // v0.143: dong co loi = co loi TINH thong ke (moc tu 20/11/2026 - luat 15 CLAUDE.md), khop man Loi theo PO
  const dongCoLoi = new Set<number>(loiTinh.map((l: any) => l.eo_item_id));
  // v0.147 (chu he thong "PO nay co bao loi CEO ma mo UI len toi khong biet phai tim cai loi CEO do o dau"): dong dang cap CEO (lui >= 3 / ngay DK >= 30 ngay / >= 3 loi)
  const dongCeo = new Set<number>(d.items.filter((r: any) => ((tdBy.get(r.id) as any)?.ceo_ly_do?.length ?? 0) > 0).map((r: any) => r.id));
  const xemCeo = () => { setChiCeo(true); setTab("lk"); };
  const lkRows = d.items.map((r: any, i: number) => {
    const t = tdBy.get(r.id) as any;
    const kh = d.plans.filter((p: any) => p.eo_item_id === r.id);
    const ndk = t?.ngay_du_kien_gan_nhat ?? kh.map((p: any) => p.planned_date).sort().pop();
    const nm = t?.ngay_nm_cam_ket ?? [...kh].filter((p: any) => p.factory_committed_date).sort((a: any, b: any) => String(a.updated_at ?? a.created_at).localeCompare(String(b.updated_at ?? b.created_at))).pop()?.factory_committed_date;
    const ve = (b?.phieu_nhap ?? []).filter((x: any) => x.matched_eo_item_id === r.id).map((x: any) => x.doc_date).sort().pop();
    const g = (sdh.data?.rows ?? []).find((x: any) => x.item_id === r.id);
    return { r, t, i, ndk, nm, ve, g };
  }).filter((x: any) => (xemHuy || !huy(x.r)) && (!chiLoi || (dsLocVao ?? dongCoLoi).has(x.r.id)) && (!locGd || locGd.ids.has(x.r.id)) && (!chiCeo || dongCeo.has(x.r.id)) && k({ ...x.r, ...(x.t ?? {}) }))
    .sort((a: any, b: any) => {
      // v0.145 (chu he thong): con ton truoc - ton LAU truoc (gio lam viec o giai doan hien tai, roi ngay tao som), roi ton SL nhieu - da xong - da huy
      const nhom = (x: any) => (huy(x.r) ? 2 : dongKetThuc(x.r) || (x.r.chua_dat ?? 0) <= 0 ? 1 : 0);
      return nhom(a) - nhom(b)
        || (nhom(a) === 0 ? (b.g?.gd_gio ?? 0) - (a.g?.gd_gio ?? 0) : 0)
        || (nhom(a) === 0 ? String(a.r.created_at ?? "").localeCompare(String(b.r.created_at ?? "")) : 0)
        || (nhom(a) === 0 ? (b.r.chua_dat ?? 0) - (a.r.chua_dat ?? 0) : 0) || a.i - b.i;
    });
  const lkCols: Col<any>[] = [
    { key: "act", header: <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{coChon && <input type="checkbox" title="Chọn mọi dòng còn thiếu" checked={tatCa} onChange={() => setChon(tatCa ? new Set() : new Set(chonDuoc.map((r: any) => r.id)))} />}Thao tác</span>,
      // v0.124 (chu he thong 2026-11-26 "hien qua nhieu thao tac, rut gon lai 1 nut xo xuong hoac click vao de mo UI don chi tiet"): moi thao tac dong
      // gom vao 1 nut "⋯" (MenuXo); bam dong -> popup don dat (DongQuickView). Duyet / Tu choi dong sau BH chi con khi dong CHUA ket thuc
      // (chua ve du / chua ket thuc som / chua huy - khop backend lib/choDuyetSauBh), van de ngoai vi la thao tac chinh.
      render: ({ r, t }: any) => { const active = !huy(r); const ketThuc = dongKetThuc(r); const ic = { width: 14, height: 14 }; return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", opacity: active ? 1 : 0.6 }} onClick={(e) => e.stopPropagation()}>
        {coChon && (active && r.chua_dat > 0 ? <input type="checkbox" checked={chon.has(r.id)} onChange={() => doiChon(r.id)} title="Chọn để push đối tác" /> : <span style={{ width: 13 }} />)}
        <MenuXo title="Thao tác dòng này" muc={[
          { l: "Xem chi tiết đơn đặt", icon: <I.trend {...ic} />, onClick: () => qv.openDong(r.id), title: "Tiến trình giai đoạn, thời gian, lỗi" },
          { l: "Ngày NM cam kết / dự kiến / hàng về", icon: <I.calendar {...ic} />, onClick: () => setMd({ k: "ndk", x: asDong(r) }), an: !(P.issued && active) },
          { l: <>Giải trình lỗi{t?.so_loi_cho_gt ? <b style={{ color: "var(--danger)" }}> ({t.so_loi_cho_gt} chờ)</b> : null}</>, icon: <b style={{ color: t?.so_loi_cho_gt ? "var(--danger)" : undefined }}>!</b>,
            onClick: () => setMd({ k: "gt", x: asDong(r) }), an: !(P.issued && P.canEditPlan && active) },
          { l: "Lịch sử theo dõi", icon: <I.clock {...ic} />, onClick: () => setMd({ k: "ls", x: asDong(r) }), title: "Lỗi, giải trình, push, mail", an: !P.issued },
          { l: "Sửa số lượng / ghi chú / ID CRM", icon: <I.edit {...ic} />, onClick: () => setMd({ k: "qty", x: r }), an: !(P.canEditQty && active), ngan: true },
          { l: "Sửa mã LK / kho / đối tác", icon: <I.tag {...ic} />, onClick: () => setMd({ k: "sua-tt", x: r }), title: "Nhập sai — ghi lịch sử", an: !(P.canSuaThongTin && r.line_status === "ACTIVE" && !poDone) },
          { l: "Thay mã linh kiện tương đương", icon: <I.refresh {...ic} />, onClick: () => setMd({ k: "thay", x: r }), an: !(P.issued && P.canManage && r.line_status === "ACTIVE") },
          { l: `Kết thúc sớm (về ${soLuong(r.da_dat)})`, icon: <I.check {...ic} />, onClick: () => setMd({ k: "kts", x: r }), ngan: true,
            title: `SL đặt về đúng SL đã về (${soLuong(r.da_dat)}), không chờ phần còn lại`,
            an: !(P.canCancelLine && r.line_status === "ACTIVE" && r.post_issue_status !== "PENDING" && (r.da_dat ?? 0) > 0 && (r.da_dat ?? 0) < r.current_qty) },
          { l: "Hủy đơn đặt", icon: <I.trash {...ic} />, nguy: true, onClick: () => setMd({ k: "huy", x: r }), title: "Không đặt nữa, SL đã về không tính — bắt buộc lý do",
            an: !(P.canCancelLine && r.line_status === "ACTIVE" && r.post_issue_status !== "PENDING") },
        ]} />
        {P.canApprovePostIssue && r.post_issue_status === "PENDING" && !ketThuc && <><button className="btn sm primary" onClick={() => duyetDong(r)}>Duyệt</button><button className="btn sm danger" onClick={() => setMd({ k: "tuchoi", x: r })}>Từ chối</button></>}
      </span>); } },
    // v0.144 (chu he thong 2026-11-27): cot = Giai doan · Ma LK + ten · SL vi pham · ve / thieu / dat · ngay tao · ngay NM · ngay DK · ngay hang ve · kho · doi tac · ghi chu;
    // 3 ngay tach 3 cot; dong thap, chu dai "..." (Clip theo maxW); ID case / ID dat hang + loi gi / ai loi xem khi re chuot (title).
    { key: "gd", header: "Giai đoạn", loc: "chon", maxW: 150, gt: ({ g }: any) => (g ? `${g.gd_hien_tai} · ${g.gd_hien_tai_ten}` : ""),
      render: ({ g }: any) => g ? <span title={g.gd_hien_tai_ten} style={{ color: ["XONG"].includes(g.gd_hien_tai) ? "var(--ok-ink)" : g.gd_tre ? "var(--danger-ink)" : "#c26400", fontWeight: 600 }}>
        {g.gd_hien_tai} · {g.gd_hien_tai_ten}{g.gd_tre && !["XONG", "HUY"].includes(g.gd_hien_tai) ? " · trễ" : ""}</span> : <span className="muted">—</span> },
    { key: "ma", header: "Mã LK · tên", loc: "chu", maxW: 300, gt: ({ r }: any) => `${r.part_code} ${r.part_name} ${r.part_code_goc ?? ""}`, gtSap: ({ r }: any) => r.part_code,
      render: ({ r }: any) => <span title={`${r.part_code} · ${r.part_name}${r.part_code_goc ? `\nThay từ ${r.part_code_goc}` : ""}\nID case: ${r.crm_id || "—"} · ID đặt hàng: ${r.order_id || "—"}`}
        style={{ opacity: huy(r) ? 0.6 : 1 }}><DongLink id={r.id} ma={r.part_code} /> <span className="muted">{r.part_name}</span>
        {huy(r) && <span className="badge nhap" style={{ fontSize: 10, marginLeft: 4 }}>Hủy</span>}<NhanSauBH r={r} nguoiDuyet={eo.final_approver_email} /></span> },
    { key: "vp", header: "SL vi phạm", align: "right", loc: "so", gt: ({ r }: any) => loiTinhDong(r.id).length,
      render: ({ r }: any) => { const ls = loiTinhDong(r.id); if (!ls.length) return <span className="muted">—</span>;
        const cho = ls.some((l: any) => l.trang_thai === "CHO_GIAI_TRINH");
        return <span title={`${demTxt(ls, (l) => `${String(l.ma_loi).replace("ER.MH-", "")} ${l.ten_ma}`).map(([m, n]) => `${m} ×${n}`).join("\n")}\nAi lỗi: ${demTxt(ls, aiLoi).map(([a, n]) => `${a} ×${n}`).join(", ")}`}
          style={{ fontWeight: 700, borderRadius: 999, padding: "1px 9px", background: cho ? "#ffe7e5" : "#f5f5f7", color: cho ? "#d70015" : "var(--text)" }}>{ls.length}</span>; } },
    { key: "ceo", header: <span title="Dòng cấp CEO (hệ thống tự tính): lùi ngày DK ≥ 3 lần · ngày DK cách ngày đặt ≥ 30 ngày · ≥ 3 lỗi">CEO</span>, loc: "chon", maxW: 220,
      gt: ({ t }: any) => (t?.ceo_ly_do?.length ? "Cấp CEO" : ""),
      render: ({ t }: any) => t?.ceo_ly_do?.length ? <span title={ceoTxt(t.ceo_chi_tiet, t.ceo_ly_do)}>
        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 8px", background: "#ff3b30", color: "#fff", marginRight: 5 }}>CEO</span>
        <span style={{ color: "#d70015", fontSize: 12 }}>{t.ceo_ly_do.join(" · ")}</span></span> : <span className="muted">—</span> },
    { key: "tl", header: <span title="Tỷ lệ hàng về = SL về / SL đặt">Tỷ lệ về</span>, align: "right", loc: "so", gt: ({ r }: any) => (r.current_qty > 0 ? Math.round((Math.min(r.da_dat ?? 0, r.current_qty) / r.current_qty) * 100) : null),
      render: ({ r }: any) => { if (!(r.current_qty > 0)) return <span className="muted">—</span>; const v = Math.round((Math.min(r.da_dat ?? 0, r.current_qty) / r.current_qty) * 100);
        return <b className="mono-num" style={{ color: v >= 100 ? "var(--ok-ink)" : v > 0 ? "#c26400" : "var(--danger-ink)" }}>{v}%</b>; } },
    { key: "sl", header: <span title="Về / thiếu / đặt">Về / thiếu / đặt</span>, align: "right", loc: "so", gt: ({ r }: any) => r.chua_dat,
      render: ({ r }: any) => <span className="mono-num" style={{ whiteSpace: "nowrap" }}><span style={{ color: "var(--ok-ink)" }}>{soLuong(r.da_dat)}</span>
        {" / "}<b style={{ color: r.chua_dat > 0 ? "var(--warn-ink)" : undefined }}>{soLuong(r.chua_dat)}</b>{" / "}{soLuong(r.current_qty)}</span> },
    { key: "tao", header: "Ngày tạo", loc: "ngay", gt: ({ r }: any) => String(r.created_at ?? "").slice(0, 10), render: ({ r }: any) => <span className="mono-num" title={ngay(r.created_at)}>{ngayNgan(r.created_at)}</span> },
    { key: "nm", header: "Ngày NM", loc: "ngay", gt: (x: any) => x.nm ?? "", render: (x: any) => x.nm ? <span className="mono-num" title={ngay(x.nm)}>{ngayNgan(x.nm)}</span> : <span className="muted">—</span> },
    { key: "dk", header: "Ngày DK", loc: "ngay", gt: (x: any) => x.ndk ?? "",
      render: (x: any) => x.ndk ? <span className="mono-num" title={`${ngay(x.ndk)}${x.t?.so_lan_lui ? ` · lùi ngày dự kiến ${x.t.so_lan_lui} lần` : ""}`}>{ngayNgan(x.ndk)}
        {x.t?.so_lan_lui > 0 && <span style={{ color: x.t.so_lan_lui >= 3 ? "var(--danger-ink)" : "var(--warn-ink)", fontSize: 11, marginLeft: 4 }}>lùi {x.t.so_lan_lui}</span>}</span>
        : <span className="muted">—</span> },
    { key: "ve", header: "Hàng về", loc: "ngay", gt: (x: any) => x.ve ?? "",
      render: (x: any) => x.ve ? <span className="mono-num" title={ngay(x.ve)} style={{ color: x.r.da_dat >= x.r.current_qty ? "var(--ok-ink)" : undefined }}>{ngayNgan(x.ve)}</span> : <span className="muted">—</span> },
    { key: "kho", header: "Kho", loc: "chon", maxW: 90, gt: ({ r }: any) => r.warehouse, nhanChon: (v) => (khoGon(v) !== v ? `${khoGon(v)} — ${v}` : v), render: ({ r }: any) => <Kho t={r.warehouse} /> },
    { key: "ncc", header: "Đối tác", loc: "chon", gt: ({ r }: any) => r.supplier ?? "", maxW: 150, render: ({ r }: any) => <span title={r.supplier ?? ""}>{r.supplier || "—"}</span> },
    { key: "gc", header: "Ghi chú", loc: "chu", gt: ({ r }: any) => r.ghi_chu ?? "", maxW: 200, render: ({ r }: any) => <span title={r.ghi_chu ?? ""}>{r.ghi_chu || "—"}</span> },
  ];

  // v0.151 (chu he thong "text qua dai thi hien ... de hien du cot, han che keo trai keo phai"): bang LK co dinh theo % (.qv-gon), cot thao tac theo px
  const coNutDuyet = P.canApprovePostIssue && lkRows.some((x: any) => x.r.post_issue_status === "PENDING" && !dongKetThuc(x.r));
  const W_LK: Record<string, string> = { act: coNutDuyet ? "150px" : coChon ? "62px" : "48px", gd: "11%", ma: "17%", vp: "54px", ceo: "6%", tl: "50px", sl: "86px", tao: "66px", nm: "66px", dk: "78px", ve: "66px", kho: "6%", ncc: "8%", gc: "6%" };
  const lkColsGon = lkCols.map((c) => ({ ...c, width: W_LK[c.key] ?? c.width }));

  const guiBinhLuan = async () => {
    if (!cmt.trim()) return;
    setBusy(true);
    try { await api.post(`/eo/${id}/comments`, { noi_dung: cmt.trim() }); setCmt(""); qc.invalidateQueries({ queryKey: ["eo", String(id)] }); }
    finally { setBusy(false); }
  };

  const tabs: { k: Tab; l: string }[] = [
    { k: "lk", l: `Linh kiện (${d.items.length})` },
    { k: "kh", l: `Kế hoạch & hàng về (${d.plans.length} · ${(b?.phieu_nhap ?? []).length})` },
    { k: "loi", l: `Lỗi & giải trình (${new Set((b?.loi ?? []).map((l: any) => l.vp_khoa ?? l.id)).size})` },
    { k: "file", l: `Tài liệu (${d.files.length})` },
  ];
  // phieu duyet dang cho (lan trinh dang mo) - thay tab "Quy trinh duyet" cu; lich su duyet day du = nhat ky nhom "Duyệt"
  const choDuyet = d.approvals.filter((a: any) => a.status === "PENDING" && d.submissions.find((x: any) => x.id === a.submission_id)?.status === "PENDING");

  return (
    <>
      <div className="qv-head po">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll} actions={<>
          {myApr && actionsFor(myApr.step_type).map((a) => (
            <button key={a.key} className={`btn sm ${a.cls || ""}`} onClick={() => setMd({ k: "duyet", x: { row: { id: myApr.id, eo_code: eo.eo_code }, action: a.key } })}>
              {a.key === "approve" && <I.check width={13} height={13} />} {a.label}
            </button>
          ))}
          {P.canEditDraft && <button className="btn sm" onClick={() => { onCloseAll(); nav(`/eo/${id}/edit`); }}><I.edit width={13} height={13} /> Sửa / gửi trình</button>}
          {P.canRecall && <button className="btn sm" onClick={() => setMd({ k: "recall" })}><I.edit width={13} height={13} /> Rút về &amp; sửa</button>}
          {P.canCancel && <button className="btn sm ghost danger" onClick={() => setMd({ k: "cancel" })}><I.x width={13} height={13} /> Hủy EO</button>}
          {P.canReopen && <button className="btn sm" title="Admin: mở lại EO bị hủy (đã ban hành → Đã ban hành, chưa ban hành → Nháp)" onClick={() => setMd({ k: "reopen" })}><I.check width={13} height={13} /> Mở lại EO</button>}
          {P.canKetThucSomPo && !poDone && <button className="btn sm" title="Mọi dòng đang chờ hàng: SL đặt = SL đã về thực tế (xem trước + cảnh báo)" onClick={() => setMd({ k: "kts-po" })}><I.check width={13} height={13} /> Kết thúc sớm PO</button>}
          {loiCho > 0 && <button className="btn sm" title="1 nội dung giải trình cho mọi linh kiện có lỗi trong PO này" onClick={() => setMd({ k: "gt-po" })}>Giải trình cả PO ({loiCho} vi phạm)</button>}
          {P.canCopy && <button className="btn sm" title="Tạo EO mới với thông tin phiếu giống EO này (không chép danh sách linh kiện)" onClick={() => { onCloseAll(); nav(`/eo/new?copy=${id}`); }}><I.copy width={13} height={13} /> Copy EO</button>}
        </>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--brand-ink)" }}>{eo.eo_code}</span>
            {/* v0.144 (chu he thong "tieu de bo hien thi thanh luong quy trinh"): luong chi con o khu chinh ben duoi */}
            {eo.approval_code ? <span className="badge issued">{eo.approval_code}</span> : <span className="badge nhap">Chưa ban hành</span>}
            {dongCeo.size > 0 && <button type="button" onClick={xemCeo} title="Bấm: lọc các dòng cấp CEO (cột CEO ghi lý do từng dòng)"
              style={{ border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "3px 12px", background: "#ff3b30", color: "#fff", flexShrink: 0 }}>
              🚩 CEO · {dongCeo.size} dòng</button>}
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
            {(b?.canh_bao ?? []).length > 0 && <span role="button" onClick={() => { setAnPhu(false); setXemTq(true); }} title={`${b.canh_bao.map((c: any) => c.text).join("\n")}\n\nBấm: mở tab Tổng quát`}
              style={{ color: "var(--danger-ink)", fontWeight: 700, cursor: "pointer", textDecoration: "underline dotted" }}>⚠ {b.canh_bao.length} cảnh báo</span>}
          </div>
        </QvHeader>
      </div>

      <div className={`qv-body${anPhu ? " an-phu" : ""}`}>
        {/* ------- KHU CHINH (v0.131): luong tien trinh 1 dong + bang linh kien / ke hoach / loi / tai lieu ------- */}
        <div className="qv-col">
          {/* v0.144: bo dong "Theo doi chinh"; bam 1 moc quy trinh -> bang LK loc cac dong DANG DUNG o buoc do (bam lai = bo loc) */}
          {sdh.data && <div className="qv-quytrinh"><QuyTrinh defs={sdh.data.giai_doan} sla={sdh.data.sla} rows={sdh.data.rows} loi={loiTinh}
            chon={locGd?.k} onChonNut={(k, ids, kieu) => { setTab("lk"); setLocGd(locGd?.k === k ? null : { k, ids: new Set(ids), kieu }); }}
            phieuNhap={bs.data ? b?.phieu_nhap ?? [] : undefined} slDat={d.tong.tong_sl_dat} phuTrach={phuTrach} /></div>}
          <div className="qv-tabs">{tabs.map((t) => <button key={t.k} className={`qv-tab ${tab === t.k ? "on" : ""}`} onClick={() => setTab(t.k)}>{t.l}</button>)}
            {/* 2026-11-23: 1 o tim CHUNG cho moi tab (giu chu khi doi tab) */}
            <O_TIM tim={tim} setTim={setTim} /></div>
          <div className={`qv-scroll${tab === "lk" || tab === "kh" || tab === "loi" ? " lk-mode" : ""}`}>
            {tab === "lk" && (
              <div className="qv-toolbar">
                <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}><b style={{ color: "var(--text)" }}>{lkRows.length}</b>/{d.items.length} LK · còn tồn xếp trước (tồn lâu, rồi thiếu nhiều)</span>
                <span className="sp" />
                <button className="btn sm" title="Tải Excel mọi dòng linh kiện của EO (kèm kế hoạch, hàng về, theo dõi)" onClick={() => xuatDongEo(eo, d.items, d.plans, b)}><I.download width={13} height={13} /> Tải Excel</button>
                {P.issued && coChon && <>
                  {BAT_TAO_MAIL_NHAC && <button className="btn sm primary" disabled={!chon.size || busy} onClick={push}><I.send width={13} height={13} /> Tạo mail nhắc ({chon.size})</button>}
                  <button className="btn sm" disabled={!chon.size} onClick={() => setLh([...chon])} title="Đã nhắc đối tác bằng gọi điện / Zalo / tin nhắn — tính như đã push (R3)">📞 Đã nhắc đối tác</button>
                  <button className="btn sm" onClick={() => setMd({ k: "bulk" })}><I.calendar width={13} height={13} /> Lập kế hoạch hàng loạt</button>
                </>}
                {P.issued && P.canManage && <button className="btn sm" onClick={() => setMd({ k: "add" })}><I.plus width={13} height={13} /> Thêm dòng (duyệt sau BH)</button>}
                <span className="muted" style={{ cursor: "help", fontSize: 13 }} title="Bấm mốc quy trình: lọc LK đang dừng / có lỗi / đã qua bước đó · bấm dòng: chi tiết đơn đặt · nút ⋯: ngày DK, giải trình, lịch sử, sửa, thay mã, kết thúc / hủy · rê chuột Mã LK: ID case / ID đặt hàng · rê SL vi phạm: lỗi gì / ai lỗi">ⓘ</span>
              </div>
            )}
            {err && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "6px 12px" }}>{err}</div>}
            {tab === "lk" && (
              // #29 (2026-11-08): bang dung chung DataTable - loc / sap xep kieu Excel tren tieu de; mac dinh AN don huy / tu choi
              // (tick "Xem cả đơn hủy"); thu tu mac dinh: dong con thieu len dau, thieu nhieu xep truoc. Loc tren may nguoi dung.
              <>
                <div className="qv-lk-than">
                  {/* v0.145 (chu he thong "chuyen cac filter sang goc trai"): BO LOC = cot doc ben trai bang, bam la bang loc ngay */}
                  <aside className="qv-loc">
                    <div className="qv-loc-tieu">Lọc</div>
                    {locGd && <button className="btn sm" onClick={() => setLocGd(null)} title="Bấm để bỏ lọc bước" style={{ background: "#fff", boxShadow: "0 0 0 2px var(--brand-yellow-btn)", fontWeight: 600 }}>
                      <span className="qv-loc-t">Bước {locGd.k} · {(sdh.data?.giai_doan ?? []).find((g: any) => g.k === locGd.k)?.l ?? ""} — {KIEU_TXT[locGd.kieu]} ({locGd.ids.size})</span><span className="qv-loc-x">×</span></button>}
                    {dongCoLoi.size > 0 && <button className="btn sm" onClick={() => setChiLoi(!chiLoi)} title="Chỉ hiện các dòng linh kiện có lỗi (tính từ 20/11/2026)" style={chiLoi ? { background: "#fff", boxShadow: "0 0 0 2px var(--brand-yellow-btn)", fontWeight: 600 } : undefined}>
                      <span className="qv-loc-t">⚠ {dsLocVao ? `LK dính lỗi đang xem (${dsLocVao.size})` : `Chỉ LK có lỗi (${dongCoLoi.size})`}</span>{chiLoi && <span className="qv-loc-x">×</span>}</button>}
                    <button className="btn sm" onClick={() => setXemHuy(!xemHuy)} title="Hiện cả dòng đã hủy / bị từ chối" style={xemHuy ? { background: "#fff", boxShadow: "0 0 0 2px var(--brand-yellow-btn)", fontWeight: 600 } : undefined}>
                      <span className="qv-loc-t">Cả đơn hủy / từ chối{soHuy ? ` (${soHuy})` : ""}</span>{xemHuy && <span className="qv-loc-x">×</span>}</button>
                    {dongCeo.size > 0 && <button className="btn sm" onClick={() => setChiCeo(!chiCeo)} title="Chỉ hiện các dòng cấp CEO"
                      style={chiCeo ? { background: "#fff", boxShadow: "0 0 0 2px #ff3b30", fontWeight: 600, color: "#d70015" } : { color: "#d70015" }}>
                      <span className="qv-loc-t">🚩 Cấp CEO ({dongCeo.size})</span>{chiCeo && <span className="qv-loc-x" style={{ background: "#ff3b30" }}>×</span>}</button>}
                    {(locGd || chiLoi || xemHuy || chiCeo) && <button className="btn ghost sm" onClick={() => { setLocGd(null); setChiLoi(false); setXemHuy(false); setChiCeo(false); }}>Xoá lọc</button>}
                    <div className="qv-loc-goi">Bấm mốc trên luồng quy trình để lọc LK theo bước.</div>
                  </aside>
                  <div className="qv-lk qv-gon"><DataTable timKiem={false} minWidth={860} cols={lkColsGon} rows={lkRows} keyOf={(x: any) => x.r.id} onRowClick={(x: any) => qv.openDong(x.r.id)} empty="Không có dòng linh kiện khớp bộ lọc" pageSize={10} /></div>
                </div>
              </>
            )}
            {tab === "kh" && (
              <>
                <div className="qv-bang qv-gon">
                  <TabKeHoach eo={eo} items={d.items} plans={d.plans} issued={P.issued} canEdit={P.canEditPlan} onChanged={() => qc.invalidateQueries()} tim={tim} gon />
                {(b?.phieu_khong_khop ?? []).length > 0 && (
                  <>
                    <div className="qv-sec" style={{ color: "var(--warn-ink)" }}>Phiếu AMIS có mã {eo.approval_code} nhưng KHÔNG khớp dòng</div>
                    <table className="tbl tbl-dense">
                      <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th>Mã hàng</th><th>Tên hàng</th><th style={{ textAlign: "right" }}>SL</th></tr></thead>
                      <tbody>{b.phieu_khong_khop.filter(k).map((r: any) => <tr key={r.id}><td>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td><Clip w={180}>{r.warehouse_name}</Clip></td><td><PartLink ma={r.part_code} /></td><td><Clip w={190}>{r.part_name}</Clip></td><td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td></tr>)}</tbody>
                    </table>
                  </>
                )}
                </div>
              </>
            )}
            {tab === "file" && (
              <div className="qv-pad">
                <TabTaiLieu eoId={String(id)} files={d.files} onUploaded={() => qc.invalidateQueries()} canDelete={P.canDeleteFile}
                  myEmail={me.data?.email} preIssue={!["ISSUED", "CANCELLED"].includes(eo.trang_thai)} tim={tim} />
              </div>
            )}
            {tab === "loi" && <div className="qv-bang qv-gon">
            {dongCoLoi.size > 0 && <div className="qv-toolbar" style={{ padding: "0 0 8px" }}><button className="btn sm primary" onClick={xemLkLoi}>⚠ Xem các LK có lỗi ({dongCoLoi.size})</button>
              <span className="muted" style={{ fontSize: 12 }}>mở tab Linh kiện, lọc sẵn các dòng có lỗi</span></div>}
            <BangLoiTheoBuoc gon loi={b?.loi ?? []} giaiTrinh={b?.giai_trinh ?? []} rows={sdh.data?.rows ?? []} nhieuDong onGiaiTrinh={(itemId, soDong) => (soDong > 1 ? setMd({ k: "gt-po" }) : qv.openDong(itemId))} tim={tim} />
            </div>}
          </div>
        </div>

        {/* ------- KHU PHU (v0.131): so lieu, canh bao, cho duyet, nhat ky hop nhat (duyet, ke hoach, loi, mail, push, binh luan) ------- */}
        <CotPhu an={anPhu} setAn={setAnPhu} tieuDe={`Nhật ký xử lý (${tlLoc.length}${tlGop.length < tlLoc.length ? ` — gọn ${tlGop.length} mục` : ""})`}>
          {/* v0.145 (chu he thong "gom tat ca cac van de dang hien ben tren vao 1 tab Tong quat + bo tieu de Tien do lich su => day Nhat ky xu ly len lam tieu de") */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button className={`qv-chip ${xemTq ? "on" : ""}`} onClick={() => setXemTq(true)} title="Ô số, cảnh báo, phiếu đang chờ duyệt">
                Tổng quát{(b?.canh_bao ?? []).length ? <span style={{ marginLeft: 5, background: "#ff3b30", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10.5 }}>{b.canh_bao.length}</span> : null}</button>
              {NHOM_TL.map((n) => <button key={n.k} className={`qv-chip ${!xemTq && nhom === n.k ? "on" : ""}`} onClick={() => { setXemTq(false); setNhom(n.k); }}>{n.l}</button>)}
              {!xemTq && <input className="input" style={{ height: 28, fontSize: 12, marginTop: 6, width: "100%" }} placeholder="🔍 Tìm trong nhật ký (người, mã LK, nội dung…)" value={timTl} onChange={(e) => setTimTl(e.target.value)} />}
            </div>
          </div>
          {xemTq && <div className="qv-scroll"><div className="qv-phu-sec" style={{ borderBottom: 0 }}>
            <div className="qv-kpis" style={{ marginTop: 0 }}>
              <Kpi l="Dòng" v={soLuong(d.tong.so_dong)} />
              <Kpi l="Đặt" v={soLuong(d.tong.tong_sl_dat)} />
              <Kpi l="Về" v={soLuong(d.tong.sl_da_dat)} tone="ok" />
              <Kpi l="Thiếu" v={soLuong(d.tong.sl_chua_dat)} tone={d.tong.sl_chua_dat > 0 ? "warn" : undefined} />
              <Kpi l="Tiền DK" v={tien(d.tong.tong_tien_du_kien)} />
              <span role="button" onClick={dongCoLoi.size ? xemLkLoi : undefined} title={dongCoLoi.size ? "Bấm: xem các LK có lỗi" : undefined} style={{ cursor: dongCoLoi.size ? "pointer" : undefined, display: "inline-flex" }}>
                <Kpi l="Lỗi chờ GT" v={soLuong(loiCho)} tone={loiCho ? "danger" : undefined} /></span>
              {/* v0.143: thong tin bo sung tu popup man Loi theo PO (da gop) */}
              <Kpi l="Đáp ứng" v={d.tong.tong_sl_dat > 0 ? `${Math.round((Math.min(d.tong.sl_da_dat, d.tong.tong_sl_dat) / d.tong.tong_sl_dat) * 100)}%` : "—"} />
              <span role="button" onClick={dongCoLoi.size ? xemLkLoi : undefined} style={{ cursor: dongCoLoi.size ? "pointer" : undefined, display: "inline-flex" }} title="Số lần lỗi bên đối tác (NCC), tính từ 20/11/2026">
                <Kpi l="Lỗi đối tác" v={soLuong(loiTinh.filter((l: any) => l.ben === "NCC").length)} /></span>
              <span role="button" onClick={dongCoLoi.size ? xemLkLoi : undefined} style={{ cursor: dongCoLoi.size ? "pointer" : undefined, display: "inline-flex" }} title="Số lần lỗi nội bộ, tính từ 20/11/2026">
                <Kpi l="Lỗi nội bộ" v={soLuong(loiTinh.filter((l: any) => l.ben === "NOI_BO").length)} /></span>
            </div>
            <div className="qv-alerts">
              {bs.isLoading ? <span className="muted" style={{ fontSize: 12 }}>Đang kiểm tra cảnh báo…</span>
                : (b?.canh_bao ?? []).length === 0 ? <span className="qv-alert ok">✓ Không có cảnh báo</span>
                : b.canh_bao.map((c: any, i: number) => { const veCeo = (c.loai === "CEO" || /cấp CEO/.test(c.text)) && dongCeo.size > 0;
                  const veLoi = veCeo || (/lỗi|giải trình|vi phạm/i.test(c.text) && dongCoLoi.size > 0); return (
                  <span key={i} className={`qv-alert ${c.muc}`} role={veLoi ? "button" : undefined} onClick={veCeo ? xemCeo : veLoi ? xemLkLoi : undefined}
                    title={veLoi ? "Bấm: xem các LK có lỗi" : undefined} style={veLoi ? { cursor: "pointer" } : undefined}>{c.muc === "danger" ? "⚠ " : c.muc === "warn" ? "! " : "i "}{c.text}{veLoi ? " ›" : ""}</span>); })}
            </div>
            {choDuyet.length > 0 && <div style={{ marginTop: 8, fontSize: 12.5 }}>
              <b>Đang chờ duyệt</b>
              {choDuyet.map((a: any) => <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                <span className="badge final">{a.step_type === "FINAL" ? "Duyệt mua" : "Thẩm định"}</span><b>{ten(a.approver_email)}</b>
                <span className="muted">giao {ngayGio(a.assigned_at)}</span></div>)}
            </div>}
          </div>
          </div>}
          {!xemTq && <div className="qv-scroll">
            <NhatKyGop nhom={tlGop} khoa={(x, i) => `${i}|${x.at}|${x.h}`} dot={(x) => MAU[x.nhom]} luc={(x) => x.at} ai={(x) => (x.ai ? ten(x.ai) : null)}
              tieu={(x) => x.h} tieuNhom={(x) => x.loai ?? x.h} moTa={(x) => x.text ?? null}
              tomTat={(ds) => { const ma = lietKe(ds.map((y) => y.ma), 6); return ma ? `Mã LK: ${ma}` : ds[0].text ?? null; }} />
          </div>}
          <div style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 6 }}>
            <input className="input" placeholder="Viết bình luận / trao đổi…" value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guiBinhLuan()} />
            <button className="btn primary" disabled={busy || !cmt.trim()} onClick={guiBinhLuan}>Gửi</button>
          </div>
        </CotPhu>
      </div>

      {md?.k === "duyet" && <ApprovalActionModal act={md.x} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "recall" && <RecallModal eo={eo} onClose={() => setMd(null)} onDone={() => { xong(); onCloseAll(); nav(`/eo/${id}/edit`); }} />}
      {md?.k === "cancel" && <CancelModal eo={eo} onClose={() => setMd(null)} onDone={xong} />}
      {md?.k === "reopen" && <ReopenModal eo={eo} onClose={() => setMd(null)} onDone={xong} />}
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
      {lh && <LienHeDoiTacModal ids={lh} nhan={`${eo.approval_code || eo.eo_code} · ${lh.length} dòng`} onClose={() => setLh(null)} onSaved={(kq) => { setLh(null); setChon(new Set()); qc.invalidateQueries(); alert(`Đã ghi nhận nhắc đối tác cho ${kq.so_dong} dòng${kq.bo_loi_r3 ? ` — bỏ ${kq.bo_loi_r3} lỗi R3 (không push) của kỳ đó` : ""}.`); }} />}
    </>
  );
}

/** So dong dang o tung giai doan cua PO (tu /so-don-hang?eo_id) - dau vao TienTrinhPo. */
function gdPo(rows: any[]) {
  const dem: Record<string, number> = {}, tre: Record<string, number> = {};
  for (const r of rows) {
    if (!r.gd_hien_tai) continue;
    dem[r.gd_hien_tai] = (dem[r.gd_hien_tai] ?? 0) + 1;
    if (r.gd_tre && !["XONG", "HUY"].includes(r.gd_hien_tai)) tre[r.gd_hien_tai] = (tre[r.gd_hien_tai] ?? 0) + 1;
  }
  return { dem, tre };
}
