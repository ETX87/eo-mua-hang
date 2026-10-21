import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { QvHeader, Kpi, EoLink } from "./QuickView";

/**
 * Popup xem nhanh theo MA LINH KIEN (95% man hinh): moi dong EO dat ma nay (ke ca ma goc truoc khi thay ma), phieu nhap
 * AMIS, nhat ky sua / ke hoach / thay ma / giai trinh, loi theo doi. Du lieu: GET /api/xem/linh-kien?ma=.
 */
const TRANG_THAI_MAU: Record<string, string> = {
  "Kết thúc": "issued", "Đơn trên EO bị hủy": "nhap", "Chưa đủ hàng": "final", "Hàng chưa về": "reject", "Chưa ban hành": "nhap",
};
type Tab = "eo" | "amis" | "loi";

export default function PartQuickView({ ma, onClose, onCloseAll, coTruoc }: { ma: string; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const q = useQuery({ queryKey: ["xem-lk", ma], queryFn: () => api.get<any>(`/xem/linh-kien?ma=${encodeURIComponent(ma)}`) });
  const [tab, setTab] = useState<Tab>("eo");
  const [chiMo, setChiMo] = useState(false);
  const [loaiLog, setLoaiLog] = useState<"all" | "sl" | "kh" | "khac">("all");
  const d = q.data;

  const log = useMemo(() => (d?.log ?? []).filter((e: any) =>
    loaiLog === "all" ? true : loaiLog === "kh" ? /PLAN/.test(e.event_type)
      : loaiLog === "sl" ? /QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type) : !/PLAN|QUANTITY|CANCEL_LINE|REPLACE_PART|ADD_ITEM/.test(e.event_type)), [d, loaiLog]);

  if (q.isLoading) return <Spinner />;
  if (!d) return <div style={{ padding: 30 }}>Không tải được dữ liệu mã {ma}. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const t = d.tong;
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
          <Kpi l="Số EO đã đặt" v={soLuong(t.so_eo)} />
          <Kpi l="Số dòng" v={soLuong(t.so_dong)} />
          <Kpi l="Tổng SL đặt (đã BH)" v={soLuong(t.sl_dat)} />
          <Kpi l="Đã về (AMIS)" v={soLuong(t.sl_ve)} tone="ok" />
          <Kpi l="Còn thiếu (đơn mở)" v={soLuong(t.sl_thieu)} tone={t.sl_thieu > 0 ? "warn" : undefined} />
          <Kpi l="Dòng đang mở" v={soLuong(t.dong_mo)} />
          <Kpi l="Thời gian về TB" v={t.lead_time_tb != null ? `${t.lead_time_tb} ngày` : "—"} />
          <Kpi l="Lần về gần nhất" v={t.ve_gan_nhat ? ngay(t.ve_gan_nhat) : "—"} />
        </div>
      </div>

      <div className="qv-body">
        <div className="qv-col">
          <div className="qv-tabs">
            {([["eo", `Lịch sử EO / đặt hàng (${d.dong.length})`], ["amis", `Phiếu nhập AMIS (${d.phieu_nhap.length})`], ["loi", `Lỗi theo dõi (${d.loi.length})`]] as [Tab, string][])
              .map(([k, l]) => <button key={k} className={`qv-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
            {tab === "eo" && <label style={{ marginLeft: "auto", fontSize: 12, display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={chiMo} onChange={(e) => setChiMo(e.target.checked)} /> Chỉ đơn đang mở</label>}
          </div>
          <div className="qv-scroll">
            {tab === "eo" && (
              <table className="tbl tbl-dense">
                <thead><tr><th>Ngày tạo</th><th>EO · 3TDO</th><th>Trạng thái EO</th><th>Kho · Đối tác</th><th style={{ textAlign: "right" }}>Đặt</th><th style={{ textAlign: "right" }}>Về</th><th style={{ textAlign: "right" }}>Thiếu</th><th>Ngày DK</th><th>Tình trạng đơn</th><th>Lý do / ghi chú</th></tr></thead>
                <tbody>
                  {dong.length === 0 && <tr><td colSpan={10} className="muted">Không có dòng.</td></tr>}
                  {dong.map((r: any) => (
                    <tr key={r.item_id}>
                      <td style={{ whiteSpace: "nowrap" }}>{ngay(r.ngay_tao)}</td>
                      <td style={{ whiteSpace: "nowrap" }}><EoLink id={r.eo_id}>{r.eo_code}</EoLink><div className="muted" style={{ fontSize: 10.5 }}>{r.ma_phe_duyet || "chưa ban hành"}{r.part_code_goc ? ` · ${r.part_code_goc} → ${r.part_code}` : ""}</div></td>
                      <td><StatusBadge status={r.trang_thai_eo} /></td>
                      <td><Clip w={170}>{r.kho}</Clip><Clip w={170} style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.doi_tac || "—"}</Clip></td>
                      <td style={{ textAlign: "right" }}>{soLuong(r.so_luong_dat)}</td>
                      <td style={{ textAlign: "right", color: "var(--ok-ink)" }}>{soLuong(r.sl_nhap_amis_dung_eo)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{soLuong(r.so_luong_con_thieu)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{ngay(r.ngay_du_kien_gan_nhat) || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}><span className={`badge ${TRANG_THAI_MAU[r.trang_thai_don_hang] ?? "nhap"}`}>{r.trang_thai_don_hang}</span><Clip w={150} style={{ fontSize: 10.5, color: r.canh_bao ? "var(--danger-ink)" : "var(--text-muted)" }}>{[r.canh_bao, r.toc_do_hang_ve].filter(Boolean).join(" · ")}</Clip></td>
                      <td><Clip w={140}>{[r.ly_do_ps, r.ghi_chu, r.id_crm && `Ca ${r.id_crm}`].filter(Boolean).join(" · ") || "—"}</Clip></td>
                    </tr>
                  ))}
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
                <thead><tr><th>Hạn</th><th>EO</th><th>Quy tắc</th><th>Ai</th><th>Lỗi</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {d.loi.length === 0 && <tr><td colSpan={6} className="muted">Không có lỗi theo dõi.</td></tr>}
                  {d.loi.map((l: any) => <tr key={l.id}><td>{ngayGio(l.han)}</td><td><EoLink id={l.eo_id}>{l.eo_code}</EoLink></td><td>{l.quy_tac}</td><td>{l.ai_ma}{l.ai_email ? ` (${ten(l.ai_email)})` : ""}</td><td>{l.loi_ma}</td><td><span className={`badge ${l.trang_thai === "CHO_GIAI_TRINH" ? "reject" : "nhap"}`}>{l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"}</span></td></tr>)}
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
    </>
  );
}
