import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner, Modal } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong } from "../../lib/format";
import { PHONG_BAN } from "../../lib/nav";

type Tab = "kho" | "loai" | "toc";

export default function DanhMuc() {
  const [tab, setTab] = useState<Tab>("kho");
  const [edit, setEdit] = useState<{ tab: Tab; row: any } | null>(null);
  const qc = useQueryClient();
  const kho = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const loai = useQuery({ queryKey: ["dm-loaihinh"], queryFn: () => api.get<any[]>("/danh-muc/loai-hinh") });
  const toc = useQuery({ queryKey: ["dm-tocdo"], queryFn: () => api.get<any[]>("/danh-muc/toc-do") });

  const toggleKhoActive = async (r: any, active: boolean) => {
    await api.put(`/danh-muc/kho/${encodeURIComponent(r.ten_kho)}`, { ma_kho: r.ma_kho ?? null, active: active ? 1 : 0 });
    qc.invalidateQueries({ queryKey: ["dm-kho"] });
  };
  const delToc = async (r: any) => {
    if (!confirm(`Xóa ngưỡng "${r.label}"?`)) return;
    try {
      await api.del(`/danh-muc/toc-do/${r.min_days}`);
      qc.invalidateQueries({ queryKey: ["dm-tocdo"] });
    } catch (e: any) {
      alert(e?.body?.error === "LAST_BUCKET" ? "Phải còn ít nhất 1 ngưỡng." : "Lỗi xóa.");
    }
  };

  const editBtn = (t: Tab, r: any) => (
    <button className="btn ghost sm" title="Sửa" onClick={() => setEdit({ tab: t, row: r })}><I.edit width={14} height={14} /></button>
  );
  const khoCols: Col<any>[] = [
    { key: "t", header: "Tên kho", render: (r) => r.ten_kho },
    { key: "m", header: "Mã kho", render: (r) => r.ma_kho || "" },
    { key: "a", header: "Kích hoạt", align: "center", render: (r) => <input type="checkbox" checked={!!r.active} onChange={(e) => toggleKhoActive(r, e.target.checked)} /> },
    { key: "e", header: "", align: "center", width: 60, render: (r) => editBtn("kho", r) },
  ];
  const loaiCols: Col<any>[] = [
    { key: "c", header: "Mã", render: (r) => r.code },
    { key: "t", header: "Tên", render: (r) => r.ten || "" },
    { key: "c2", header: "Loại hình cấp 2", render: (r) => r.cap2 || "" },
    { key: "pb", header: "Phòng ban", render: (r) => r.phong_ban || "" },
    { key: "e", header: "", align: "center", width: 60, render: (r) => editBtn("loai", r) },
  ];
  const tocCols: Col<any>[] = [
    { key: "d", header: "Từ (ngày)", align: "right", render: (r) => r.min_days === -999999 ? "–∞" : soLuong(r.min_days) },
    { key: "l", header: "Nhãn", render: (r) => r.label },
    {
      key: "e", header: "", align: "center", width: 90, render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {editBtn("toc", r)}
          <button className="btn ghost sm danger" title="Xóa" onClick={() => delToc(r)}><I.trash width={14} height={14} /></button>
        </div>
      ),
    },
  ];

  const addLabel = { kho: "Thêm kho", loai: "Thêm loại hình", toc: "Thêm ngưỡng" }[tab];

  return (
    <div>
      <PageHeader title="Danh mục" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {[["kho", "Kho"], ["loai", "Loại hình EO"], ["toc", "Ngưỡng tốc độ hàng về"]].map(([k, l]) => (
          <button key={k} className={`btn sm ${tab === k ? "primary" : ""}`} onClick={() => setTab(k as Tab)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn sm primary" onClick={() => setEdit({ tab, row: null })}><I.plus width={14} height={14} /> {addLabel}</button>
      </div>
      <Card>
        {tab === "kho" && (kho.isLoading ? <Spinner /> : <DataTable cols={khoCols} rows={kho.data ?? []} keyOf={(r) => r.ten_kho} pageSize={PAGE_SIZE} />)}
        {tab === "loai" && (loai.isLoading ? <Spinner /> : <DataTable cols={loaiCols} rows={loai.data ?? []} keyOf={(r) => r.code} pageSize={PAGE_SIZE} />)}
        {tab === "toc" && (toc.isLoading ? <Spinner /> : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              Tốc độ hàng về = (ngày về thực tế − ngày ban hành). Mỗi ngưỡng áp dụng từ "Từ (ngày)" tới ngưỡng kế tiếp.
            </div>
            <DataTable cols={tocCols} rows={toc.data ?? []} keyOf={(r) => r.min_days} pageSize={PAGE_SIZE} />
          </>
        ))}
      </Card>

      {edit && (
        <EditModal edit={edit} onClose={() => setEdit(null)} onSaved={() => {
          const key = { kho: "dm-kho", loai: "dm-loaihinh", toc: "dm-tocdo" }[edit.tab];
          qc.invalidateQueries({ queryKey: [key] });
          setEdit(null);
        }} />
      )}
    </div>
  );
}

function EditModal({ edit, onClose, onSaved }: { edit: { tab: Tab; row: any }; onClose: () => void; onSaved: () => void }) {
  const { tab, row } = edit;
  const isNew = row == null;
  const [a, setA] = useState<string>(
    tab === "kho" ? row?.ten_kho ?? "" : tab === "loai" ? row?.code ?? "" : row ? String(row.min_days) : "",
  );
  const [b, setB] = useState<string>(tab === "kho" ? row?.ma_kho ?? "" : tab === "loai" ? row?.ten ?? "" : row?.label ?? "");
  const [cap2, setCap2] = useState<string>(row?.cap2 ?? "");
  const [pb, setPb] = useState<string>(row?.phong_ban ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr("");
    if (!a.trim()) return setErr("Nhập đủ trường bắt buộc.");
    setBusy(true);
    try {
      if (tab === "kho") {
        await api.put(`/danh-muc/kho/${encodeURIComponent(a.trim())}`, { ma_kho: b.trim() || null, active: row ? row.active : 1 });
      } else if (tab === "loai") {
        await api.put(`/danh-muc/loai-hinh/${encodeURIComponent(a.trim())}`, { ten: b.trim() || a.trim(), cap2: cap2.trim() || null, phong_ban: pb || null });
      } else {
        const n = Number(a);
        if (!Number.isFinite(n)) { setBusy(false); return setErr("Số ngày không hợp lệ."); }
        if (!b.trim()) { setBusy(false); return setErr("Nhập nhãn."); }
        await api.put("/danh-muc/toc-do", { old_min_days: row ? row.min_days : null, min_days: n, label: b.trim() });
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "ALREADY_EXISTS" ? "Ngưỡng này đã tồn tại." : "Lỗi lưu.");
      setBusy(false);
    }
  };

  const title = { kho: "kho", loai: "loại hình EO", toc: "ngưỡng tốc độ" }[tab];
  return (
    <Modal title={`${isNew ? "Thêm" : "Sửa"} ${title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      {tab === "kho" && <>
        <label className="field-label">Tên kho <span className="req">*</span></label>
        <input className="input" value={a} disabled={!isNew} onChange={(e) => setA(e.target.value)} placeholder="VD: Kho Hà Nội" />
        <label className="field-label" style={{ marginTop: 12 }}>Mã kho</label>
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} />
      </>}
      {tab === "loai" && <>
        <label className="field-label">Mã <span className="req">*</span></label>
        <input className="input" value={a} disabled={!isNew} onChange={(e) => setA(e.target.value)} placeholder="VD: PO.D102.Khác" />
        <label className="field-label" style={{ marginTop: 12 }}>Tên</label>
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Loại hình cấp 2</label>
        <input className="input" value={cap2} onChange={(e) => setCap2(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Phòng ban</label>
        <select className="select" value={pb} onChange={(e) => setPb(e.target.value)}>
          <option value="">—</option>
          {[...new Set([...PHONG_BAN, ...(pb ? [pb] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </>}
      {tab === "toc" && <>
        <label className="field-label">Từ (ngày) <span className="req">*</span></label>
        <input className="input" type="number" value={a} onChange={(e) => setA(e.target.value)} placeholder="VD: 30" />
        <label className="field-label" style={{ marginTop: 12 }}>Nhãn <span className="req">*</span></label>
        <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="VD: Chậm" />
      </>}
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}
