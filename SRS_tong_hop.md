# SRS tổng hợp — App EO Mua hàng

> Đặc tả yêu cầu **đã chốt** (theo code + `CLAUDE.md` tới 18/11/2026). Logic chi tiết: `TONG_HOP_LOGIC.md`; quyền:
> `../PERMISSION_SPEC.md`; quy tắc theo dõi: `../THEO_DOI_LINH_KIEN_DAT.md`.

## 1. Mục tiêu

Thay Google Sheet đặt hàng bằng app: mỗi đơn mua linh kiện đi qua luồng duyệt có kiểm soát, có mã phê duyệt, có kế hoạch hàng về,
đối chiếu tự động với phiếu nhập AMIS, và tự phát hiện vi phạm (thiếu ngày dự kiến, không cập nhật NCC, trễ hàng) để giải trình.

## 2. Người dùng

Admin, KH cung ứng (người đặt hàng), Kế toán, Kho, Theo dõi tiến độ, Chỉ xem (chi tiết `TONG_HOP_LOGIC.md` §2). Đăng nhập Google.
Ai cũng xem được mọi dữ liệu; quyền chỉ áp lên thao tác.

## 3. Màn hình (menu: Tổng quan · Điều hành · Đơn PO · LK đặt · Vi phạm · Nhập AMIS · Cài đặt)

| Màn | Yêu cầu chính |
|---|---|
| Tổng quan | Bảng điều khiển quản lý (tỷ lệ đáp ứng tuần / tháng, tồn đọng theo 8 mốc), "Việc cần xử lý" theo vai trò, tra nhanh mã LK |
| Điều hành (`/dieu-hanh`) | Cho lãnh đạo: nhìn 3–5 giây biết tồn ở đâu, ai giữ, đã làm gì, vì sao còn tồn. Kết luận nhanh (câu tự sinh, bấm được) · ô sức khoẻ (đỏ / vàng / quá DK / chưa DK / im lặng / không thúc NCC / lỗi chờ GT / cấp CEO / duyệt treo) · luồng giai đoạn ngang G1→G8 · tab Điểm nóng, Theo người (độ quyết liệt 7 ngày, tỷ lệ giải trình, nút Nhắc), Theo NCC, Nguyên nhân & xu hướng (độ phủ giải trình), Duyệt đang treo. Lọc phạm vi người / NCC / kho. Chi tiết `../QUAN_TRI_DIEU_HANH.md` |
| Đơn PO (`/eo`) | Danh sách EO có chip số đếm (mặc định "Còn tồn"; thêm "PO có dòng ĐỎ", "PO im lặng ≥ 7 ngày", "PO có lỗi chờ GT"); cột Trạng thái · Cảnh báo · Tồn · % về · Lỗi chờ GT · Thúc NCC · Hoạt động cuối đặt sát mã PO; lọc cột kiểu Excel, duyệt / từ chối / yêu cầu cập nhật ngay trên dòng; chi tiết EO là popup |
| LK đặt (`/don-hang`) | Mỗi dòng = 1 dòng linh kiện; mặc định nhóm "Còn chờ hàng"; xem theo dòng / theo PO / theo mã LK; nhóm nhanh (Cần xử lý, Trễ 24h, Quá DK, Lỗi chờ giải trình, Cấp CEO…); nhập ngày NM / dự kiến, giải trình chung, push đối tác, ngày KRF từ mail, kế hoạch hàng về Excel, kế hoạch tuần KRF; tab Báo cáo |
| Vi phạm | Lỗi theo mức độ CEO / CAO / TB / THẤP, "Của tôi / Toàn bộ", xem theo lỗi / PO / người; giải trình (từng lỗi, cả PO, nhiều lỗi cùng loại), nhắc nhở |
| Nhập AMIS | Import phiếu nhập (thêm / đồng bộ lại kỳ có xem trước), hủy / khôi phục dòng, tab chứng từ chưa khớp EO |
| Cài đặt | Danh mục (đối tác, lý do phát sinh…), người dùng & vai trò, cấu hình hạn giai đoạn, đồng bộ PO sang DVBH, ETX nhân sự |

- **Popup xem nhanh 95% màn hình**: EO, đơn hàng (1 dòng LK), mã linh kiện — mở chồng nhau, Esc đóng popup trên cùng; có đường
  tiến trình 8 giai đoạn (ngang, thu gọn được); thao tác trong popup dùng chung code với trang.
- Đường dẫn cũ (`/theo-doi`, `/so-don-hang`, `/approvals`, `/reports/*`…) tự chuyển sang màn mới, giữ bộ lọc.

## 4. Quy tắc nhập liệu

- Ngày hàng về thực tế KHÔNG nhập tay (chỉ từ AMIS); import Excel kế hoạch chặn cả file nếu có cột mang nghĩa thực tế.
- Tổng SL kế hoạch ≤ SL đặt; giảm SL đặt thì tự cắt đợt xa nhất (có log).
- Hủy dòng, kết thúc sớm, hủy dữ liệu AMIS, từ chối dòng thêm sau ban hành: bắt buộc lý do. Giải trình R1/R4: bắt buộc ảnh.
- Đính kèm: Excel / ảnh / PDF / Word ≤ 20MB; xoá là xoá mềm.

## 5. Yêu cầu chung / phi chức năng

- Bảng kiểu Excel (lọc + sắp xếp trên tiêu đề, nhãn "đang lọc n cột · x / y dòng"), thanh thao tác 1 dòng, bộ lọc ít dùng giấu sau "Bộ lọc khác".
- Mọi nhãn số lượng có giải thích (nút "?" và tooltip thuật ngữ chung).
- Chống bấm đúp / duyệt đồng thời ở luồng duyệt (không cấp 2 mã 3TDO).
- Mọi thời gian theo giờ Việt Nam; giờ làm việc bỏ Chủ nhật.
- Số trên Tổng quan phải khớp danh sách khi bấm vào.
- Thông tin quản trị đọc được trong 3–5 giây: mọi màu cảnh báo có lý do bằng chữ; mọi tỷ lệ nguyên nhân hiện kèm độ phủ giải trình.
