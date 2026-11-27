# SRS tổng hợp — App EO Mua hàng

> Đặc tả yêu cầu **đã chốt** (theo code + `CLAUDE.md` tới 18/11/2026). Logic chi tiết: `TONG_HOP_LOGIC.md`; quyền:
> `../PERMISSION_SPEC.md`; quy tắc theo dõi: `../THEO_DOI_LINH_KIEN_DAT.md`.

## 1. Mục tiêu

Thay Google Sheet đặt hàng bằng app: mỗi đơn mua linh kiện đi qua luồng duyệt có kiểm soát, có mã phê duyệt, có kế hoạch hàng về,
đối chiếu tự động với phiếu nhập AMIS, và tự phát hiện vi phạm (thiếu ngày dự kiến, không cập nhật NCC, trễ hàng) để giải trình.

## 2. Người dùng

Admin, KH cung ứng (người đặt hàng), Kế toán, Kho, Theo dõi tiến độ, Chỉ xem (chi tiết `TONG_HOP_LOGIC.md` §2). Đăng nhập Google.
Ai cũng xem được mọi dữ liệu; quyền chỉ áp lên thao tác.

## 3. Màn hình (menu v0.129: Việc của tôi · Tổng quan › [Tổng quan · Điều hành · Báo cáo đặt LK] · Đơn PO › [Theo PO · Theo LK · PO chờ tôi · PO tồn CEO · PO cảnh báo · Lỗi đối tác · Lỗi nội bộ] · Vi phạm & GT › [Cần giải trình · Vi phạm · Đã xử lý · Lỗi đối tác · Lỗi nội bộ · Tổng hợp theo mã lỗi · Bảng mã lỗi] · Nhập AMIS · Cài đặt)

- **Menu 3 cấp** (v0.129): menu gốc xổ / thu; menu phụ cấp 1 = nhóm / cách xem; cấp 2 = giai đoạn PO (G1…G8, Đủ hàng, Từ chối, Hủy — chỉ giai đoạn có PO),
  giai đoạn LK, mã CEO, tab Điều hành, bước / loại lỗi vi phạm. Bấm menu phụ hoặc cấp 2 → danh sách tự lọc theo lựa chọn đó; bấm lại cấp 2 đang chọn = bỏ lọc.
  Menu phụ Đơn PO có số PO cạnh tên (đỏ = việc cần làm).
- **Nguyên tắc màn danh sách**: bảng là phần chính; trên bảng chỉ 1 thanh thao tác gọn; lọc chi tiết nằm trên tiêu đề cột (kiểu Excel).


| Màn | Yêu cầu chính |
|---|---|
| Tổng quan (`/`) | Việc cần xử lý của bạn, Bảng điều khiển quản lý, xu hướng EO (v0.133: Điều hành là menu phụ riêng). Bảng điều khiển quản lý (tỷ lệ đáp ứng tuần / tháng, tồn đọng theo 8 mốc), "Việc cần xử lý" theo vai trò, tra nhanh mã LK |
| Điều hành (`/dieu-hanh`, cấp 2 = Kết luận & sức khoẻ + 7 bảng; v0.134 chọn bảng thì chỉ hiện thanh Phạm vi + bảng) | Cho lãnh đạo: nhìn 3–5 giây biết tồn ở đâu, ai giữ, đã làm gì, vì sao còn tồn. Kết luận nhanh (câu tự sinh, bấm được) · ô sức khoẻ (đỏ / vàng / quá DK / chưa DK / im lặng / không thúc NCC / lỗi chờ GT / cấp CEO / duyệt treo) · luồng giai đoạn ngang G1→G8 · tab Điểm nóng, Theo PO (mỗi PO 1 dòng: mức nặng nhất, số dòng đỏ / quá DK / cấp CEO / lỗi chờ GT, tồn, không thúc NCC, hoạt động cuối; bấm = popup PO, bấm số = Điểm nóng của PO đó), Theo người (độ quyết liệt 7 ngày, tỷ lệ giải trình, nút Nhắc), Theo NCC, Nguyên nhân & xu hướng (độ phủ giải trình; khối **Trách nhiệm chậm trễ theo bên**: nội bộ — lên PO / duyệt / gửi mail / nhập kho, nhà cung cấp — từ khi gửi mail đến khi hàng về, và không giải trình đúng hạn tính riêng — v0.121), Duyệt đang treo. Lọc phạm vi người / NCC / kho. Chi tiết `../QUAN_TRI_DIEU_HANH.md` |
| Bảng trách nhiệm (Tổng quan cho lãnh đạo + tab mặc định Điều hành, v0.122) | Hàng: Lỗi nhà cung cấp (từng NCC) / Lỗi nội bộ (từng khâu: lập, thẩm định, duyệt, chưa gửi đơn NCC) / PO chờ duyệt / Tổng. Cột: PO, đơn đặt, SL tồn, %, tồn > 7 / 14 / 21 / 30 ngày, tồn lâu nhất, quá / chưa có ngày DK, không thúc NCC 7 ngày, cấp CEO, ca lỗi NCC / nội bộ, % đã giải trình, chưa / không giải trình, ai giữ nhiều nhất. Bấm số → danh sách chi tiết; Excel |
| PO tồn CEO (`/ca-ceo`, tên cũ Ca tồn CEO) | Menu Đơn PO › PO tồn CEO, cấp 2 = mã 201 / 202 / 203. v0.131: bảng là chính — 1 thanh (Đang theo dõi / Đã xong · mã CEO · Rất hot / Giảm hot / Không thúc NCC · tìm · Excel): dòng đang mở cấp CEO, mã ER.MH-201/202/203 + diễn giải, tồn, ngày DK (lùi), lỗi chờ, thúc NCC, NCC trả lời, giải trình, im lặng; ô lọc theo mã; Excel |
| Việc của tôi (`/viec-cua-toi`) | Menu đầu tiên. Nhân viên nhìn 1 lần biết phải làm gì: 4 mục (nhập ngày dự kiến · push NCC thứ 2/4 · quá ngày DK nhập ngày mới · giải trình lỗi), mỗi dòng có hạn "Còn / Trễ … giờ làm việc" cột Hạn · PO · Linh kiện · Kho · Nhà cung cấp · Ngày dự kiến · SL đặt · Còn thiếu (v0.106 thêm Kho; v0.107 thêm Ngày dự kiến, SL đặt + nút Xuất Excel từng mục) và 1 nút làm ngay (mở form nhập ngày, soạn mail Gmail có sẵn CC + mã, ghi nhận gọi/Zalo, giải trình). Quản lý xem "Toàn bộ". |
| Đơn PO (`/eo`) | Cột "Lỗi đối tác / nội bộ" (v0.129): số lỗi mỗi bên + số chưa xử lý, lọc / sắp xếp; nhóm "Lỗi đối tác / Lỗi nội bộ (chưa xử lý)". Cột "Vi phạm": trạng thái vi phạm của PO (Cấp CEO / Chờ giải trình / Đã xử lý / Không vi phạm) + số vi phạm, lọc + sắp xếp; chip "PO cấp CEO". Danh sách EO có chip số đếm (mặc định "Còn tồn"; thêm "PO có dòng ĐỎ", "PO im lặng ≥ 7 ngày", "PO có lỗi chờ GT"); cột Tiến trình (luồng ngang các giai đoạn, thay nhãn trạng thái) · Cảnh báo · Tồn · % về · Lỗi chờ GT · Thúc NCC · Hoạt động cuối đặt sát mã PO; lọc cột kiểu Excel, duyệt / từ chối / yêu cầu cập nhật ngay trên dòng; chi tiết EO là popup. Nút **📤 App Nhiệm vụ (n)** (v0.116): xem số PO đang chờ duyệt / số người, lần gửi cuối, bấm "Đẩy ngay" đưa toàn bộ việc chờ duyệt lên App Nhiệm vụ eOffice — mỗi người duyệt thấy PO chờ mình kèm link mở đúng PO; hệ thống cũng tự gửi khi PO đổi và mỗi giờ |
| Đơn PO › Theo LK (`/don-hang`, tên cũ LK đặt) | Mỗi dòng = 1 dòng linh kiện; mặc định nhóm "Còn chờ hàng"; xem theo dòng / theo PO / theo mã LK; nhóm nhanh (Cần xử lý, Trễ hạn chưa có ngày DK, Quá DK, Lỗi chờ giải trình, Cấp CEO, Thiếu ngày NM cam kết, Thiếu ngày dự kiến, Chưa về hàng nào, Về thiếu…); nhập ngày NM / dự kiến, giải trình chung, push đối tác (nút "Tạo mail nhắc" tạm tắt từ v0.088 — người dùng tự gửi mail, CC hộp theo dõi), ngày KRF từ mail, kế hoạch hàng về Excel, kế hoạch tuần KRF; tab Báo cáo |
| Vi phạm | v0.129: bảng là chính — 1 thanh (Của tôi / Toàn bộ · nhóm trạng thái + cảnh báo có số · cách xem · tìm · Excel · chú giải), lọc mã lỗi / mức độ / bên chịu / người / kho / đối tác / ngày trên tiêu đề cột; cột Bên chịu. Lỗi theo mức độ CEO / CAO / TB / THẤP, "Của tôi / Toàn bộ", xem theo lỗi / PO / người; giải trình (từng lỗi, cả PO, nhiều lỗi cùng loại), nhắc nhở. Mở app còn lỗi chờ mình giải trình → popup nhắc (v0.105); thông báo đẩy khi có lỗi mới / còn ≤ 6 giờ làm việc là hết hạn giải trình (thiết bị phải bật đẩy) |
| Nhập AMIS | Import phiếu nhập (thêm / đồng bộ lại kỳ có xem trước), hủy / khôi phục dòng, tab chứng từ chưa khớp EO |
| Cài đặt | Danh mục (đối tác, lý do phát sinh…), người dùng & vai trò, cấu hình hạn giai đoạn, đồng bộ PO sang DVBH, ETX nhân sự |

- **Popup xem nhanh 95% màn hình** (mọi lớp, v0.131): EO, đơn hàng (1 dòng LK), mã linh kiện — mở chồng nhau, Esc đóng popup trên cùng; thao tác trong popup dùng chung
  code với trang. Bố cục 2 khu: **Theo dõi chính** (trái: luồng tiến trình 8 giai đoạn 1 dòng + tab + bảng) và **Tiến độ · lịch sử** (phải: số liệu, cảnh báo, chờ duyệt,
  nhật ký — thu gọn được). Không có tab lặp lại nội dung nhật ký (PO: Linh kiện · Kế hoạch & hàng về · Lỗi & giải trình · Tài liệu; đơn hàng: Chi tiết giai đoạn ·
  Kế hoạch & hàng về · Lỗi & giải trình).
- **ID case / ID đặt hàng luôn nhìn thấy** (v0.108): mở 1 đơn phải biết đơn đặt cho ca / đơn nào — popup EO có 2 cột riêng "ID case", "ID đặt hàng"
  (không cắt chữ, lọc được, tách khỏi Ghi chú); popup đơn hàng ghi "ID case … · ID đặt hàng …" ngay đầu dòng thông tin; popup mã LK có cột "ID case · ID đặt hàng".
- **Trả kết quả cho app linh kiện** (v0.108): app linh kiện hỏi theo mã đơn / ticket / case → thấy PO nào, đã về bao nhiêu, ngày dự kiến (API đọc `theo-id`).
- Đường dẫn cũ (`/theo-doi`, `/so-don-hang`, `/approvals`, `/reports/*`…) tự chuyển sang màn mới, giữ bộ lọc.

## 4. Quy tắc nhập liệu

- Ngày hàng về thực tế KHÔNG nhập tay (chỉ từ AMIS); import Excel kế hoạch chặn cả file nếu có cột mang nghĩa thực tế.
- Tổng SL kế hoạch ≤ SL đặt; giảm SL đặt thì tự cắt đợt xa nhất (có log).
- Hủy dòng, kết thúc sớm, hủy dữ liệu AMIS, từ chối dòng thêm sau ban hành: bắt buộc lý do. Người duyệt chậm (thẩm định / duyệt mua / dòng sau BH quá 8 giờ làm việc) bị ghi lỗi R5 và tự giải trình (v0.125). Giải trình: bắt buộc chọn **Do ai** (gợi ý theo giai đoạn — chờ ngày DK / quá ngày DK = nhà cung cấp, không thúc NCC = nội bộ) + lỗi gì + nội dung; ảnh / thư bằng chứng tuỳ chọn (v0.121).
- Đính kèm: Excel / ảnh / PDF / Word ≤ 20MB; xoá là xoá mềm.

## 5. Yêu cầu chung / phi chức năng

- Mọi bộ lọc theo danh sách giá trị cho tick chọn nhiều (checkbox, tìm không dấu, chọn tất cả / bỏ chọn); nhiều giá trị cùng bộ lọc = HOẶC,
  nhóm nhanh chọn nhiều = hợp các nhóm. Ô chế độ / bộ lọc 2 giá trị đối lập giữ chọn 1.
- Bảng kiểu Excel (lọc + sắp xếp trên tiêu đề, nhãn "đang lọc n cột · x / y dòng"; cột ngày / số có thêm "Chưa có ngày (ô trống) / Đã có ngày"), thanh thao tác 1 dòng, bộ lọc ít dùng giấu sau "Bộ lọc khác".
- Bảng có phân trang: ô chọn **số dòng / trang** (4 · 8 · 16 · 32 · 64 · 128, cạnh nút chuyển trang; v0.117). LK đặt mặc định 8 dòng, nhớ lựa chọn trên máy,
  thanh cuộn ngang hiện cả ở TRÊN đầu bảng (không phải cuộn xuống cuối mới kéo ngang được). Xem theo nhóm: nhóm không bị cắt giữa 2 trang.
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
- Lỗi phân biệt rõ **Cần giải trình** (còn hạn **16 giờ làm việc**, hiện hạn + số giờ còn lại) với **Vi phạm** (hết hạn không giải trình); mỗi lỗi có "Vì sao có lỗi" + "Kết luận".
  Chỉ vi phạm mới được đếm là vi phạm (màn Vi phạm, Đơn PO, Điều hành); giải trình / khắc phục trong hạn không tính vi phạm.
  Cảnh báo cấp CEO tự tính theo số liệu, không có hạn giải trình. Lịch sử theo dõi của đơn hàng: mỗi mục 1 dòng (thông tin chính), bấm để mở chi tiết, nút "Xem chi tiết" mở tất cả,
  dòng thời gian Hoạt động lọc theo loại (chọn nhiều), 8 nhóm mới nhất + "Xem thêm"; các mục giống nhau liền nhau (1 lần giải trình chung, 1 lần hệ thống tự đóng nhiều lỗi…)
  gộp 1 dòng "×n", bấm xem từng lần, có nút "Hiện từng mục".
- Cảnh báo cấp CEO ở popup PO = 1 dòng tóm tắt theo 3 tiêu chí (số dòng + mức nặng nhất: xa nhất bao nhiêu ngày, lùi nhiều nhất bao nhiêu lần, nhiều nhất bao nhiêu lỗi),
  không liệt kê lý do từng dòng; chi tiết từng dòng ở tab "Mã lỗi & giải trình".
- Vi phạm hệ thống chốt trước thời điểm đào tạo 20/11/2026 không tính ("Bỏ qua · lỗi cũ", v0.128).
- Lỗi có mốc trước 01/11/2026 không tính vi phạm ("Bỏ qua · lỗi cũ") — nhưng đơn còn tồn vẫn tiếp tục theo dõi và nhắc giải trình (dòng quá ngày DK từ trước 01/11
  được ghi 1 lỗi mới từ 24/11/2026).
- "Chờ NCC báo ngày": ghi nhận NCC chưa có ngày + hẹn hỏi lại (≤ 7 ngày) → không bị ghi lỗi lặp tới ngày hẹn, dòng nằm ở mục riêng của Việc của tôi (nút "⏳ NCC chưa có ngày").
- Form giải trình: bắt buộc chọn "Ai chịu" (không mặc định); gợi ý "Đối tác / NCC" khi NCC trả lời không kèm ngày; thư với NCC đã lưu thay được ảnh bằng chứng.
- Việc của tôi, mục Giải trình: nhóm theo PO / mã linh kiện / từng dòng, tick nhiều dòng hoặc cả nhóm → giải trình chung 1 lần.
- Dùng thư với NCC thay ảnh bằng chứng: hệ thống kiểm tra mỗi dòng có thư / ghi nhận liên hệ đã lưu, thiếu thì báo phải thêm ảnh.
- Sau đăng nhập, mời bật thông báo đẩy trên thiết bị (hướng dẫn mở chặn nếu trình duyệt đang chặn).
- Popup PO và popup đơn hàng: 1 ô tìm CHUNG ở cuối thanh tab (không dấu, nút × xoá), dùng cho mọi tab tìm được (linh kiện, kế hoạch & hàng về, quy trình duyệt,
  tài liệu, mail & push, mã lỗi & giải trình, chi tiết giai đoạn, trao đổi NCC); giữ chữ khi đổi tab; bảng trong tab không còn ô tìm riêng.
- Bảng linh kiện trong popup PO cuộn trong khung: tiêu đề cột luôn ở trên, thanh kéo dọc + ngang luôn thấy, thêm thanh kéo ngang ở trên đầu bảng.
- Mọi lỗi / cảnh báo hiển thị mã ER.MH và bước; mỗi đơn hàng / PO có tab "Mã lỗi & giải trình"; Vi phạm có cách xem "Theo mã lỗi" → chi tiết.
- Popup đơn hàng có tab "Trao đổi NCC" (đường ngang 3T thúc / NCC trả lời / cập nhật ngày DK). Trạng thái luôn ghi kèm bước.
- API đọc có khoá cho hệ khác: ca tồn CEO, tổng hợp lỗi theo mã, chi tiết lỗi + giải trình, bảng mã.
- Thông tin quản trị đọc được trong 3–5 giây: mọi màu cảnh báo có lý do bằng chữ; mọi tỷ lệ nguyên nhân hiện kèm độ phủ giải trình.
