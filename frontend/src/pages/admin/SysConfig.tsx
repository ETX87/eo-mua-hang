import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";

function ConfigRow({ r, onSave }: { r: { key: string; value: string | null }; onSave: (key: string, value: string) => Promise<void> }) {
  const [value, setValue] = useState(r.value ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(r.key, value); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 240, fontWeight: 600, fontSize: 13 }}>{r.key}</div>
      <input className="input" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
      <button className="btn sm" disabled={busy} onClick={save}>Lưu</button>
    </div>
  );
}

export default function SysConfig() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["app-settings"], queryFn: () => api.get<any[]>("/danh-muc/app") });
  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];

  const save = async (key: string, value: string) => {
    await api.put(`/danh-muc/app/${encodeURIComponent(key)}`, { value });
    qc.invalidateQueries({ queryKey: ["app-settings"] });
  };

  return (
    <div>
      <PageHeader title="Cấu hình hệ thống" breadcrumb={["Cài đặt", "Cấu hình hệ thống"]} />
      <Card>
        {rows.length === 0 && <div className="muted" style={{ padding: 20 }}>Chưa có tham số cấu hình. Các mục sẽ xuất hiện khi hệ thống cần.</div>}
        {rows.map((r) => <ConfigRow key={r.key} r={r} onSave={save} />)}
      </Card>
    </div>
  );
}
