import { useState, type ReactNode } from "react";
import { Modal } from "../components/ui";
import { NGAY } from "./ngay";

/**
 * Thuat ngu DUNG CHUNG cho moi so lieu / o nhap tren EO va dong linh kien: ten hien thi + "la gi" + "de lam gi".
 * Moi man phai lay nhan tu day (component <Hoi k=...>) de nguoi dung hieu so do la gi, tai sao phai nhap.
 * 3 loai ngay (hang ve / du kien / nha may cam ket) o lib/ngay.tsx.
 */
export const TN = {
  // ---- so luong cua 1 dong linh kien
  SL_DAT: { l: "SL đặt", la: "Số lượng linh kiện cần mua của dòng này — con số được duyệt trên EO.", de: "Mọi tiến độ (đã về, còn thiếu, kế hoạch) đều so với số này. Sửa sau ban hành phải ghi lý do." },
  SL_VE: { l: "Đã về (AMIS)", la: "Tổng số lượng đã nhập kho theo phiếu nhập AMIS khớp dòng này.", de: "Tự động từ AMIS — không nhập tay. Về đủ SL đặt thì dòng kết thúc, hết cảnh báo." },
  SL_THIEU: { l: "Còn thiếu", la: "SL đặt − Đã về (AMIS).", de: "Số còn phải theo dõi, đòi nhà máy giao." },
  SL_KH: { l: "Đã lên kế hoạch", la: "Tổng SL của các đợt hàng về đã nhập (kế hoạch theo ngày + theo tuần).", de: "Cho biết nhà máy sẽ giao bao nhiêu, khi nào. Không được lớn hơn SL đặt." },
  SL_CHUA_KH: { l: "Chưa lên kế hoạch", la: "SL đặt − Đã lên kế hoạch.", de: "Phần chưa biết khi nào về → cần hỏi nhà máy rồi nhập thêm đợt." },
  DON_GIA: { l: "Đơn giá dự kiến", la: "Giá mua ước tính cho 1 linh kiện.", de: "Tính thành tiền dự kiến của EO để người duyệt cân nhắc. Không bắt buộc." },
  // ---- thong tin dong
  KHO: { l: "Kho cần đặt", la: "Kho sẽ nhận hàng.", de: "Hệ thống khớp phiếu nhập AMIS theo Kho + Mã LK + mã 3TDO — chọn sai kho thì hàng về không được tính." },
  DOI_TAC: { l: "Đối tác", la: "Nhà máy / nhà cung cấp giao hàng (vd KRF).", de: "Dùng để gom dòng khi push đối tác và lọc theo dõi." },
  LY_DO_PS: { l: "Lý do PS", la: "Lý do phát sinh nhu cầu (vd bảo hành, bổ sung tồn, dự án…).", de: "Người duyệt hiểu vì sao cần mua; dùng phân loại báo cáo." },
  GHI_CHU: { l: "Ghi chú", la: "Thông tin thêm cho dòng (yêu cầu giao, quy cách…).", de: "Hiện cho người duyệt, kho và người theo dõi." },
  ID_CRM: { l: "ID CRM", la: "Mã ca bảo hành trên CRM (nếu linh kiện đặt cho 1 ca cụ thể).", de: "App DVBH gắn PO vào đúng ca để CSKH tra được hàng đã đặt / đã về. Không bắt buộc." },
  ID_DAT_HANG: { l: "ID đặt hàng", la: "Mã phiếu đặt linh kiện bên app DVBH (TLK-…).", de: "Nối dòng EO với phiếu đặt hàng gốc. Không bắt buộc." },
  // ---- thong tin EO
  LOAI_HINH: { l: "Loại hình", la: "Nhóm đơn mua theo danh mục (PO.D101…).", de: "Phân loại EO trong báo cáo và mã phê duyệt." },
  PHONG_BAN: { l: "Phòng ban", la: "Bộ phận đề nghị mua.", de: "Kho vận MB / MN tự chọn sẵn kho nhận." },
  NOI_DUNG: { l: "Nội dung / lý do trình", la: "Mô tả ngắn vì sao trình EO này.", de: "Người thẩm định / duyệt đọc để quyết định." },
} as const;
export type KhoaTN = keyof typeof TN;

/** Nhan co dau "?" - re chuot hien "La gi / De lam gi". */
export function Hoi({ k, req, nhan }: { k: KhoaTN; req?: boolean; nhan?: string }) {
  const t = TN[k];
  return (
    <span title={`${t.l}: ${t.la}\nĐể làm gì: ${t.de}`} style={{ cursor: "help", whiteSpace: "nowrap" }}>
      {nhan ?? t.l}{req && <span className="req"> *</span>}
      <span aria-hidden style={{ display: "inline-grid", placeItems: "center", width: 14, height: 14, borderRadius: 9, border: "1px solid currentColor", fontSize: 9.5, fontWeight: 800, marginLeft: 4, opacity: 0.55, verticalAlign: 1 }}>?</span>
    </span>
  );
}

/** Nut "?" o thanh tren cung -> bang giai thich toan bo so lieu + cach nhap ke hoach. */
export function NutGiaiThich() {
  const [mo, setMo] = useState(false);
  return (
    <>
      <button className="btn ghost sm" title="Giải thích số liệu & cách nhập" onClick={() => setMo(true)} style={{ fontWeight: 800 }}>?</button>
      {mo && <BangGiaiThich onClose={() => setMo(false)} />}
    </>
  );
}

export function BangGiaiThich({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: ReactNode }) => <div style={{ fontWeight: 800, fontSize: 14, margin: "16px 0 6px" }}>{children}</div>;
  const Dong = ({ k }: { k: KhoaTN }) => (
    <tr><td style={{ fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "top" }}>{TN[k].l}</td><td>{TN[k].la}</td><td className="muted">{TN[k].de}</td></tr>
  );
  return (
    <Modal title="Giải thích số liệu & cách nhập" onClose={onClose} width={980}>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        <H>1. Số lượng của 1 dòng linh kiện</H>
        <div className="muted" style={{ marginBottom: 6 }}>Ví dụ: đặt <b>100</b> · AMIS đã về <b>30</b> · đã lên kế hoạch 2 đợt (60 + 40 = <b>100</b>) → còn thiếu <b>70</b>, chưa lên kế hoạch <b>0</b>.</div>
        <table className="tbl tbl-dense"><thead><tr><th>Số</th><th>Là gì</th><th>Để làm gì</th></tr></thead>
          <tbody>{(["SL_DAT", "SL_VE", "SL_THIEU", "SL_KH", "SL_CHUA_KH", "DON_GIA"] as KhoaTN[]).map((k) => <Dong key={k} k={k} />)}</tbody></table>
        <div style={{ marginTop: 6, background: "#FFFBEB", borderRadius: 8, padding: "8px 10px" }}>
          <b>Vì sao giảm SL đặt có khi bị chặn?</b> Tổng kế hoạch không được lớn hơn SL đặt (không thể hẹn giao nhiều hơn số đã đặt).
          Khi giảm SL đặt xuống dưới tổng kế hoạch, hộp "Sửa SL đặt" cho chọn <b>tự giảm kế hoạch từ đợt xa nhất</b> — làm 1 bước.
        </div>

        <H>2. Ba loại ngày</H>
        <table className="tbl tbl-dense"><tbody>
          {(Object.keys(NGAY) as (keyof typeof NGAY)[]).map((k) => <tr key={k}><td style={{ fontWeight: 700, color: NGAY[k].mau, whiteSpace: "nowrap" }}>{NGAY[k].l}</td><td>{NGAY[k].mo_ta}</td></tr>)}
        </tbody></table>

        <H>3. Kế hoạch hàng về — nhập ở đâu, khi nào, thế nào</H>
        <table className="tbl tbl-dense"><thead><tr><th></th><th>Theo ngày (mặc định)</th><th>Theo tuần</th></tr></thead><tbody>
          <tr><td><b>Khi nào dùng</b></td><td>Nhà máy báo ngày giao cụ thể cho từng đợt.</td><td>Đơn kế hoạch tháng (vd KRF): nhà máy chỉ báo mỗi tuần giao bao nhiêu.</td></tr>
          <tr><td><b>Vì sao phải nhập</b></td><td colSpan={2}>Sau khi EO ban hành, mỗi dòng phải có ngày dự kiến trong 24 giờ làm việc (quy tắc theo dõi); quá ngày dự kiến mà hàng chưa về đủ phải nhập ngày mới. Không nhập → hệ thống ghi lỗi, phải giải trình, lặp lại thì lên Cảnh báo CEO. Kho & CSKH nhìn kế hoạch để biết khi nào có hàng.</td></tr>
          <tr><td><b>Nhập ở đâu</b></td><td>Nút lịch 📅 trên từng dòng (Theo dõi linh kiện / popup EO / tab Kế hoạch) · nhiều dòng: "Lập kế hoạch hàng loạt" · nhiều EO: menu Kế hoạch hàng về → Tải mẫu → Import Excel.</td><td>Menu <b>Kế hoạch tuần (KRF)</b> → chọn EO → điền SL vào cột từng tuần → Lưu. Hoặc tab Kế hoạch của EO → "Nhập theo tuần".</td></tr>
          <tr><td><b>Nhập thế nào</b></td><td>Mỗi đợt: ngày nhà máy cam kết (ngày dự kiến tự lấy theo) + số lượng + nguồn.</td><td>Mỗi ô = SL dự kiến về trong tuần đó. Hệ thống coi <b>Thứ Bảy</b> cuối tuần là ngày dự kiến của ô đó. Lưu lại sẽ thay kế hoạch tuần cũ của dòng.</td></tr>
          <tr><td><b>Lưu ý</b></td><td colSpan={2}>Tổng (theo ngày + theo tuần) ≤ SL đặt. Một dòng nên dùng 1 cách; dùng cả 2 thì cả 2 cùng cộng vào tổng.</td></tr>
        </tbody></table>

        <H>4. Thông tin khi tạo EO / dòng linh kiện</H>
        <table className="tbl tbl-dense"><thead><tr><th>Ô nhập</th><th>Là gì</th><th>Để làm gì</th></tr></thead>
          <tbody>{(["LOAI_HINH", "PHONG_BAN", "NOI_DUNG", "KHO", "DOI_TAC", "LY_DO_PS", "GHI_CHU", "ID_CRM", "ID_DAT_HANG"] as KhoaTN[]).map((k) => <Dong key={k} k={k} />)}</tbody></table>
      </div>
    </Modal>
  );
}
