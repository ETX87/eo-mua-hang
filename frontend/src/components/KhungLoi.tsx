import { Component, type ReactNode } from "react";
import { xoaCacheTrinhDuyet } from "../lib/cacheTrinhDuyet";

/**
 * KHUNG BAT LOI cho moi man (v0.099, bug "vao man CEO trang xoa"): 1 man loi khi ve (vd du lieu cache cu khong khop phien ban moi) -> hien thong bao
 * + nut "Xoa cache & tai lai" thay vi trang trang ca app. Doi duong dan -> thu ve lai (key = pathname o App).
 */
export class KhungLoi extends Component<{ children: ReactNode }, { loi: Error | null }> {
  state = { loi: null as Error | null };
  static getDerivedStateFromError(loi: Error) { return { loi }; }
  componentDidCatch(loi: Error) { console.error("Man bi loi:", loi); }
  render() {
    if (!this.state.loi) return this.props.children;
    return (
      <div className="card card-pad" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 36 }}>⚠️</div>
        <h3 style={{ margin: "8px 0" }}>Màn hình này gặp lỗi khi hiển thị</h3>
        <p className="muted" style={{ fontSize: 13 }}>Thường do dữ liệu lưu tạm trên máy từ phiên bản trước. Bấm nút dưới để xoá dữ liệu tạm và tải lại.</p>
        <p className="muted" style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}>{this.state.loi.message}</p>
        <button className="btn primary" onClick={() => xoaCacheTrinhDuyet().finally(() => location.reload())}>Xoá cache &amp; tải lại</button>
      </div>
    );
  }
}
