import { Link } from "react-router-dom";
import { PageHeader, Card } from "../../components/ui";

const MATRIX: { hanh_dong: string; q: Record<string, string> }[] = [
  { hanh_dong: "Xem mọi EO / báo cáo / lịch sử", q: { Admin: "✔", "KH cung ứng": "✔", "Kế toán": "✔", Kho: "✔", "Theo dõi tiến độ": "✔", View: "✔" } },
  { hanh_dong: "Tạo EO, sửa nháp, gửi trình, hủy trước ban hành", q: { Admin: "✔", "KH cung ứng": "✔", "Kế toán": "–", Kho: "✔*", "Theo dõi tiến độ": "–", View: "–" } },
  { hanh_dong: "Thẩm định (đồng ý / từ chối / yêu cầu cập nhật)", q: { Admin: "✔", "KH cung ứng": "theo giao", "Kế toán": "–", Kho: "theo giao", "Theo dõi tiến độ": "theo giao", View: "–" } },
  { hanh_dong: "Duyệt cuối / ban hành", q: { Admin: "✔", "KH cung ứng": "theo giao", "Kế toán": "–", Kho: "theo giao", "Theo dõi tiến độ": "theo giao", View: "–" } },
  { hanh_dong: "Sửa số lượng dòng sau ban hành (có lý do)", q: { Admin: "✔", "KH cung ứng": "✔", "Kế toán": "–", Kho: "–", "Theo dõi tiến độ": "–", View: "–" } },
  { hanh_dong: "Cập nhật kế hoạch hàng về", q: { Admin: "✔", "KH cung ứng": "✔", "Kế toán": "–", Kho: "✔", "Theo dõi tiến độ": "✔", View: "–" } },
  { hanh_dong: "Duyệt dòng thêm sau ban hành", q: { Admin: "✔", "KH cung ứng": "người duyệt cuối", "Kế toán": "–", Kho: "người duyệt cuối", "Theo dõi tiến độ": "người duyệt cuối", View: "–" } },
  { hanh_dong: "Import AMIS", q: { Admin: "✔", "KH cung ứng": "–", "Kế toán": "✔", Kho: "–", "Theo dõi tiến độ": "–", View: "–" } },
  { hanh_dong: "Quản lý danh mục / người dùng / cấu hình", q: { Admin: "✔", "KH cung ứng": "–", "Kế toán": "–", Kho: "–", "Theo dõi tiến độ": "–", View: "–" } },
];
const ROLES = ["Admin", "KH cung ứng", "Kế toán", "Kho", "Theo dõi tiến độ", "View"];

export default function Roles() {
  return (
    <div>
      <PageHeader title="Phân quyền" breadcrumb={["Cài đặt", "Phân quyền"]} />
      <Card>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Bảng tra cứu quyền theo vai trò (giai đoạn 1 — cố định trong hệ thống, không chỉnh ở đây).
          "Thẩm định / Duyệt cuối" cấp theo từng EO, không phải vai trò toàn cục.
          Để đổi quyền của một người, gán vai trò ở <Link to="/admin/users" className="cell-link">Cài đặt › Người dùng</Link>.
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Hành động</th>{ROLES.map((r) => <th key={r} style={{ textAlign: "center" }}>{r}</th>)}</tr></thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.hanh_dong}>
                  <td>{row.hanh_dong}</td>
                  {ROLES.map((r) => <td key={r} style={{ textAlign: "center", color: row.q[r] === "✔" ? "var(--ok)" : row.q[r] === "–" ? "var(--text-faint)" : "var(--text-muted)", fontWeight: row.q[r] === "✔" ? 700 : 400 }}>{row.q[r] ?? "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
