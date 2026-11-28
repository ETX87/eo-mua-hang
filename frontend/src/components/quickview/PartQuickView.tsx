import { TienTrinhGon } from "../TienTrinh";
import { gopTrung, gopLienTiep } from "../../lib/gopTrung";
import { NhatKyGop } from "../NhatKyGop";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, ngay, ngayGio, ngayNgan, ten } from "../../lib/format";
import { DataTable, type Col } from "../DataTable";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { I } from "../../lib/icons";
import { BaNgay, NhanNgay } from "../../lib/ngay";
import { khopTim } from "../../lib/tonDong";
import { QvHeader, Kpi, EoLink, DongLink, useQuickView, useAnPhu, KhuTieuDe, CotPhu } from "./QuickView";
import { quyenEo, QtyModal, KetThucSomMaModal } from "../../pages/eo/eoActions";
import { type Dong, NgayHangVeModal, GiaiTrinhModal, LichSuModal, taoPushDoiTac, PushKetQua, BAT_TAO_MAIL_NHAC, type MailNhac, LienHeDoiTacModal } from "../../pages/theodoi/shared";
import { Kho } from "../../lib/kho";

/**
 * Popup xem nhanh theo MA LINH KIEN (95% man hinh): moi dong EO dat ma nay (ke ca ma goc truoc khi thay ma), phieu nhap
 * AMIS, nhat ky sua / ke hoach / thay ma / giai trinh, loi theo doi. Du lieu: GET /api/xem/linh-kien?ma=.
 */
const TRANG_THAI_MAU: Record<string, string> = {
  "Kết thúc": "issued", "Kết thúc sớm": "issued", "Đơn trên EO bị hủy": "nhap", "Chưa đủ hàng": "final", "Hàng chưa về": "reject", "Chưa ban hành": "nhap",
};
type Tab = "kho" | "eo" | "amis" | "loi";

export default function PartQuickView({ ma, po, onClose, onCloseAll, coTruoc }: { ma: string; po?: string; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const qv = useQuickView();
  const q = useQuery({ queryKey: ["xem-lk", ma], queryFn: () => api.get<any>(`/xem/linh-kien?ma=${encodeURIComponent(ma)}`) });
  // po (ma phe duyet): UI ma LK TRONG 1 PO (khi khong co dong dat de mo popup don hang) - loc dong / phieu AMIS / loi / log theo PO; bo loc = UI chung
  const [locPo, setLocPo] = useState(!!po);
  const [tab, setTab] = useState<Tab>(po ? "amis" : "kho");
  const [anPhu, setAnPhu] = useAnPhu(); // v0.131: thu gon khu phu
  const [chiMo, setChiMo] = useState(false);
  const [loaiLog, setLoaiLog] = useState<"all" | "sl" | "kh" | "khac">("all");
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const [md, setMd] = useState<{ k: string; x?: any } | null>(null);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [pushKq, setPushKq] = useState<MailNhac | null>(null);
  const [lh, setLh] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tim, setTim] = useState("");
  const [timLog, setTimLog] = useState("");
  const d = useMemo(() => {
    const g = q.data;
    if (!g || !po || !locPo) return g;
    const dong = g.dong.filter((r: any) => r.ma_phe_duyet === po);
    const ids = new Set(dong.map((r: any) => r.item_id));
    const eoIds = new Set(dong.map((r: any) => r.eo_id));
    const phieu = g.phieu_nhap.filter((r: any) => r.approval_code_raw === po);
    const mo = dong.filter((r: any) => ["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang));
    return {
      ...g, dong, phieu_nhap: phieu, theo_doi: (g.theo_doi ?? []).filter((r: any) => ids.has(r.item_id)),
      loi: (g.loi ?? []).filter((l: any) => ids.has(l.eo_item_id)), log: (g.log ?? []).filter((e: any) => eoIds.has(e.eo_id)),
      tong: { ...g.tong, so_eo: eoIds.size, so_dong: dong.length, sl_dat: dong.reduce((s: number, r: any) => s + (r.so_luong_dat || 0), 0),
        sl_ve: dong.reduce((s: number, r: any) => s + (r.sl_nhap_amis_dung_eo || 0), 0), sl_thieu: mo.reduce((s: number, r: any) => s + (r.so_luong_con_thieu || 0), 0),
        dong_mo: mo.length, ve_gan_nhat: phieu.find((r: any) => !r.voided_at)?.doc_date ?? null },
    };
  }, [q.data, po, locPo]);

  // ---- chi so cho quan ly: ty le dap ung, du kien ve tiep, theo tung kho
  const tk = useMemo(() => {
    if (!d) return null;
    const MO = ["Hàng chưa về", "Chưa đủ hàng"];
    const daBh = d.dong.filter((r: any) => r.trang_thai_eo === "ISSUED" && r.trang_thai_don_hang !== "Đơn trên EO bị hủy");
    const sum = (a: any[], f: (r: any) => number) => a.reduce((s, r) => s + (f(r) || 0), 0);
    const tyLe = (a: any[]) => { const dat = sum(a, (r) => r.so_luong_dat); return dat ? Math.round((sum(a, (r) => Math.min(r.sl_nhap_amis_dung_eo || 0, r.so_luong_dat || 0)) / dat) * 1000) / 10 : null; };
    const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const dkTiep = (a: any[]) => a.filter((r) => MO.includes(r.trang_thai_don_hang) && r.ngay_du_kien_gan_nhat).map((r) => r.ngay_du_kien_gan_nhat as string).sort()
      .find((x) => x >= homNay) ?? null;
    const tocDo = (a: any[]) => { const x = a.filter((r) => ["Kết thúc", "Kết thúc sớm"].includes(r.trang_thai_don_hang) && r.thoi_gian_xu_ly_ngay != null); return x.length ? Math.round((sum(x, (r) => r.thoi_gian_xu_ly_ngay) / x.length) * 10) / 10 : null; };
    const nhap = d.phieu_nhap.filter((r: any) => !r.voided_at);
    const khos = [...new Set([...daBh.map((r: any) => r.kho), ...nhap.map((r: any) => r.warehouse_name)].filter(Boolean))] as string[];
    const theoKho = khos.map((k) => {
      const a: any[] = daBh.filter((r: any) => r.kho === k);
      const pn = nhap.filter((r: any) => r.warehouse_name === k).sort((x: any, y: any) => String(y.doc_date).localeCompare(String(x.doc_date)));
      return {
        kho: k, so_dong: a.length, sl_dat: sum(a, (r) => r.so_luong_dat), sl_ve: sum(a, (r) => r.sl_nhap_amis_dung_eo), ty_le: tyLe(a),
        thieu: sum(a.filter((r: any) => MO.includes(r.trang_thai_don_hang)), (r) => r.so_luong_con_thieu), dk: dkTiep(a), toc: tocDo(a),
        ve: pn[0] ?? null, tong_nhap_kho: sum(pn, (r) => r.qty_in),
      };
    }).sort((x, y) => y.sl_dat - x.sl_dat);
    const moDong = daBh.filter((r: any) => MO.includes(r.trang_thai_don_hang));
    return { ty_le: tyLe(daBh), dk: dkTiep(daBh), qua: moDong.filter((r: any) => r.canh_bao === "Quá dự kiến").length, theoKho };
  }, [d]);

  // gom ban ghi giong het (du lieu ke hoach chuyen tu Google Sheet cu: nhieu dot tuan cung giay) -> 1 muc "(×n)"
  const log = useMemo(() => gopTrung((d?.log ?? []).filter((e: any) =>
    loaiLog === "all" ? true : loaiLog === "kh" ? /PLAN/.test(e.event_type)
      : loaiLog === "sl" ? /QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type) : !/PLAN|QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type)),
    (e: any) => `${e.event_type}|${e.eo_id}|${e.entity_id}|${e.created_at}|${e.user_email ?? ""}|${moTaSuKien(e) ?? ""}`).map(({ x, ds }) => ({ ...x, so_ban: ds.length })), [d, loaiLog]);

  if (q.isLoading) return <Spinner />;
  if (!d) return <div style={{ padding: 30 }}>Không tải được dữ liệu mã {ma}. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const t = d.tong;
  const tdBy = new Map<number, Dong>((d.theo_doi ?? []).map((x: Dong) => [x.item_id, x]));
  // dong theo doi (lib/theoDoi) neu co, khong thi dung dong bao cao 0.1 (cung ten truong) cho modal ngay DK / giai trinh / lich su
  const asDong = (r: any): Dong => tdBy.get(r.item_id) ?? ({ ...r, sl_nhap_amis: r.sl_nhap_amis_dung_eo, nguoi_dat: null } as any);
  const moDong = (r: any) => r.trang_thai_eo === "ISSUED" && !["Kết thúc", "Kết thúc sớm", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang);
  // quyen theo tung dong: nguoi dat = nguoi tao EO (lib/theoDoi nguoi_dat)
  const quyen = (r: any) => quyenEo({ created_by: tdBy.get(r.item_id)?.nguoi_dat ?? null, trang_thai: r.trang_thai_eo }, me.data);
  const xong = () => { setMd(null); qc.invalidateQueries(); };
  const push = async () => {
    if (!chon.size || !confirm(`Tạo mail nhắc cho ${chon.size} dòng?`)) return;
    setErr(""); setBusy(true);
    try { setPushKq(await taoPushDoiTac([...chon])); setChon(new Set()); qc.invalidateQueries(); }
    catch (e: any) { setErr(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền push một số dòng đã chọn." : "Lỗi tạo push."); }
    finally { setBusy(false); }
  };
  const chonDuoc = (r: any) => moDong(r) && r.so_luong_con_thieu > 0 && quyen(r).canEditPlan;
  const dong = d.dong.filter((r: any) => !chiMo || (r.trang_thai_eo === "ISSUED" && !["Kết thúc", "Kết thúc sớm", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang)));

  // ---- v0.151: cot 4 bang (DataTable) - width theo % de bang vua khung, chu dai cat "…" (re chuot xem du)
  const colsKho: Col<any>[] = [
    { key: "kho", header: "Kho", width: "17%", loc: "chon", gt: (k) => k.kho, render: (k) => <span title={k.kho}><Kho t={k.kho} /></span> },
    { key: "dong", header: "Dòng", width: "6%", align: "right", loc: "so", gt: (k) => k.so_dong, render: (k) => soLuong(k.so_dong) },
    { key: "dat", header: "SL đặt", width: "8%", align: "right", loc: "so", gt: (k) => k.sl_dat, render: (k) => soLuong(k.sl_dat) },
    { key: "ve", header: "Đã về (đúng EO)", width: "9%", align: "right", loc: "so", gt: (k) => k.sl_ve, render: (k) => <span style={{ color: "var(--ok-ink)" }}>{soLuong(k.sl_ve)}</span> },
    { key: "tl", header: "Tỷ lệ đáp ứng", width: "9%", align: "right", loc: "so", gt: (k) => k.ty_le,
      render: (k) => <b style={{ color: k.ty_le == null ? undefined : k.ty_le >= 90 ? "var(--ok-ink)" : k.ty_le >= 70 ? "var(--warn-ink)" : "var(--danger-ink)" }}>{k.ty_le != null ? `${k.ty_le}%` : "—"}</b> },
    { key: "thieu", header: "Còn thiếu", width: "8%", align: "right", loc: "so", gt: (k) => k.thieu, render: (k) => <span style={{ fontWeight: k.thieu ? 700 : 400 }}>{soLuong(k.thieu)}</span> },
    { key: "dk", header: "Dự kiến về tiếp", width: "12%", loc: "ngay", gt: (k) => k.dk ?? "", render: (k) => (k.dk ? ngay(k.dk) : k.thieu ? <span style={{ color: "var(--danger-ink)" }}>Chưa có ngày</span> : "—") },
    { key: "vgn", header: "Lần về gần nhất (mọi phiếu AMIS)", width: "21%", loc: "ngay", gt: (k) => k.ve?.doc_date ?? "",
      render: (k) => (k.ve ? <span title={`${ngay(k.ve.doc_date)} · ${soLuong(k.ve.qty_in)} · ${k.ve.doc_no}`}>{ngay(k.ve.doc_date)} · <b>{soLuong(k.ve.qty_in)}</b><span className="muted" style={{ fontSize: 11 }}> · {k.ve.doc_no}</span></span> : <span className="muted">Chưa về</span>) },
    { key: "toc", header: "Tốc độ TB", width: "10%", align: "right", loc: "so", gt: (k) => k.toc, render: (k) => (k.toc != null ? `${k.toc} ngày` : "—") },
  ];
  const colsEo: Col<any>[] = [
    { key: "act", header: "Thao tác", width: "150px", render: (r) => { const Q = quyen(r); const mo = moDong(r); const t = tdBy.get(r.item_id); return (
      <span style={{ display: "inline-flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost sm" title="Xem đơn hàng: mã này trong PO này (tiến trình, kế hoạch, lỗi)" onClick={() => qv.openDong(r.item_id)}><I.eye width={14} height={14} /></button>
        {r.trang_thai_eo === "ISSUED" && <button className="btn ghost sm" title="Ngày nhà máy cam kết · dự kiến · hàng về (xem / cập nhật)" onClick={() => setMd({ k: "ndk", x: asDong(r) })}><I.calendar width={14} height={14} /></button>}
        {mo && Q.canManage && <button className="btn ghost sm" title="Sửa số lượng / ghi chú / ID CRM" onClick={() => setMd({ k: "qty", x: { id: r.item_id, part_code: r.part_code, current_qty: r.so_luong_dat, ghi_chu: r.ghi_chu, crm_id: r.id_crm, order_id: r.id_dat_hang } })}><I.edit width={14} height={14} /></button>}
        {r.trang_thai_eo === "ISSUED" && Q.canEditPlan && <button className="btn ghost sm" title="Giải trình lỗi (Ai + Lỗi gì)" style={{ fontWeight: 700, width: 26, color: t?.so_loi_cho_gt ? "var(--danger)" : undefined }} onClick={() => setMd({ k: "gt", x: asDong(r) })}>!</button>}
        {r.trang_thai_eo === "ISSUED" && <button className="btn ghost sm" title="Lịch sử theo dõi (lỗi, giải trình, push, mail)" onClick={() => setMd({ k: "ls", x: asDong(r) })}><I.clock width={14} height={14} /></button>}
      </span>); } },
    { key: "chon", header: "", width: "30px", render: (r) => (chonDuoc(r) ? <input type="checkbox" checked={chon.has(r.item_id)} onClick={(e) => e.stopPropagation()}
      onChange={() => setChon((s) => { const n = new Set(s); if (n.has(r.item_id)) n.delete(r.item_id); else n.add(r.item_id); return n; })} /> : null) },
    { key: "tao", header: "Ngày tạo", width: "70px", loc: "ngay", gt: (r) => String(r.ngay_tao ?? "").slice(0, 10), render: (r) => <span title={ngay(r.ngay_tao)}>{ngayNgan(r.ngay_tao)}</span> },
    { key: "eo", header: "EO · 3TDO", width: "9%", loc: "chu", gt: (r) => `${r.eo_code} ${r.ma_phe_duyet ?? ""}`, gtSap: (r) => r.eo_code,
      render: (r) => <span title={`${r.eo_code} · ${r.ma_phe_duyet || "chưa ban hành"}${r.part_code_goc ? ` · ${r.part_code_goc} → ${r.part_code}` : ""}`}><EoLink id={r.eo_id}>{r.eo_code}</EoLink> <span className="muted" style={{ fontSize: 11 }}>{r.ma_phe_duyet || "chưa BH"}</span></span> },
    { key: "ma", header: "Mã LK trong PO", width: "8%", loc: "chu", gt: (r) => r.part_code, render: (r) => <span title={r.part_code}><DongLink id={r.item_id} ma={r.part_code} /></span> },
    { key: "tteo", header: "Trạng thái EO", width: "104px", loc: "chon", gt: (r) => r.trang_thai_eo ?? "", render: (r) => <StatusBadge status={r.trang_thai_eo} /> },
    { key: "kho", header: "Kho · Đối tác", width: "9%", loc: "chu", gt: (r) => `${r.kho ?? ""} ${r.doi_tac ?? ""}`,
      render: (r) => <span title={`${r.kho ?? ""} · ${r.doi_tac || "—"}`}><Kho t={r.kho} /> <span className="muted" style={{ fontSize: 11 }}>· {r.doi_tac || "—"}</span></span> },
    { key: "dat", header: "Đặt", width: "48px", align: "right", loc: "so", gt: (r) => r.so_luong_dat, render: (r) => soLuong(r.so_luong_dat) },
    { key: "ve", header: "Về", width: "48px", align: "right", loc: "so", gt: (r) => r.sl_nhap_amis_dung_eo, render: (r) => <span style={{ color: "var(--ok-ink)" }}>{soLuong(r.sl_nhap_amis_dung_eo)}</span> },
    { key: "thieu", header: "Thiếu", width: "52px", align: "right", loc: "so", gt: (r) => r.so_luong_con_thieu, render: (r) => <b>{soLuong(r.so_luong_con_thieu)}</b> },
    { key: "ngay", header: <><NhanNgay k="NM" ngan /> · <NhanNgay k="DK" ngan /> · <NhanNgay k="VE" ngan /></>, width: "112px", wrap: true, loc: "ngay", gt: (r) => r.ngay_du_kien_gan_nhat ?? "",
      render: (r) => { const t = tdBy.get(r.item_id); return <><BaNgay nm={t?.ngay_nm_cam_ket} dk={r.ngay_du_kien_gan_nhat} ve={t?.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo} veDu={r.so_luong_con_thieu <= 0 && r.sl_nhap_amis_dung_eo > 0} />
        {(t?.so_lan_lui ?? 0) > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: t!.so_lan_lui >= 3 ? "var(--danger-ink)" : "var(--warn-ink)" }} title="Số lần lùi ngày dự kiến">lùi {t!.so_lan_lui} lần</div>}</>; } },
    { key: "tt", header: "Tình trạng đơn", width: "11%", loc: "chon", gt: (r) => r.trang_thai_don_hang ?? "",
      render: (r) => <span title={[r.trang_thai_don_hang, r.canh_bao, r.toc_do_hang_ve].filter(Boolean).join(" · ")}><span className={`badge ${TRANG_THAI_MAU[r.trang_thai_don_hang] ?? "nhap"}`}>{r.trang_thai_don_hang}</span>
        {r.canh_bao && <span style={{ fontSize: 10.5, color: "var(--danger-ink)", marginLeft: 4 }}>{r.canh_bao}</span>}</span> },
    { key: "tien", header: <span title="8 giai đoạn: bấm để xem chi tiết đơn hàng">Tiến trình</span>, width: "128px", wrap: true,
      render: (r) => { const t = tdBy.get(r.item_id); return <TienTrinhGon r={d.giai_doan?.[r.item_id]} soLoi={t?.so_loi} loiCho={t?.so_loi_cho_gt} onClick={() => qv.openDong(r.item_id)} />; } },
    { key: "id", header: <span title="ID CRM = mã ca · ID đặt hàng bên app linh kiện">ID case · ID đặt hàng</span>, width: "7%", loc: "chu", gt: (r) => `${r.id_crm ?? ""} ${r.id_dat_hang ?? ""}`,
      render: (r) => (r.id_crm || r.id_dat_hang ? <span title={`Case ${r.id_crm || "—"} · ĐH ${r.id_dat_hang || "—"}`} style={{ fontSize: 12 }}>{[r.id_crm, r.id_dat_hang].filter(Boolean).join(" · ")}</span> : <span className="muted">—</span>) },
    { key: "ly", header: "Lý do / ghi chú", width: "6.5%", loc: "chu", gt: (r) => [r.ly_do_ps, r.ghi_chu].filter(Boolean).join(" · "),
      render: (r) => { const v = [r.ly_do_ps, r.ghi_chu].filter(Boolean).join(" · "); return <span title={v || undefined}>{v || "—"}</span>; } },
  ];
  const colsAmis: Col<any>[] = [
    { key: "ngay", header: "Ngày CT", width: "12%", loc: "ngay", gt: (r) => r.doc_date, render: (r) => <span style={{ opacity: r.voided_at ? 0.45 : 1 }}>{ngay(r.doc_date)}</span> },
    { key: "so", header: "Số CT", width: "16%", loc: "chu", gt: (r) => r.doc_no, render: (r) => <span title={r.doc_no} style={{ opacity: r.voided_at ? 0.45 : 1 }}>{r.doc_no}</span> },
    { key: "kho", header: "Kho", width: "22%", loc: "chon", gt: (r) => r.warehouse_name, render: (r) => <span title={r.warehouse_name}><Kho t={r.warehouse_name} /></span> },
    { key: "sl", header: "SL nhập", width: "9%", align: "right", loc: "so", gt: (r) => r.qty_in, render: (r) => soLuong(r.qty_in) },
    { key: "mpd", header: "Mã phê duyệt", width: "16%", loc: "chu", gt: (r) => r.approval_code_raw ?? "", render: (r) => <span title={r.approval_code_raw}>{r.approval_code_raw}</span> },
    { key: "khop", header: "Khớp EO", width: "25%", loc: "chon", gt: (r) => (r.voided_at ? "Đã hủy" : r.eo_id ? "Khớp EO" : r.match_status === "CODE_ONLY_NO_LINE" ? "Có mã, không khớp dòng" : "Không khớp"),
      render: (r) => (r.voided_at ? <span className="badge nhap">Đã hủy</span> : r.eo_id ? <EoLink id={r.eo_id}>{r.eo_code}</EoLink>
        : <span className={`badge ${r.match_status === "CODE_ONLY_NO_LINE" ? "final" : "nhap"}`}>{r.match_status === "CODE_ONLY_NO_LINE" ? "Có mã, không khớp dòng" : "Không khớp"}</span>) },
  ];
  const colsLoi: Col<any>[] = [
    { key: "act", header: "Thao tác", width: "96px", render: ({ x: l }) => { const r = d.dong.find((y: any) => y.item_id === l.eo_item_id);
      return r && quyen(r).canEditPlan && l.trang_thai === "CHO_GIAI_TRINH" ? <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); setMd({ k: "gt", x: asDong(r) }); }}>Giải trình</button> : null; } },
    { key: "han", header: "Hạn", width: "15%", loc: "ngay", gt: ({ x: l }) => l.han,
      render: ({ x: l, ds }) => <span title={ds.length > 1 ? `Các lần: ${ds.map((y: any) => ngayGio(y.han)).join(", ")}` : ngayGio(l.han)}>{ngayGio(l.han)}</span> },
    { key: "eo", header: "EO", width: "14%", loc: "chu", gt: ({ x: l }) => l.eo_code, render: ({ x: l }) => <EoLink id={l.eo_id}>{l.eo_code}</EoLink> },
    { key: "qt", header: "Quy tắc", width: "13%", loc: "chon", gt: ({ x: l }) => l.quy_tac,
      render: ({ x: l, ds }) => <>{l.quy_tac}{ds.length > 1 && <span className="badge final" style={{ marginLeft: 4 }}>× {ds.length} lần</span>}</> },
    { key: "ai", header: "Ai", width: "22%", loc: "chon", gt: ({ x: l }) => `${l.ai_ma ?? ""}${l.ai_email ? ` (${ten(l.ai_email)})` : ""}`,
      render: ({ x: l }) => { const v = `${l.ai_ma ?? ""}${l.ai_email ? ` (${ten(l.ai_email)})` : ""}`; return <span title={v}>{v || "—"}</span>; } },
    { key: "loi", header: "Lỗi", width: "14%", loc: "chon", gt: ({ x: l }) => l.loi_ma ?? "", render: ({ x: l }) => <span title={l.loi_ma}>{l.loi_ma}</span> },
    { key: "tt", header: "Trạng thái", width: "13%", loc: "chon", gt: ({ x: l }) => (l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"),
      render: ({ x: l }) => <span className={`badge ${l.trang_thai === "CHO_GIAI_TRINH" ? "reject" : "nhap"}`}>{l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"}</span> },
  ];

  return (
    <>
      <div className="qv-head lk">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="badge nhap">Mã linh kiện</span>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{d.ma}</span>
            <Clip w="min(55vw, 640px)" style={{ fontSize: 15, fontWeight: 600 }}>{d.ten || "(chưa có tên)"}</Clip>
            {d.thay_ma.map((x: string) => <span key={x} className="badge final" title="Thay mã tương đương">{x}</span>)}
            {/* UI ma LK trong 1 PO (#26) <-> UI chung */}
            {po && (locPo
              ? <><span className="badge issued" title="Đang xem mã này trong PO này (không có dòng đặt khớp để mở đơn hàng)">trong PO {po}</span>
                  <button type="button" className="btn ghost sm" onClick={() => setLocPo(false)}>⇄ Xem tất cả đơn của mã này</button></>
              : <button type="button" className="btn ghost sm" onClick={() => setLocPo(true)}>⇄ Chỉ PO {po}</button>)}
            {/* 2026-11-09: doi tac bao ngung san xuat -> ket thuc som moi dong dang mo cua ma (moi PO) */}
            {q.data?.tong?.dong_mo > 0 && me.data?.vai_tro !== "View" && (
              <button type="button" className="btn sm danger" style={{ marginLeft: "auto" }} title="Đối tác báo ngừng sản xuất: mọi PO đang chờ mã này → SL đặt = SL đã về (xem trước, chọn dòng)"
                onClick={() => setMd({ k: "kts-ma" })}><I.check width={13} height={13} /> Kết thúc sớm mã này ({q.data.tong.dong_mo} dòng mở)</button>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Đối tác: <b>{t.doi_tac.length ? t.doi_tac.join(", ") : "—"}</b>
            {t.don_gia_gan_nhat != null && <> · Đơn giá dự kiến gần nhất <b>{soLuong(t.don_gia_gan_nhat)}</b></>}
          </div>
        </QvHeader>
      </div>

      <div className={`qv-body${anPhu ? " an-phu" : ""}`}>
        {/* KHU CHINH (v0.131): theo kho / don dat / phieu nhap / loi cua ma */}
        <div className="qv-col">
          <div className="qv-tabs">
            {([["kho", `Theo kho (${tk?.theoKho.length ?? 0})`], ["eo", `Lịch sử EO / đặt hàng (${d.dong.length})`], ["amis", `Phiếu nhập AMIS (${d.phieu_nhap.length})`], ["loi", `Lỗi theo dõi (${d.loi.length})`]] as [Tab, string][])
              .map(([k, l]) => <button key={k} className={`qv-tab ${tab === k ? "on" : ""}`} onClick={() => { setTab(k); setTim(""); }}>{l}</button>)}
            <input className="input qv-tim" style={{ marginLeft: tab === "eo" ? 8 : "auto" }} placeholder="🔍 Tìm nhanh trong tab (không dấu)…" value={tim} onChange={(e) => setTim(e.target.value)} />
            {tab === "eo" && <label style={{ marginLeft: "auto", fontSize: 12, display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={chiMo} onChange={(e) => setChiMo(e.target.checked)} /> Chỉ đơn đang mở</label>}
          </div>
          {tab === "eo" && d.dong.some(chonDuoc) && (
            <div className="qv-toolbar">
              {BAT_TAO_MAIL_NHAC && <button className="btn sm primary" disabled={!chon.size || busy} onClick={push}><I.send width={13} height={13} /> Tạo mail nhắc ({chon.size})</button>}
              <button className="btn sm" disabled={!chon.size} onClick={() => setLh([...chon])} title="Đã nhắc đối tác bằng gọi điện / Zalo / tin nhắn — tính như đã push (R3)">📞 Đã nhắc đối tác</button>
              <button className="btn sm" onClick={() => setChon(new Set(dong.filter(chonDuoc).map((r: any) => r.item_id)))}>Chọn mọi dòng còn thiếu</button>
              {chon.size > 0 && <button className="btn sm ghost" onClick={() => setChon(new Set())}>Bỏ chọn</button>}
              <span className="sp muted" style={{ fontSize: 11.5 }}>Cột Thao tác: 3 loại ngày · sửa dòng · ! giải trình · lịch sử</span>
            </div>
          )}
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "6px 12px" }}>{err}</div>}
          {/* v0.151 (chu he thong "text qua dai thi hien ...; han che keo trai keo phai; trang chia toi da 10 dong; thanh duoi co dinh"):
              4 bang chuyen sang DataTable dung chung (loc + sap xep kieu Excel), cot theo % (.qv-gon cat "…"), 10 dong / trang, phan trang ghim day (.qv-bang) */}
          <div className="qv-scroll lk-mode">
            <div className="qv-bang qv-gon">
            {tab === "kho" && tk && <DataTable timKiem={false} pageSize={10} rows={tk.theoKho.filter(khopTim(tim))} keyOf={(k: any) => k.kho} empty="Chưa có đơn đặt / phiếu nhập cho mã này." cols={colsKho} />}
            {tab === "eo" && <DataTable timKiem={false} pageSize={10} minWidth={1000} rows={dong.filter(khopTim(tim))} keyOf={(r: any) => r.item_id} cols={colsEo}
              empty={po && locPo ? `PO ${po} không có dòng đặt mang mã này (xem phiếu AMIS / bấm Xem tất cả đơn).` : "Không có dòng."} />}
            {tab === "amis" && <DataTable timKiem={false} pageSize={10} rows={d.phieu_nhap.filter(khopTim(tim))} keyOf={(r: any) => r.id} cols={colsAmis} empty="Chưa có phiếu nhập AMIS cho mã này." />}
            {tab === "loi" && <DataTable timKiem={false} pageSize={10} rows={gopTrung(d.loi.filter(khopTim(tim)) as any[], (l) => `${l.eo_item_id}|${l.quy_tac}|${l.trang_thai}`)}
              keyOf={(x: any) => x.x.id} cols={colsLoi} empty="Không có lỗi theo dõi." />}
            </div>
          </div>
        </div>

        {/* KHU PHU (v0.131): so lieu tong cua ma + nhat ky chinh sua / cap nhat */}
        <CotPhu an={anPhu} setAn={setAnPhu} tieuDe="Tiến độ · lịch sử">
          <div className="qv-phu-sec">
        <div className="qv-kpis" style={{ marginTop: 0 }}>
          <Kpi l="SL đặt từ trước đến nay" v={<span title={`${soLuong(t.so_dong)} dòng trên ${soLuong(t.so_eo)} EO`}>{soLuong(t.sl_dat)}</span>} />
          <Kpi l="Đã về (AMIS)" v={soLuong(t.sl_ve)} tone="ok" />
          <Kpi l="Tỷ lệ đáp ứng (về / đặt)" v={tk?.ty_le != null ? `${tk.ty_le}%` : "—"} tone={tk?.ty_le == null ? undefined : tk.ty_le >= 90 ? "ok" : tk.ty_le >= 70 ? "warn" : "danger"} />
          <Kpi l="Còn thiếu (đơn mở)" v={<span title={`${soLuong(t.dong_mo)} dòng đang mở${tk?.qua ? ` · ${tk.qua} dòng quá ngày dự kiến` : ""}`}>{soLuong(t.sl_thieu)}</span>} tone={t.sl_thieu > 0 ? "warn" : undefined} />
          <Kpi l="Dự kiến về tiếp" v={tk?.dk ? ngay(tk.dk) : t.dong_mo ? "Chưa có ngày" : "—"} tone={t.dong_mo && !tk?.dk ? "danger" : undefined} />
          <Kpi l="Tốc độ về TB (đặt → về đủ)" v={t.lead_time_tb != null ? `${t.lead_time_tb} ngày` : "—"} />
          <Kpi l="Lần về gần nhất" v={t.ve_gan_nhat ? ngay(t.ve_gan_nhat) : "—"} />
          <Kpi l="Số EO đã đặt" v={soLuong(t.so_eo)} />
        </div>
          </div>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Nhật ký chỉnh sửa / cập nhật ({log.length})</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {([["all", "Tất cả"], ["sl", "Số lượng / mã"], ["kh", "Kế hoạch"], ["khac", "Khác"]] as const).map(([k, l]) =>
                <button key={k} className={`qv-chip ${loaiLog === k ? "on" : ""}`} onClick={() => setLoaiLog(k)}>{l}</button>)}
              <input className="input" style={{ height: 28, fontSize: 12, marginTop: 6, width: "100%" }} placeholder="🔍 Tìm trong nhật ký (người, EO, nội dung…)" value={timLog} onChange={(e) => setTimLog(e.target.value)} />
            </div>
          </div>
          <div className="qv-scroll">
            {/* #30: muc lien tiep cung loai + cung nguoi + cung PO, cach nhau <= 2 gio -> 1 dong (×n) */}
            <NhatKyGop nhom={gopLienTiep(log.filter(khopTim(timLog)), (e: any) => `${e.event_type}|${e.user_email ?? ""}|${e.eo_id ?? ""}`, (e: any) => e.created_at)}
              khoa={(e: any) => String(e.id)} luc={(e: any) => e.created_at}
              dot={(e: any) => (/PLAN/.test(e.event_type) ? "#10B981" : /QUANTITY|REPLACE|CANCEL/.test(e.event_type) ? "#ff9500" : "#0a84ff")}
              ai={(e: any) => <>{e.user_email ? ten(e.user_email) : "Hệ thống"}{e.eo_id ? <> · <EoLink id={e.eo_id}>{e.eo_code}</EoLink></> : null}</>}
              tieu={(e: any) => <>{EVENT_LABEL[e.event_type] ?? e.event_type}{e.so_ban > 1 && <span className="muted" style={{ fontWeight: 400 }} title="Bản ghi giống hệt nhau (dữ liệu chuyển từ Google Sheet cũ)"> (×{e.so_ban})</span>}</>}
              moTa={(e: any) => moTaSuKien(e) || null} />
          </div>
        </CotPhu>
      </div>

      {md?.k === "ndk" && <NgayHangVeModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "gt" && <GiaiTrinhModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "ls" && <LichSuModal dong={md.x} onClose={() => setMd(null)} />}
      {md?.k === "qty" && <QtyModal item={md.x} issued onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "kts-ma" && <KetThucSomMaModal ma={d.ma} onClose={() => setMd(null)}
        onDone={(kq) => { xong(); alert(`Đã kết thúc sớm ${kq.so_dong} dòng trên ${kq.so_po} PO của mã ${d.ma}.`); }} />}
      {pushKq && <PushKetQua dot={pushKq} onClose={() => setPushKq(null)} />}
      {lh && <LienHeDoiTacModal ids={lh} nhan={`mã ${d.ma} · ${lh.length} dòng`} onClose={() => setLh(null)} onSaved={(kq) => { setLh(null); setChon(new Set()); qc.invalidateQueries(); alert(`Đã ghi nhận nhắc đối tác cho ${kq.so_dong} dòng${kq.bo_loi_r3 ? ` — bỏ ${kq.bo_loi_r3} lỗi R3 (không push) của kỳ đó` : ""}.`); }} />}
    </>
  );
}
