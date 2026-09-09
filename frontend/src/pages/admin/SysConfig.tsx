import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";

export default function SysConfig() {
  const q = useQuery({ queryKey: ["app-settings"], queryFn: () => api.get<any[]>("/danh-muc/app") });
  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];
  return (
    <div>
      <PageHeader title="Cấu hình hệ thống" breadcrumb={["Cài đặt", "Cấu hình hệ thống"]} />
      <Card>
        {rows.length === 0 && <div className="muted" style={{ padding: 20 }}>Chưa có tham số cấu hình. Các mục sẽ xuất hiện khi hệ thống cần.</div>}
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 240, fontWeight: 600, fontSize: 13 }}>{r.key}</div>
            <input className="input" defaultValue={r.value ?? ""} style={{ flex: 1, maxWidth: 400 }} />
            <button className="btn sm">Lưu</button>
          </div>
        ))}
      </Card>
    </div>
  );
}
