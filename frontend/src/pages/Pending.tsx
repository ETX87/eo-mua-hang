import { api } from "../api/client";

export default function Pending({ me }: { me: { email: string; trang_thai_duyet: string } }) {
  const rejected = me.trang_thai_duyet === "Tu choi";
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--panel-2)" }}>
      <div className="card card-pad" style={{ width: 420, textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>{rejected ? "🚫" : "⏳"}</div>
        <h2 style={{ margin: "10px 0 6px", fontSize: 18 }}>{rejected ? "Tài khoản bị từ chối" : "Tài khoản đang chờ duyệt"}</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          {me.email}<br />
          {rejected ? "Liên hệ quản trị viên nếu cần hỗ trợ." : "Quản trị viên sẽ cấp quyền cho bạn. Vui lòng quay lại sau."}
        </p>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => api.post("/auth/logout").then(() => (location.href = "/"))}>Đăng xuất</button>
      </div>
    </div>
  );
}
