import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";

const ROLE_OPTS = ["Admin", "KH cung ung", "Ke toan", "Kho", "Theo doi tien do", "View"];

function roleDisplay(u: any): string {
  if (u.vai_tro) return u.vai_tro;
  if (u.la_nv_dat_hang) return "Người đặt hàng";
  if (u.la_nv_kho) return "NV kho";
  if (u.la_ke_toan) return "Kế toán";
  if (u.la_theo_doi_td) return "Theo dõi tiến độ";
  if (u.la_view) return "Chỉ xem";
  return "—";
}

export default function Users() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<any[]>("/users") });
  if (q.isLoading) return <Spinner />;

  const patch = async (email: string, body: any) => {
    await api.patch(`/users/${encodeURIComponent(email)}`, body);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const cols: Col<any>[] = [
    { key: "ht", header: "Họ tên", render: (r) => r.ho_ten && !String(r.ho_ten).includes("@") ? r.ho_ten : r.email.split("@")[0] },
    { key: "em", header: "Email", render: (r) => <span className="muted">{r.email}</span> },
    {
      key: "vt", header: "Vai trò", render: (r) => (
        <select className="select" style={{ width: 168 }} value={r.vai_tro ?? ""} onClick={(e) => e.stopPropagation()}
          onChange={(e) => patch(r.email, { vai_tro: e.target.value || null })}>
          <option value="">{roleDisplay(r)}</option>
          {ROLE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ),
    },
    {
      key: "tt", header: "Trạng thái", render: (r) => {
        if (r.trang_thai_duyet === "Cho duyet") return <span style={{ color: "var(--warn-ink)", fontWeight: 600 }}>Chờ duyệt</span>;
        if (r.trang_thai_duyet === "Tu choi") return <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}>Từ chối</span>;
        if (!r.active) return <span className="muted" style={{ fontWeight: 600 }}>Ngừng hoạt động</span>;
        return <span style={{ color: "var(--ok-ink)", fontWeight: 600 }}>Hoạt động</span>;
      },
    },
    {
      key: "act", header: "", align: "right", render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          {r.trang_thai_duyet !== "Da duyet"
            ? <button className="btn primary sm" onClick={() => patch(r.email, { trang_thai_duyet: "Da duyet" })}><I.check width={13} height={13} /> Duyệt</button>
            : <button className="btn ghost sm" onClick={() => patch(r.email, { active: r.active ? 0 : 1 })}>{r.active ? "Ngừng" : "Kích hoạt"}</button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Người dùng" actions={<button className="btn primary"><I.plus width={14} height={14} /> Thêm người dùng</button>} />
      <Card>
        <DataTable cols={cols} rows={q.data ?? []} keyOf={(r) => r.email} pageSize={PAGE_SIZE} />
      </Card>
    </div>
  );
}
