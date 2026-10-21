import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { Clip } from "../Clip";
import { soLuong, tien, ngay, ngayGio, ten } from "../../lib/format";
import { EVENT_LABEL, moTaSuKien } from "../../lib/eventLabels";
import { driveThumb, fileSize, isImage } from "../../lib/files";
import { QvHeader, Kpi, PartLink } from "./QuickView";

/**
 * Popup xem nhanh 1 EO (95% man hinh). Du lieu: GET /eo/:id (goc) + GET /xem/eo/:id/bo-sung (theo doi, loi, giai trinh,
 * push, mail theodoimuahang, phieu AMIS, canh bao). Trai: tab noi dung; phai: nhat ky hop nhat co loc.
 */
const TT: Record<string, { l: string; c: string }> = {
  CHO_NDK: { l: "Chờ ngày DK", c: "final" }, TRE_NDK: { l: "Trễ 24h chưa ngày DK", c: "reject" },
  QUA_HAN_NDK: { l: "Quá ngày DK", c: "reject" }, CHO_HANG: { l: "Chờ hàng", c: "review" }, DONG: { l: "Đã đóng", c: "issued" },
};
const QUY_TAC: Record<string, string> = { R1: "Không có ngày DK trong 24h", R3: "Không push đối tác", R4: "Quá hạn không cập nhật ngày DK", TAY: "Lỗi ghi khi giải trình" };
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

export default function EoQuickView({ id, onClose, onCloseAll, coTruoc }: { id: number; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const goc = useQuery({ queryKey: ["eo", String(id)], queryFn: () => api.get<any>(`/eo/${id}`) });
  const bs = useQuery({ queryKey: ["eo-bo-sung", id], queryFn: () => api.get<any>(`/xem/eo/${id}/bo-sung`) });
  const [tab, setTab] = useState<Tab>("lk");
  const [nhom, setNhom] = useState<Nhom>("all");
  const [cmt, setCmt] = useState("");
  const [busy, setBusy] = useState(false);

  const d = goc.data;
  const b = bs.data;
  const tdBy = useMemo(() => new Map((b?.theo_doi ?? []).map((t: any) => [t.item_id, t])), [b]);
  const itemBy = useMemo(() => new Map((d?.items ?? []).map((i: any) => [i.id, i])), [d]);

  const tl = useMemo(() => {
    if (!d) return [];
    const out: { at: string; nhom: Nhom; h: string; ai?: string | null; text?: string }[] = [];
    for (const e of d.events) {
      const it = itemBy.get(e.entity_id) as any;
      out.push({ at: e.created_at, nhom: nhomCua(e.event_type), h: `${EVENT_LABEL[e.event_type] ?? e.event_type}${e.entity_type === "eo_item" && it ? ` · ${it.part_code}` : ""}`, ai: e.user_email, text: moTaSuKien(e) });
    }
    for (const c of d.comments) out.push({ at: c.created_at, nhom: "binhluan", h: "Bình luận", ai: c.user_email, text: c.noi_dung });
    for (const l of b?.loi ?? []) {
      const it = itemBy.get(l.eo_item_id) as any;
      out.push({ at: l.han || l.created_at, nhom: "loi", h: `Lỗi: ${QUY_TAC[l.quy_tac] ?? l.quy_tac}${it ? ` · ${it.part_code}` : ""}`, ai: l.ai_email, text: l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình" });
    }
    for (const p of b?.push ?? []) out.push({ at: p.created_at, nhom: "mail", h: `Tạo push ${p.ma_push} · ${p.doi_tac}`, ai: p.created_by, text: `${p.so_dong} dòng · ${p.trang_thai === "DA_TAO" ? "đã tạo file" : p.trang_thai === "DA_GUI" ? "đã gửi mail" : "đối tác đã phản hồi"}` });
    for (const m of b?.mail ?? []) out.push({ at: m.thoi_gian || m.synced_at, nhom: "mail", h: `${m.huong === "GUI" ? "✉ Gửi" : "✉ Nhận"}: ${m.tieu_de ?? ""}`, ai: m.huong === "GUI" ? m.den : m.tu, text: m.tom_tat ?? "" });
    return out.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 300);
  }, [d, b, itemBy]);

  if (goc.isLoading) return <Spinner />;
  if (!d) return <div style={{ padding: 30 }}>Không tải được EO. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const eo = d.eo;
  const loiCho = (b?.loi ?? []).filter((l: any) => l.trang_thai === "CHO_GIAI_TRINH").length;
  const tlLoc = tl.filter((x) => nhom === "all" || x.nhom === nhom);

  const guiBinhLuan = async () => {
    if (!cmt.trim()) return;
    setBusy(true);
    try { await api.post(`/eo/${id}/comments`, { noi_dung: cmt.trim() }); setCmt(""); qc.invalidateQueries({ queryKey: ["eo", String(id)] }); }
    finally { setBusy(false); }
  };

  const tabs: { k: Tab; l: string }[] = [
    { k: "lk", l: `Linh kiện (${d.items.length})` },
    { k: "kh", l: `Kế hoạch & hàng về (${d.plans.length} · ${(b?.phieu_nhap ?? []).length})` },
    { k: "duyet", l: `Quy trình duyệt (${d.submissions.length})` },
    { k: "file", l: `Tài liệu (${d.files.length})` },
    { k: "mail", l: `Mail & push (${(b?.mail ?? []).length + (b?.push ?? []).length})` },
  ];

  return (
    <>
      <div className="qv-head">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll} actions={<>
          {eo.trang_thai === "DRAFT" && <button className="btn sm" onClick={() => { onCloseAll(); nav(`/eo/${id}/edit`); }}>Sửa EO</button>}
          <button className="btn sm primary" onClick={() => { onCloseAll(); nav(`/eo/${id}`); }}>Mở trang chi tiết</button>
        </>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "var(--brand-ink)" }}>{eo.eo_code}</span>
            <StatusBadge status={eo.trang_thai} />
            {eo.approval_code ? <span className="badge issued">{eo.approval_code}</span> : <span className="badge nhap">Chưa ban hành</span>}
            <Clip w="min(60vw, 720px)" style={{ fontSize: 15, fontWeight: 600 }}>{eo.tieu_de || "(không tiêu đề)"}</Clip>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Người tạo <b>{ten(eo.created_by)}</b> · {ngayGio(eo.created_at)}</span>
            <span>Phòng ban <b>{eo.phong_ban || "—"}</b></span>
            <span>Loại hình <b>{eo.loai_hinh || "—"}</b></span>
            <span>Duyệt cuối <b>{ten(eo.final_approver_email)}</b></span>
            {eo.issued_at && <span>Ban hành <b>{ngayGio(eo.issued_at)}</b></span>}
            {eo.cancelled_at && <span style={{ color: "var(--danger-ink)" }}>Hủy {ngayGio(eo.cancelled_at)}{eo.cancel_reason ? ` — ${eo.cancel_reason}` : ""}</span>}
          </div>
        </QvHeader>
        <div className="qv-kpis">
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
      </div>

      <div className="qv-body">
        {/* ------- trai: noi dung ------- */}
        <div className="qv-col">
          <div className="qv-tabs">{tabs.map((t) => <button key={t.k} className={`qv-tab ${tab === t.k ? "on" : ""}`} onClick={() => setTab(t.k)}>{t.l}</button>)}</div>
          <div className="qv-scroll">
            {tab === "lk" && (
              <table className="tbl tbl-dense">
                <thead><tr><th>#</th><th>Mã LK</th><th>Tên linh kiện</th><th>Kho · Đối tác</th><th style={{ textAlign: "right" }}>Đặt</th><th style={{ textAlign: "right" }}>Về</th><th style={{ textAlign: "right" }}>Thiếu</th><th>Ngày DK</th><th>Theo dõi</th><th>Ca / ghi chú</th></tr></thead>
                <tbody>
                  {d.items.map((r: any, i: number) => {
                    const t = tdBy.get(r.id) as any;
                    const kh = d.plans.filter((p: any) => p.eo_item_id === r.id);
                    const ndk = t?.ngay_du_kien_gan_nhat ?? kh.map((p: any) => p.planned_date).sort().pop();
                    return (
                      <tr key={r.id} style={{ opacity: r.line_status === "CANCELLED_LINE" ? 0.5 : 1 }}>
                        <td className="muted">{i + 1}</td>
                        <td style={{ whiteSpace: "nowrap" }}><PartLink ma={r.part_code} />{r.part_code_goc && <div className="muted" style={{ fontSize: 10.5 }}>thay từ {r.part_code_goc}</div>}{r.post_issue_status && <div style={{ fontSize: 10.5, color: "var(--orange-ink)" }}>{r.post_issue_status === "PENDING" ? "Chờ duyệt sau BH" : "Thêm sau BH"}</div>}</td>
                        <td><Clip w={190}>{r.part_name}</Clip></td>
                        <td><Clip w={160}>{r.warehouse}</Clip><Clip w={160} style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.supplier || "—"}</Clip></td>
                        <td style={{ textAlign: "right" }}>{soLuong(r.current_qty)}</td>
                        <td style={{ textAlign: "right", color: "var(--ok-ink)" }}>{soLuong(r.da_dat)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{soLuong(r.chua_dat)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{ndk ? ngay(ndk) : "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{t ? <><span className={`badge ${TT[t.tinh_trang]?.c ?? "nhap"}`}>{TT[t.tinh_trang]?.l}</span>{t.so_loi > 0 && <span className="badge reject" style={{ marginLeft: 4 }}>{t.so_loi} lỗi</span>}{t.ceo_ly_do.length > 0 && <span className="badge reject" style={{ marginLeft: 4 }} title={t.ceo_ly_do.join("\n")}>CEO</span>}</> : <span className="muted">—</span>}</td>
                        <td><Clip w={130}>{[r.crm_id && `Ca ${r.crm_id}`, r.order_id, r.ghi_chu].filter(Boolean).join(" · ") || "—"}</Clip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {tab === "kh" && (
              <>
                <div className="qv-sec">Mốc kế hoạch hàng về</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Mã LK</th><th>Ngày / tuần</th><th style={{ textAlign: "right" }}>SL</th><th>NM cam kết</th><th>Ghi chú</th><th>Cập nhật</th></tr></thead>
                  <tbody>
                    {d.plans.length === 0 && <tr><td colSpan={6} className="muted">Chưa có kế hoạch.</td></tr>}
                    {d.plans.map((p: any) => (
                      <tr key={p.id}><td><PartLink ma={(itemBy.get(p.eo_item_id) as any)?.part_code} /></td><td>{p.loai === "TUAN" ? `Tuần ${p.tuan}` : ngay(p.planned_date)}</td><td style={{ textAlign: "right" }}>{soLuong(p.planned_qty)}</td><td>{ngay(p.factory_committed_date)}</td><td><Clip w={220}>{p.ghi_chu || ""}</Clip></td><td className="muted">{ten(p.updated_by || p.created_by)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="qv-sec">Phiếu nhập AMIS khớp EO</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th>Mã LK</th><th style={{ textAlign: "right" }}>SL nhập</th></tr></thead>
                  <tbody>
                    {(b?.phieu_nhap ?? []).length === 0 && <tr><td colSpan={5} className="muted">Chưa có phiếu nhập.</td></tr>}
                    {(b?.phieu_nhap ?? []).map((r: any) => <tr key={r.id}><td>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td><Clip w={180}>{r.warehouse_name}</Clip></td><td><PartLink ma={r.part_code} /></td><td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td></tr>)}
                  </tbody>
                </table>
                {(b?.phieu_khong_khop ?? []).length > 0 && (
                  <>
                    <div className="qv-sec" style={{ color: "var(--warn-ink)" }}>Phiếu AMIS có mã {eo.approval_code} nhưng KHÔNG khớp dòng</div>
                    <table className="tbl tbl-dense">
                      <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th>Mã hàng</th><th>Tên hàng</th><th style={{ textAlign: "right" }}>SL</th></tr></thead>
                      <tbody>{b.phieu_khong_khop.map((r: any) => <tr key={r.id}><td>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td><Clip w={180}>{r.warehouse_name}</Clip></td><td><PartLink ma={r.part_code} /></td><td><Clip w={190}>{r.part_name}</Clip></td><td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td></tr>)}</tbody>
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
                        <span className="badge nhap">{a.step_type === "FINAL" ? "Duyệt cuối" : "Thẩm định"}</span>
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
              <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {d.files.length === 0 && <div className="muted">Chưa có tài liệu.</div>}
                {d.files.map((f: any) => (
                  <a key={f.id} href={f.drive_url || undefined} target="_blank" rel="noopener" style={{ textDecoration: "none", color: "inherit", border: "1px solid var(--border)", borderRadius: 10, padding: 8, display: "block" }}>
                    {isImage(f.file_name) && f.drive_file_id && <img src={driveThumb(f.drive_file_id)} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6, background: "#F1F5F9" }} />}
                    <Clip w="100%" style={{ fontWeight: 600, fontSize: 12.5, marginTop: 4 }}>📎 {f.file_name}</Clip>
                    <div className="muted" style={{ fontSize: 11 }}>{ten(f.uploaded_by)} · {ngayGio(f.uploaded_at)}{f.file_size ? ` · ${fileSize(f.file_size)}` : ""}</div>
                  </a>
                ))}
              </div>
            )}
            {tab === "mail" && (
              <>
                <div className="qv-sec">Đợt push đối tác</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Mã push</th><th>Đối tác</th><th style={{ textAlign: "right" }}>Dòng</th><th>Trạng thái</th><th>Người tạo</th><th>Lúc</th></tr></thead>
                  <tbody>
                    {(b?.push ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa push đối tác.</td></tr>}
                    {(b?.push ?? []).map((p: any) => <tr key={p.id}><td style={{ fontFamily: "monospace" }}>{p.ma_push}</td><td><Clip w={160}>{p.doi_tac}</Clip></td><td style={{ textAlign: "right" }}>{p.so_dong}</td><td><span className="badge nhap">{p.trang_thai === "DA_TAO" ? "Đã tạo file" : p.trang_thai === "DA_GUI" ? "Đã gửi" : "Đã phản hồi"}</span></td><td>{ten(p.created_by)}</td><td>{ngayGio(p.created_at)}</td></tr>)}
                  </tbody>
                </table>
                <div className="qv-sec">Luồng mail theodoimuahang@gmail.com</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th></th><th>Lúc</th><th>Từ → Đến</th><th>Tiêu đề / tóm tắt</th></tr></thead>
                  <tbody>
                    {(b?.mail ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa có mail đồng bộ (app theo-doi-mua-hang).</td></tr>}
                    {(b?.mail ?? []).map((m: any) => <tr key={m.id}><td>{m.huong === "GUI" ? "→" : "←"}</td><td style={{ whiteSpace: "nowrap" }}>{ngayGio(m.thoi_gian)}</td><td><Clip w={220}>{m.tu} → {m.den}</Clip></td><td><Clip w={420}><b>{m.tieu_de}</b>{m.tom_tat ? ` — ${m.tom_tat}` : ""}</Clip></td></tr>)}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        {/* ------- phai: nhat ky ------- */}
        <div className="qv-col">
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>Nhật ký xử lý ({tlLoc.length})</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {NHOM_TL.map((n) => <button key={n.k} className={`qv-chip ${nhom === n.k ? "on" : ""}`} onClick={() => setNhom(n.k)}>{n.l}</button>)}
            </div>
          </div>
          <div className="qv-scroll">
            <ul className="qv-tl">
              {tlLoc.length === 0 && <li className="muted" style={{ fontSize: 12 }}>Không có mục nào.</li>}
              {tlLoc.map((x, i) => (
                <li key={i} style={{ ["--dot" as any]: MAU[x.nhom] }}>
                  <div className="t">{ngayGio(x.at)}{x.ai ? ` · ${ten(x.ai)}` : ""}</div>
                  <div className="h">{x.h}</div>
                  {x.text && <div className="d">{x.text}</div>}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 6 }}>
            <input className="input" placeholder="Viết bình luận / trao đổi…" value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guiBinhLuan()} />
            <button className="btn primary" disabled={busy || !cmt.trim()} onClick={guiBinhLuan}>Gửi</button>
          </div>
        </div>
      </div>
    </>
  );
}
