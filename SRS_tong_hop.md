# SRS tổng hợp — App EO Mua hàng

> Đặc tả yêu cầu **đã chốt** (theo code + `CLAUDE.md` tới 18/11/2026). Logic chi tiết: `TONG_HOP_LOGIC.md`; quyền:
> `../PERMISSION_SPEC.md`; quy tắc theo dõi: `../THEO_DOI_LINH_KIEN_DAT.md`.

## 1. Mục tiêu

Thay Google Sheet đặt hàng bằng app: mỗi đơn mua linh kiện đi qua luồng duyệt có kiểm soát, có mã phê duyệt, có kế hoạch hàng về,
đối chiếu tự động với phiếu nhập AMIS, và tự phát hiện vi phạm (thiếu ngày dự kiến, không cập nhật NCC, trễ hàng) để giải trình.

## 2. Người dùng

Admin, KH cung ứng (người đặt hàng), Kế toán, Kho, Theo dõi tiến độ, Chỉ xem (chi tiết `TONG_HOP_LOGIC.md` §2). Đăng nhập Google.
Ai cũng xem được mọi dữ liệu; quyền chỉ áp lên thao tác.

## 3. Màn hình (menu: Tổng quan · Điều hành · Ca tồn CEO · Đơn PO · LK đặt · Vi phạm · Nhập AMIS · Cài đặt)

| Màn | Yêu cầu chính |
|---|---|
| Tổng quan | Bảng điều khiển quản lý (tỷ lệ đáp ứng tuần / tháng, tồn đọng theo 8 mốc), "Việc cần xử lý" theo vai trò, tra nhanh mã LK |
| Điều hành (`/dieu-hanh`) | Cho lãnh đạo: nhìn 3–5 giây biết tồn ở đâu, ai giữ, đã làm gì, vì sao còn tồn. Kết luận nhanh (câu tự sinh, bấm được) · ô sức khoẻ (đỏ / vàng / quá DK / chưa DK / im lặng / không thúc NCC / lỗi chờ GT / cấp CEO / duyệt treo) · luồng giai đoạn ngang G1→G8 · tab Điểm nóng, Theo người (độ quyết liệt 7 ngày, tỷ lệ giải trình, nút Nhắc), Theo NCC, Nguyên nhân & xu hướng (độ phủ giải trình), Duyệt đang treo. Lọc phạm vi người / NCC / kho. Chi tiết `../QUAN_TRI_DIEU_HANH.md` |
| Ca tồn CEO (`/ca-ceo`) | Menu riêng: dòng đang mở cấp CEO, mã ER.MH-201/202/203 + diễn giải, tồn, ngày DK (lùi), lỗi chờ, thúc NCC, NCC trả lời, giải trình, im lặng; ô lọc theo mã; Excel |
| Việc của tôi (`/viec-cua-toi`) | Menu đầu tiên. Nhân viên nhìn 1 lần biết phải làm gì: 4 mục (nhập ngày dự kiến · push NCC thứ 2/4 · quá ngày DK nhập ngày mới · giải trình lỗi), mỗi dòng có hạn "Còn / Trễ … giờ làm việc" và 1 nút làm ngay (mở form nhập ngày, soạn mail Gmail có sẵn CC + mã, ghi nhận gọi/Zalo, giải trình). Quản lý xem "Toàn bộ". |
| Đơn PO (`/eo`) | Cột "Vi phạm": trạng thái vi phạm của PO (Cấp CEO / Chờ giải trình / Đã xử lý / Không vi phạm) + số vi phạm, lọc + sắp xếp; chip "PO cấp CEO". Danh sách EO có chip số đếm (mặc định "Còn tồn"; thêm "PO có dòng ĐỎ", "PO im lặng ≥ 7 ngày", "PO có lỗi chờ GT"); cột Tiến trình (luồng ngang các giai đoạn, thay nhãn trạng thái) · Cảnh báo · Tồn · % về · Lỗi chờ GT · Thúc NCC · Hoạt động cuối đặt sát mã PO; lọc cột kiểu Excel, duyệt / từ chối / yêu cầu cập nhật ngay trên dòng; chi tiết EO là popup |
| LK đặt (`/don-hang`) | Mỗi dòng = 1 dòng linh kiện; mặc định nhóm "Còn chờ hàng"; xem theo dòng / theo PO / theo mã LK; nhóm nhanh (Cần xử lý, Trễ hạn chưa có ngày DK, Quá DK, Lỗi chờ giải trình, Cấp CEO, Thiếu ngày NM cam kết, Thiếu ngày dự kiến, Chưa về hàng nào, Về thiếu…); nhập ngày NM / dự kiến, giải trình chung, push đối tác (nút "Tạo mail nhắc" tạm tắt từ v0.088 — người dùng tự gửi mail, CC hộp theo dõi), ngày KRF từ mail, kế hoạch hàng về Excel, kế hoạch tuần KRF; tab Báo cáo |
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

- Mọi bộ lọc theo danh sách giá trị cho tick chọn nhiều (checkbox, tìm không dấu, chọn tất cả / bỏ chọn); nhiều giá trị cùng bộ lọc = HOẶC,
  nhóm nhanh chọn nhiều = hợp các nhóm. Ô chế độ / bộ lọc 2 giá trị đối lập giữ chọn 1.
- Bảng kiểu Excel (lọc + sắp xếp trên tiêu đề, nhãn "đang lọc n cột · x / y dòng"; cột ngày / số có thêm "Chưa có ngày (ô trống) / Đã có ngày"), thanh thao tác 1 dòng, bộ lọc ít dùng giấu sau "Bộ lọc khác".
- Mọi nhãn số lượng có giải thích (nút "?" và tooltip thuật ngữ chung).
- Chống bấm đúp / duyệt đồng thời ở luồng duyệt (không cấp 2 mã 3TDO).
- Mọi thời gian theo giờ Việt Nam. Mọi SLA / hạn (R1, R4, giai đoạn, hạn giải trình, mức độ vi phạm) tính theo GIỜ LÀM VIỆC: T2–T6 8:00–12:00 + 13:00–17:00 (8h) · T7 8:00–12:00 (4h) · CN nghỉ;
  quy đổi 24h = 8h làm việc. Chỉ áp dụng từ 19/11/2026 — lỗi ghi trước giữ hạn cũ. Chỉ số hoạt động (im lặng, thúc NCC 7 ngày) vẫn theo ngày lịch.
- Số trên Tổng quan phải khớp danh sách khi bấm vào.
- Bộ lọc cá nhân lưu trên máy người dùng (Đơn PO: ★ Đã lưu, đặt 1 bộ làm mặc định khi mở).
- Hướng dẫn sử dụng HTML theo vai trò ở `/huong-dan/` (nút 📘 Hướng dẫn), có ảnh minh hoạ thao tác.
- Đơn PO có cột Đối tác (1 tên / "Nhiều đối tác") và nút Giải trình hàng loạt cho các PO đang lọc (tick vi phạm cùng loại → giải trình chung).
- R1 chưa có ngày dự kiến được ghi lại mỗi thứ 3 / thứ 6 tới khi có ngày dự kiến. Tên giai đoạn: G5 "Chờ ngày DK", G6 "Chờ giao hàng".
- Ca CEO chia 3 mức độ hot (rất hot / giảm hot / đã xong, gồm cả ca đã về đủ) có màu, số đếm, lọc; API đọc trả kèm mức.
- Ca CEO gộp theo PO + mã CEO (1 ca dù nhiều dòng), bảng nhóm theo ca (tiêu đề ca: mức, mã, PO, NCC, người đặt, số dòng, tồn, lỗi chờ, thúc NCC); ca đã xong ở tab riêng.
- Hiệu năng: mở lại app hiện ngay dữ liệu lần trước (cache trình duyệt), tự cập nhật nền; mã tải theo màn; có nút Tải lại dữ liệu thủ công.
- Số lỗi / vi phạm luôn đếm theo **vi phạm gộp** (cùng lỗi, cùng PO, cùng kỳ), kèm số dòng bị ảnh hưởng; giải trình 1 lần cho cả vi phạm.
- Bảng mã lỗi (`/ma-loi`): mỗi mã có tên, diễn giải lỗi gì, yêu cầu giải trình, khi nào tự giải trình, số lượng đang đếm.
- Lỗi đang chờ không cần giải trình nữa khi đã khắc phục sau đó hoặc quá hạn giải trình 56 giờ làm việc → hệ thống tự giải trình (vẫn tính vi phạm, tách khỏi "đã giải trình").
- Mọi lỗi / cảnh báo hiển thị mã ER.MH và bước; mỗi đơn hàng / PO có tab "Mã lỗi & giải trình"; Vi phạm có cách xem "Theo mã lỗi" → chi tiết.
- Popup đơn hàng có tab "Trao đổi NCC" (đường ngang 3T thúc / NCC trả lời / cập nhật ngày DK). Trạng thái luôn ghi kèm bước.
- API đọc có khoá cho hệ khác: ca tồn CEO, tổng hợp lỗi theo mã, chi tiết lỗi + giải trình, bảng mã.
- Thông tin quản trị đọc được trong 3–5 giây: mọi màu cảnh báo có lý do bằng chữ; mọi tỷ lệ nguyên nhân hiện kèm độ phủ giải trình.
