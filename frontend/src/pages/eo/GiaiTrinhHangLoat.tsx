import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Spinner } from "../../components/ui";
import { DataTable, type Col } from "../../components/DataTable";
import { EoLink } from "../../components/quickview/QuickView";
import { soLuong, ngay, ten } from "../../lib/format";
import { lietKe } from "../../lib/gopTrung";
import { GiaiTrinhNhieuModal } from "../theodoi/GiaiTrinhPo";

/**
 * GIAI TRINH HANG LOAT tu danh sach Don PO (v0.095, yeu cau: "vao menu PO => filter doi tac Karofi => an nut giai trinh hang loat =>
 * hien UI cac loi can giai trinh => tich chon de giai trinh hang loat").
 * Lay MOI PO dang loc (moi trang, GET /eo voi cung bo loc) -> vi pham CHO giai trinh cua cac PO do (GET /vi-pham, da gop theo vp_khoa =
 * cung loi + cung PO + cung ky) -> tab theo loai loi (giai trinh chung chi cho cung loai - backend /vi-pham/giai-trinh-nhieu) -> tick -> GiaiTrinhNhieuModal.
 */
type L = Record<string, any>;
interface Vp { khoa: string; x: L; ds: L[] }
const LOAI: Record<string, string> = { R1: "Chưa có ngày DK (24h/48h)", R3: "Không push NCC (thứ 2/4)", R4: "Quá ngày DK không cập nhật", TAY: "Lỗi ghi tay" };

export function GiaiTrinhHangLoatModal({ params, moTa, onClose }: { params: URLSearchParams; moTa: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["gt-hang-loat", params.toString()],
    queryFn: async () => {
      const p = new URLSearchParams(params);
      p.set("limit", "500");
      const ids = new Set<number>();
      for (let off = 0; ; off += 500) {
        p.set("offset", String(off));
        const r = await api.get<{ rows: { id: number }[]; total: number }>("/eo?" + p.toString());
        r.rows.forEach((x) => ids.add(x.id));
        if (ids.size >= r.total || !r.rows.length) break;
      }
      const vp = await api.get<{ rows: L[]; co_the_gt: boolean }>("/vi-pham");
      return { soPo: ids.size, coTheGt: vp.co_the_gt, rows: vp.rows.filter((l) => ids.has(l.eo_id) && l.trang_thai === "CHO_GIAI_TRINH") };
    },
  });
  const vps = useMemo<Vp[]>(() => {
    const m = new Map<string, L[]>();
    for (const l of q.data?.rows ?? []) { const k = l.vp_khoa ?? `${l.id}`; m.set(k, [...(m.get(k) ?? []), l]); }
    return [...m.entries()].map(([khoa, ds]) => ({ khoa, ds, x: ds[0] }));
  }, [q.data]);
  const loaiCo = Object.keys(LOAI).filter((k) => vps.some((v) => v.x.quy_tac === k));
  const [loai, setLoai] = useState("");
  const loaiDang = loai || loaiCo[0] || "";
  const ds = vps.filter((v) => v.x.quy_tac === loaiDang);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [gt, setGt] = useState(false);
  const daChon = ds.filter((v) => chon.has(v.khoa));
  const soDong = (v: Vp) => new Set(v.ds.map((l) => l.eo_item_id)).size;

  const cols: Col<Vp>[] = [
    { key: "tick", header: <input type="checkbox" checked={ds.length > 0 && daChon.length === ds.length} onChange={(e) => setChon(e.target.checked ? new Set(ds.map((v) => v.khoa)) : new Set())} title="Chọn tất cả vi phạm loại này" />,
      render: (v) => <input type="checkbox" checked={chon.has(v.khoa)} onClick={(e) => e.stopPropagation()} onChange={() => setChon((s) => { const n = new Set(s); if (n.has(v.khoa)) n.delete(v.khoa); else n.add(v.khoa); return n; })} /> },
    { key: "ma", header: "Mã lỗi", loc: "chon", gt: (v) => v.x.ma_loi, render: (v) => <b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{v.x.ma_loi}</b> },
    { key: "po", header: "PO", loc: "chu", gt: (v) => `${v.x.approval_code ?? ""} ${v.x.eo_code}`, render: (v) => <EoLink id={v.x.eo_id}>{v.x.approval_code || v.x.eo_code}</EoLink> },
    { key: "ky", header: "Ngày vi phạm", loc: "ngay", gt: (v) => v.x.ngay_tham_chieu ?? v.x.han, render: (v) => ngay(v.x.ngay_tham_chieu ?? v.x.han) },
    { key: "dong", header: "Số dòng", loc: "so", gt: soDong, align: "right", render: (v) => soDong(v) },
    { key: "lk", header: "Linh kiện", loc: "chu", gt: (v) => v.ds.map((l) => l.part_code).join(" "), maxW: 260, render: (v) => <span title={lietKe(v.ds.map((l) => l.part_code), 40)}>{lietKe([...new Set(v.ds.map((l) => l.part_code))], 4)}</span> },
    { key: "ncc", header: "Đối tác", loc: "chon", gt: (v) => v.x.doi_tac ?? "", render: (v) => v.x.doi_tac ?? "—" },
    { key: "cho", header: "Chờ (ngày)", loc: "so", gt: (v) => Math.max(...v.ds.map((l) => l.tuoi_ngay ?? 0)), align: "right", render: (v) => Math.max(...v.ds.map((l) => l.tuoi_ngay ?? 0)) },
    { key: "nguoi", header: "Người bị gán", loc: "chon", gt: (v) => v.x.nguoi_vp ?? "", nhanChon: (x) => ten(x), render: (v) => ten(v.x.nguoi_vp) },
  ];

  return (
    <Modal title="Giải trình hàng loạt" onClose={onClose} width={1100}
      footer={<>
        <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Giải trình chung chỉ cho các vi phạm CÙNG loại lỗi. R1 / R4 bắt buộc ảnh bằng chứng.</span>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!daChon.length || !q.data?.coTheGt} title={q.data && !q.data.coTheGt ? "Tài khoản của bạn không có quyền giải trình" : undefined} onClick={() => setGt(true)}>
          Giải trình chung ({daChon.length} vi phạm · {daChon.reduce((s, v) => s + soDong(v), 0)} dòng)</button>
      </>}>
      {q.isLoading || !q.data ? <Spinner text="Đang lấy các PO đang lọc và vi phạm chờ giải trình…" /> : (
        <div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Phạm vi: <b>{soLuong(q.data.soPo)} PO</b> đang lọc ở Đơn PO{moTa ? <> ({moTa})</> : null} → <b>{soLuong(vps.length)} vi phạm</b> chờ giải trình
            ({soLuong(q.data.rows.length)} dòng). 1 vi phạm = cùng lỗi, cùng PO, cùng kỳ.
          </div>
          {vps.length === 0 ? <div className="qv-alert ok" style={{ display: "block" }}>✓ Các PO đang lọc không có vi phạm nào chờ giải trình.</div> : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {loaiCo.map((k) => (
                  <button key={k} className={`qv-chip ${loaiDang === k ? "on" : ""}`} onClick={() => { setLoai(k); setChon(new Set()); }}>
                    {LOAI[k]} ({vps.filter((v) => v.x.quy_tac === k).length})</button>
                ))}
              </div>
              <DataTable cols={cols} rows={ds} keyOf={(v) => v.khoa} pageSize={15} timKiem={false}
                onRowClick={(v) => setChon((s) => { const n = new Set(s); if (n.has(v.khoa)) n.delete(v.khoa); else n.add(v.khoa); return n; })} />
            </>
          )}
        </div>
      )}
      {gt && <GiaiTrinhNhieuModal nhom={daChon.map((v) => ({ x: v.x, ds: v.ds }))} onClose={() => setGt(false)}
        onSaved={() => { setGt(false); setChon(new Set()); ["gt-hang-loat", "vi-pham", "eo-list", "eo-dem", "inbox-count", "tl-dong"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }} />}
    </Modal>
  );
}
