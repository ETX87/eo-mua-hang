import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { I } from "../../lib/icons";
import { BaNgay, NhanNgay } from "../../lib/ngay";
import { QvHeader, Kpi, EoLink } from "./QuickView";
import { quyenEo, QtyModal } from "../../pages/eo/eoActions";
import { type Dong, NgayHangVeModal, GiaiTrinhModal, LichSuModal, taoPushDoiTac, PushKetQua } from "../../pages/theodoi/shared";

/**
 * Popup xem nhanh theo MA LINH KIEN (95% man hinh): moi dong EO dat ma nay (ke ca ma goc truoc khi thay ma), phieu nhap
 * AMIS, nhat ky sua / ke hoach / thay ma / giai trinh, loi theo doi. Du lieu: GET /api/xem/linh-kien?ma=.
 */
const TRANG_THAI_MAU: Record<string, string> = {
  "Kết thúc": "issued", "Đơn trên EO bị hủy": "nhap", "Chưa đủ hàng": "final", "Hàng chưa về": "reject", "Chưa ban hành": "nhap",
};
type Tab = "kho" | "eo" | "amis" | "loi";

export default function PartQuickView({ ma, onClose, onCloseAll, coTruoc }: { ma: string; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const q = useQuery({ queryKey: ["xem-lk", ma], queryFn: () => api.get<any>(`/xem/linh-kien?ma=${encodeURIComponent(ma)}`) });
  const [tab, setTab] = useState<Tab>("kho");
  const [chiMo, setChiMo] = useState(false);
  const [loaiLog, setLoaiLog] = useState<"all" | "sl" | "kh" | "khac">("all");
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const [md, setMd] = useState<{ k: string; x?: any } | null>(null);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [pushKq, setPushKq] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const d = q.data;

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
    const tocDo = (a: any[]) => { const x = a.filter((r) => r.trang_thai_don_hang === "Kết thúc" && r.thoi_gian_xu_ly_ngay != null); return x.length ? Math.round((sum(x, (r) => r.thoi_gian_xu_ly_ngay) / x.length) * 10) / 10 : null; };
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

  const log = useMemo(() => (d?.log ?? []).filter((e: any) =>
    loaiLog === "all" ? true : loaiLog === "kh" ? /PLAN/.test(e.event_type)
      : loaiLog === "sl" ? /QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type) : !/PLAN|QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type)), [d, loaiLog]);

  if (q.isLoading) return <Spinner />;
  if (!d) return <div style={{ padding: 30 }}>Không tải được dữ liệu mã {ma}. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const t = d.tong;
  const tdBy = new Map<number, Dong>((d.theo_doi ?? []).map((x: Dong) => [x.item_id, x]));
  // dong theo doi (lib/theoDoi) neu co, khong thi dung dong bao cao 0.1 (cung ten truong) cho modal ngay DK / giai trinh / lich su
  const asDong = (r: any): Dong => tdBy.get(r.item_id) ?? ({ ...r, sl_nhap_amis: r.sl_nhap_amis_dung_eo, nguoi_dat: null } as any);
  const moDong = (r: any) => r.trang_thai_eo === "ISSUED" && !["Kết thúc", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang);
  // quyen theo tung dong: nguoi dat = nguoi tao EO (lib/theoDoi nguoi_dat)
  const quyen = (r: any) => quyenEo({ created_by: tdBy.get(r.item_id)?.nguoi_dat ?? null, trang_thai: r.trang_thai_eo }, me.data);
  const xong = () => { setMd(null); qc.invalidateQueries(); };
  const push = async () => {
    if (!chon.size || !confirm(`Tạo file push đối tác cho ${chon.size} dòng? (mỗi đối tác 1 file + tiêu đề mail chuẩn)`)) return;
    setErr(""); setBusy(true);
    try { setPushKq(await taoPushDoiTac([...chon])); setChon(new Set()); qc.invalidateQueries(); }
    catch (e: any) { setErr(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền push một số dòng đã chọn." : "Lỗi tạo push."); }
    finally { setBusy(false); }
  };
  const chonDuoc = (r: any) => moDong(r) && r.so_luong_con_thieu > 0 && quyen(r).canEditPlan;
  const dong = d.dong.filter((r: any) => !chiMo || (r.trang_thai_eo === "ISSUED" && !["Kết thúc", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang)));

  return (
    <>
      <div className="qv-head">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="badge nhap">Mã linh kiện</span>
            <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "ui-monospace, monospace" }}>{d.ma}</span>
            <Clip w="min(55vw, 640px)" style={{ fontSize: 15, fontWeight: 600 }}>{d.ten || "(chưa có tên)"}</Clip>
            {d.thay_ma.map((x: string) => <span key={x} className="badge final" title="Thay mã tương đương">{x}</span>)}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Đối tác: <b>{t.doi_tac.length ? t.doi_tac.join(", ") : "—"}</b>
            {t.don_gia_gan_nhat != null && <> · Đơn giá dự kiến gần nhất <b>{soLuong(t.don_gia_gan_nhat)}</b></>}
          </div>
        </QvHeader>
        <div className="qv-kpis">
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

      <div className="qv-body">
        <div className="qv-col">
          <div className="qv-tabs">
            {([["kho", `Theo kho (${tk?.theoKho.length ?? 0})`], ["eo", `Lịch sử EO / đặt hàng (${d.dong.length})`], ["amis", `Phiếu nhập AMIS (${d.phieu_nhap.length})`], ["loi", `Lỗi theo dõi (${d.loi.length})`]] as [Tab, string][])
              .map(([k, l]) => <button key={k} className={`qv-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
            {tab === "eo" && <label style={{ marginLeft: "auto", fontSize: 12, display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={chiMo} onChange={(e) => setChiMo(e.target.checked)} /> Chỉ đơn đang mở</label>}
          </div>
          {tab === "eo" && d.dong.some(chonDuoc) && (
            <div className="qv-toolbar">
              <button className="btn sm primary" disabled={!chon.size || busy} onClick={push}><I.send width={13} height={13} /> Push đối tác ({chon.size})</button>
              <button className="btn sm" onClick={() => setChon(new Set(dong.filter(chonDuoc).map((r: any) => r.item_id)))}>Chọn mọi dòng còn thiếu</button>
              {chon.size > 0 && <button className="btn sm ghost" onClick={() => setChon(new Set())}>Bỏ chọn</button>}
              <span className="sp muted" style={{ fontSize: 11.5 }}>Cột Thao tác: 3 loại ngày · sửa dòng · ! giải trình · lịch sử</span>
            </div>
          )}
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "6px 12px" }}>{err}</div>}
          <div className="qv-scroll">
            {tab === "kho" && tk && (
              <table className="tbl tbl-dense">
                <thead><tr><th>Kho</th><th style={{ textAlign: "right" }}>Dòng</th><th style={{ textAlign: "right" }}>SL đặt</th><th style={{ textAlign: "right" }}>Đã về (đúng EO)</th>
                  <th style={{ textAlign: "right" }}>Tỷ lệ đáp ứng</th><th style={{ textAlign: "right" }}>Còn thiếu</th><th>Dự kiến về tiếp</th><th>Lần về gần nhất (mọi phiếu AMIS)</th><th style={{ textAlign: "right" }}>Tốc độ TB</th></tr></thead>
                <tbody>
                  {tk.theoKho.length === 0 && <tr><td colSpan={9} className="muted">Chưa có đơn đặt / phiếu nhập cho mã này.</td></tr>}
                  {tk.theoKho.map((k) => (
                    <tr key={k.kho}>
                      <td><Clip w={200}>{k.kho}</Clip></td>
                      <td style={{ textAlign: "right" }}>{soLuong(k.so_dong)}</td>
                      <td style={{ textAlign: "right" }}>{soLuong(k.sl_dat)}</td>
                      <td style={{ textAlign: "right", color: "var(--ok-ink)" }}>{soLuong(k.sl_ve)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: k.ty_le == null ? undefined : k.ty_le >= 90 ? "var(--ok-ink)" : k.ty_le >= 70 ? "var(--warn-ink)" : "var(--danger-ink)" }}>{k.ty_le != null ? `${k.ty_le}%` : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: k.thieu ? 700 : 400 }}>{soLuong(k.thieu)}</td>
                      <td>{k.dk ? ngay(k.dk) : k.thieu ? <span style={{ color: "var(--danger-ink)" }}>Chưa có ngày</span> : "—"}</td>
                      <td>{k.ve ? <>{ngay(k.ve.doc_date)} · <b>{soLuong(k.ve.qty_in)}</b><span className="muted" style={{ fontSize: 11 }}> · {k.ve.doc_no}</span></> : <span className="muted">Chưa về</span>}</td>
                      <td style={{ textAlign: "right" }}>{k.toc != null ? `${k.toc} ngày` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "eo" && (
              <table className="tbl tbl-dense">
                <thead><tr><th className="qv-act">Thao tác</th><th style={{ width: 28, minWidth: 28 }}></th><th>Ngày tạo</th><th>EO · 3TDO</th><th>Trạng thái EO</th><th>Kho · Đối tác</th><th style={{ textAlign: "right" }}>Đặt</th><th style={{ textAlign: "right" }}>Về</th><th style={{ textAlign: "right" }}>Thiếu</th><th><NhanNgay k="NM" ngan /><br /><NhanNgay k="DK" ngan /><br /><NhanNgay k="VE" ngan /></th><th>Tình trạng đơn</th><th>Lý do / ghi chú</th></tr></thead>
                <tbody>
                  {dong.length === 0 && <tr><td colSpan={12} className="muted">Không có dòng.</td></tr>}
                  {dong.map((r: any) => {
                    const Q = quyen(r);
                    const mo = moDong(r);
                    const t = tdBy.get(r.item_id);
                    return (
                    <tr key={r.item_id}><td className="qv-act">
                        {r.trang_thai_eo === "ISSUED" && <button className="btn ghost sm" title="Ngày nhà máy cam kết · dự kiến · hàng về (xem / cập nhật)" onClick={() => setMd({ k: "ndk", x: asDong(r) })}><I.calendar width={14} height={14} /></button>}
                        {mo && Q.canManage && <button className="btn ghost sm" title="Sửa số lượng / ghi chú / ID CRM" onClick={() => setMd({ k: "qty", x: { id: r.item_id, part_code: r.part_code, current_qty: r.so_luong_dat, ghi_chu: r.ghi_chu, crm_id: r.id_crm, order_id: r.id_dat_hang } })}><I.edit width={14} height={14} /></button>}
                        {r.trang_thai_eo === "ISSUED" && Q.canEditPlan && <button className="btn ghost sm" title="Giải trình lỗi (Ai + Lỗi gì)" style={{ fontWeight: 900, width: 26, color: t?.so_loi_cho_gt ? "var(--danger)" : undefined }} onClick={() => setMd({ k: "gt", x: asDong(r) })}>!</button>}
                        {r.trang_thai_eo === "ISSUED" && <button className="btn ghost sm" title="Lịch sử theo dõi (lỗi, giải trình, push, mail)" onClick={() => setMd({ k: "ls", x: asDong(r) })}><I.clock width={14} height={14} /></button>}
                      </td>
                      <td>{chonDuoc(r) && <input type="checkbox" checked={chon.has(r.item_id)} onChange={() => setChon((s) => { const n = new Set(s); if (n.has(r.item_id)) n.delete(r.item_id); else n.add(r.item_id); return n; })} />}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{ngay(r.ngay_tao)}</td>
                      <td style={{ whiteSpace: "nowrap" }}><EoLink id={r.eo_id}>{r.eo_code}</EoLink><div className="muted" style={{ fontSize: 10.5 }}>{r.ma_phe_duyet || "chưa ban hành"}{r.part_code_goc ? ` · ${r.part_code_goc} → ${r.part_code}` : ""}</div></td>
                      <td><StatusBadge status={r.trang_thai_eo} /></td>
                      <td><Clip w={140}>{r.kho}</Clip><Clip w={140} style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.doi_tac || "—"}</Clip></td>
                      <td style={{ textAlign: "right" }}>{soLuong(r.so_luong_dat)}</td>
                      <td style={{ textAlign: "right", color: "var(--ok-ink)" }}>{soLuong(r.sl_nhap_amis_dung_eo)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{soLuong(r.so_luong_con_thieu)}</td>
                      <td><BaNgay nm={t?.ngay_nm_cam_ket} dk={r.ngay_du_kien_gan_nhat} ve={t?.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo} veDu={r.so_luong_con_thieu <= 0 && r.sl_nhap_amis_dung_eo > 0} /></td>
                      <td style={{ whiteSpace: "nowrap" }}><span className={`badge ${TRANG_THAI_MAU[r.trang_thai_don_hang] ?? "nhap"}`}>{r.trang_thai_don_hang}</span><Clip w={120} style={{ fontSize: 10.5, color: r.canh_bao ? "var(--danger-ink)" : "var(--text-muted)" }}>{[r.canh_bao, r.toc_do_hang_ve].filter(Boolean).join(" · ")}</Clip></td>
                      <td><Clip w={120}>{[r.ly_do_ps, r.ghi_chu, r.id_crm && `Ca ${r.id_crm}`].filter(Boolean).join(" · ") || "—"}</Clip></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {tab === "amis" && (
              <table className="tbl tbl-dense">
                <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th style={{ textAlign: "right" }}>SL nhập</th><th>Mã phê duyệt</th><th>Khớp EO</th></tr></thead>
                <tbody>
                  {d.phieu_nhap.length === 0 && <tr><td colSpan={6} className="muted">Chưa có phiếu nhập AMIS cho mã này.</td></tr>}
                  {d.phieu_nhap.map((r: any) => (
                    <tr key={r.id} style={{ opacity: r.voided_at ? 0.45 : 1 }}>
                      <td>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td><Clip w={200}>{r.warehouse_name}</Clip></td>
                      <td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td><td>{r.approval_code_raw}</td>
                      <td>{r.voided_at ? <span className="badge nhap">Đã hủy</span> : r.eo_id ? <EoLink id={r.eo_id}>{r.eo_code}</EoLink>
                        : <span className={`badge ${r.match_status === "CODE_ONLY_NO_LINE" ? "final" : "nhap"}`}>{r.match_status === "CODE_ONLY_NO_LINE" ? "Có mã, không khớp dòng" : "Không khớp"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "loi" && (
              <table className="tbl tbl-dense">
                <thead><tr><th className="qv-act">Thao tác</th><th>Hạn</th><th>EO</th><th>Quy tắc</th><th>Ai</th><th>Lỗi</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {d.loi.length === 0 && <tr><td colSpan={7} className="muted">Không có lỗi theo dõi.</td></tr>}
                  {d.loi.map((l: any) => <tr key={l.id}><td>{ngayGio(l.han)}</td><td><EoLink id={l.eo_id}>{l.eo_code}</EoLink></td><td>{l.quy_tac}</td><td>{l.ai_ma}{l.ai_email ? ` (${ten(l.ai_email)})` : ""}</td><td>{l.loi_ma}</td><td><span className={`badge ${l.trang_thai === "CHO_GIAI_TRINH" ? "reject" : "nhap"}`}>{l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"}</span></td><td className="qv-act">{(() => {
                      const r = d.dong.find((x: any) => x.item_id === l.eo_item_id);
                      return r && quyen(r).canEditPlan && l.trang_thai === "CHO_GIAI_TRINH"
                        ? <button className="btn sm primary" onClick={() => setMd({ k: "gt", x: asDong(r) })}>Giải trình</button> : null;
                    })()}</td>
                    </tr>)}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="qv-col">
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>Nhật ký chỉnh sửa / cập nhật ({log.length})</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {([["all", "Tất cả"], ["sl", "Số lượng / mã"], ["kh", "Kế hoạch"], ["khac", "Khác"]] as const).map(([k, l]) =>
                <button key={k} className={`qv-chip ${loaiLog === k ? "on" : ""}`} onClick={() => setLoaiLog(k)}>{l}</button>)}
            </div>
          </div>
          <div className="qv-scroll">
            <ul className="qv-tl">
              {log.length === 0 && <li className="muted" style={{ fontSize: 12 }}>Không có mục nào.</li>}
              {log.map((e: any) => (
                <li key={e.id} style={{ ["--dot" as any]: /PLAN/.test(e.event_type) ? "#10B981" : /QUANTITY|REPLACE|CANCEL/.test(e.event_type) ? "#F59E0B" : "#3B82F6" }}>
                  <div className="t">{ngayGio(e.created_at)} · {ten(e.user_email)} · {e.eo_id ? <EoLink id={e.eo_id}>{e.eo_code}</EoLink> : null}</div>
                  <div className="h">{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
                  {moTaSuKien(e) && <div className="d">{moTaSuKien(e)}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {md?.k === "ndk" && <NgayHangVeModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "gt" && <GiaiTrinhModal dong={md.x} onClose={() => setMd(null)} onSaved={xong} />}
      {md?.k === "ls" && <LichSuModal dong={md.x} onClose={() => setMd(null)} />}
      {md?.k === "qty" && <QtyModal item={md.x} issued onClose={() => setMd(null)} onSaved={xong} />}
      {pushKq && <PushKetQua dot={pushKq} onClose={() => setPushKq(null)} />}
    </>
  );
}
