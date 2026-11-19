# Tổng hợp logic — App EO Mua hàng (`muahang`)

> Mô tả logic **đang chạy thật** (theo code + `CLAUDE.md` tới 18/11/2026). `CLAUDE.md` giữ chi tiết kỹ thuật (tên hàm, bảng,
> lý do từng quyết định); file này là bản tóm tắt nghiệp vụ. Logic đổi thì sửa đè đúng mục; lịch sử ở `nhat_ky_lam_viec.md`.
> Không ghi tài khoản, mật khẩu, khoá. Quyền chi tiết: `../PERMISSION_SPEC.md`; quy tắc theo dõi: `../THEO_DOI_LINH_KIEN_DAT.md`.

## 1. Hệ thống là gì

- Quản lý **đơn đặt mua linh kiện (EO / PO)** của 3T từ lúc lập tới khi hàng về đủ: lập EO → thẩm định → duyệt cuối → ban hành
  (cấp mã phê duyệt `3TDO-…`) → kế hoạch hàng về → đối chiếu phiếu nhập AMIS → báo cáo, theo dõi vi phạm.
- Worker `muahang` (Hono) + D1 `eo-mua-hang-db` + giao diện React; Google OAuth. Không cron, không R2 — việc nền chạy sau request
  (`waitUntil`). Đính kèm lưu Google Drive.

## 2. Vai trò & quyền (tóm tắt — đủ ở `../PERMISSION_SPEC.md`)

| Vai trò / cờ | Việc chính |
|---|---|
| Admin | Toàn quyền, hủy EO đã ban hành, cấu hình |
| KH cung ứng (`la_nv_dat_hang`) | Lập EO, sửa / thu hồi EO của mình, kế hoạch hàng về, giải trình |
| Kế toán (`la_ke_toan`) | Nhập / sửa dữ liệu AMIS (hủy dòng sai, đồng bộ lại kỳ) |
| Kho (`la_nv_kho`) | Theo dõi hàng về kho phụ trách |
| Theo dõi tiến độ (`la_theo_doi_td`) | Xem toàn bộ, nhắc nhở vi phạm |
| View (`la_view`) | Chỉ xem |

- **Xem không giới hạn**, quyền chỉ áp lên thao tác. Người thẩm định / người duyệt cuối gán theo từng EO.

## 3. Luồng duyệt EO

`DRAFT` → gửi trình → `IN_REVIEW` (các phiếu thẩm định REVIEW) → hết phiếu chờ → `WAITING_FINAL_APPROVAL` (phiếu FINAL) →
duyệt cuối → `ISSUED` (cấp mã `3TDO-NNNNNN`). Từ chối → về người lập.

- Mỗi thao tác "giữ chỗ" phiếu bằng 1 UPDATE có điều kiện → bấm đúp / 2 người duyệt cùng lúc không cấp 2 mã, không mở 2 phiếu FINAL.
- Sửa dòng chỉ khi EO `DRAFT` hoặc `ISSUED`; người lập thu hồi EO đang trình (`recall`) để sửa.
- Mã EO mới tiền tố `MH-` (mã `EO-` cũ giữ nguyên).
- Sau ban hành: thêm dòng (người duyệt cuối / Admin duyệt hoặc từ chối), hủy 1 dòng (bắt buộc lý do — dòng hủy không tính SL đã về),
  **kết thúc sớm** (0 < đã về < SL đặt → SL đặt = SL đã về, cắt kế hoạch), giảm SL đặt (tự cắt đợt kế hoạch xa nhất), thay mã tương đương
  (`part_code` = mã đang dùng, `part_code_goc` = mã duyệt gốc).

## 4. Kế hoạch hàng về & 3 loại ngày

- `item_plan`: `NGAY` (ngày về cụ thể) hoặc `TUAN` (đơn KH tháng KRF theo tuần). Tổng SL kế hoạch ≤ SL đặt. Import Excel tất cả-hoặc-không.
- **Ngày đặt hàng** của 1 dòng = ngày PO được duyệt mua (ban hành); dòng thêm sau ban hành = ngày dòng đó được duyệt. Có trong file Excel danh sách linh kiện (popup PO, LK đặt).
- 3 loại ngày của 1 dòng: **Ngày hàng về** (thực tế, chỉ từ phiếu AMIS — không có đường nhập tay), **Ngày dự kiến** (ước tính, dùng
  cho quy tắc vi phạm), **Ngày nhà máy cam kết** (NCC xác nhận; trống thì lấy theo ngày dự kiến).
- **Ngày KRF từ mail**: app Thư ký mua hàng đọc mail NCC theo mã 3TDO + mã LK, gửi sự kiện sang; dòng khớp chắc (đúng 1 dòng mang
  mã LK đó, chưa về đủ, 0/1 đợt) được tự điền ngày; còn lại vào danh sách gợi ý để người dùng áp dụng.

## 5. Đối chiếu AMIS

- Kế toán nhập file phiếu nhập kho AMIS; dòng khớp EO theo mã phê duyệt + mã LK (cả mã gốc lẫn mã thay thế).
- Chống trùng bằng khoá dòng (`khoa_trung`: số CT | kho | mã hàng | SL | ngày CT | mã phê duyệt) vì MISA không có ID dòng.
- Không xoá: dòng sai **đánh dấu hủy** (bắt buộc lý do); đồng bộ lại cả kỳ (dòng không còn trong file → hủy, có xem trước);
  import lại đúng chứng từ đã hủy → tự khôi phục.

## 6. Theo dõi linh kiện đặt & vi phạm

- Quy tắc: **R1** — dòng mới phải có ngày dự kiến trong 48 giờ làm việc; **R3** — thứ 2/4 phải có mail cập nhật với NCC; **R4** —
  quá ngày dự kiến chưa về; lùi ngày nhiều lần → **cấp CEO**. Giờ làm việc bỏ Chủ nhật.
- Lỗi ghi vào `tl_loi` (chạy nền tối đa 10 phút/lần, idempotent); hết vi phạm thì tự xoá lỗi R1. Lỗi R3 đang chờ tự xoá khi dòng có mail /
  gọi-Zalo ghi nhận trong kỳ của nó (kể cả mail đồng bộ muộn hoặc lỗi ghi trước khi R3 tính mail), có ghi nhật ký. Mail chỉ được tính khi đã
  đồng bộ qua hộp thư theo dõi (khớp dòng hoặc mã push); tạo đợt / tải Excel / bản nháp chưa tính.
- **Nút "Tạo mail nhắc" đang tạm tắt** (v0.088, cờ `BAT_TAO_MAIL_NHAC` ở `pages/theodoi/shared.tsx`): người mua tự soạn mail cho NCC, CC
  hộp theo dõi + ghi mã 3TDO / mã LK. API tạo đợt push và luồng đồng bộ mail giữ nguyên.
- Mức độ: CEO / CAO (lặp ≥ 3 hoặc chờ ≥ 7 ngày) / TB / THẤP. Giải trình: từng lỗi, cả PO, hoặc nhiều lỗi cùng loại 1 lần.
- Nhắc nhở: hệ thống tự nhắc khi ghi lỗi mới; quản lý nhắc tay.

## 7. 8 giai đoạn đơn hàng (chỉ đo)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & ban hành · G4 Gửi đơn NCC (song song) · G5 Chờ ngày DK · G6 Chờ giao hàng ·
G7 Nhập kho & lên hệ thống · G8 Giao bù đến đủ. Hạn tính theo giờ làm việc (cấu hình được). Hiện chỉ báo cáo đúng / trễ hạn, chưa sinh lỗi.
- **Giai đoạn hiện tại = bước MỚI NHẤT đã bắt đầu mà chưa kết thúc** (theo thứ tự G1 → G2 → G3 → G5 → G6 → G8; không bước nào mở → bước mới nhất
  đã bắt đầu). PO đã qua nháp thì G1 luôn đóng: mốc = lần gửi trình đầu sau khi tạo dòng, không có thì lần trình đầu của PO, không có trình nào
  (PO chuyển từ hệ cũ) thì ngày ban hành.

## 8. Báo cáo & tổng quan

- 4 báo cáo (tiến độ 0.1 là nguồn chung), báo cáo giai đoạn. Tổng quan: tỷ lệ đáp ứng tuần / tháng = Σmin(về, đặt) / Σđặt,
  tồn đọng theo 8 mốc tồn — cùng mốc bỏ qua với theo dõi nên số khớp màn Quản lý đơn hàng.
- "Việc cần xử lý" + số đỏ menu theo vai trò (`/api/viec-can-lam`).

## 8b. Điều hành cho lãnh đạo (v0.084, `../QUAN_TRI_DIEU_HANH.md`)

- Mỗi dòng LK **đang mở** trong phạm vi theo dõi có **mức cảnh báo**:
  - **ĐỎ**: cấp CEO · quá ngày dự kiến · trễ hạn chưa có ngày DK · lỗi chờ giải trình ≥ 7 ngày · im lặng ≥ 7 ngày (đơn tồn ≥ 7 ngày).
  - **VÀNG**: đang chờ ngày DK · có lỗi chờ giải trình · im lặng ≥ 3 ngày · ngày DK trong 2 ngày tới · tồn > 30 ngày.
  - **XANH**: còn lại. Mỗi mức kèm lý do bằng chữ.
- **Tác động** (việc của người mua hàng) = thêm / sửa / xoá đợt kế hoạch, đợt push, mail gửi NCC gắn dòng, ghi nhận gọi / Zalo, giải trình.
  **Im lặng** = số ngày từ tác động cuối (hoặc từ ngày bắt đầu) đến hôm nay. **Thúc NCC** = đợt push đã có mail đồng bộ + mail gửi + liên hệ; **phản hồi NCC** = mail nhận.
- **Người phụ trách**: dòng đã ban hành = người lập PO; G2 = người thẩm định; G3 = người duyệt mua; G6 / G8 = NCC; G7 = Kho / Kế toán.
  Lỗi hệ thống vẫn gán mặc định cho người lập PO; nguyên nhân thật đọc từ giải trình (Ai + Lỗi gì), luôn hiện kèm **độ phủ giải trình**.
- Màn **Điều hành** (`/dieu-hanh`): kết luận nhanh (câu tự sinh), ô sức khoẻ, luồng giai đoạn ngang (đang ở / trễ / lỗi, 30 ngày đúng hạn),
  tab Điểm nóng / Theo người / Theo NCC / Nguyên nhân & xu hướng / Duyệt đang treo; lọc phạm vi theo người, NCC, kho.
  Quản lý (Admin, KH cung ứng, Theo dõi TD) bấm **Nhắc** = nhắc giải trình mọi lỗi chờ của 1 người.
- **Đơn PO**: cột **Tiến trình** (luồng ngang thay nhãn trạng thái: PO chưa ban hành theo trạng thái duyệt, đã ban hành theo số dòng đang ở từng giai đoạn) ·
  bộ lọc cá nhân lưu trên máy (★ Đã lưu, ☆ mặc định khi mở) · cột Cảnh báo (n đỏ / n vàng + lý do), Lỗi chờ GT, Thúc NCC (7 ngày / lần cuối), Hoạt động cuối (im lặng) đặt sát mã PO; nhóm nhanh
  "PO có dòng ĐỎ", "PO im lặng ≥ 7 ngày", "PO có lỗi chờ giải trình"; lọc / sắp xếp các cột này phía server.

## 8c. Mã lỗi ER.MH, Ca tồn CEO (v0.091)

- Mọi lỗi / cảnh báo có mã (`../MA_LOI_HE_THONG.md`): **001/002** chưa có ngày DK 24h (nhóm Karofi/Livotec/Korihome) / 48h — bước G5 · **003** không thúc NCC thứ 2/4 — G4 ·
  **004** quá ngày DK không cập nhật — G6 · **101–199** lỗi ghi khi giải trình (NCC không phản hồi / báo trễ / hết hàng → G6, đặt sai → G1, chậm duyệt → G3) ·
  **201–203** cấp CEO (lùi ≥ 3 lần / DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi) · **301–308** trễ hạn bước G1–G8 (chỉ đo). Mã tính lúc đọc, không lưu DB.
- Mỗi đơn hàng / PO có bảng mã lỗi theo bước kèm giải trình; Vi phạm tổng hợp theo mã (mọi trạng thái, % giải trình, nguyên nhân theo giải trình).
- **R1 lặp lại** (v0.095): dòng đã trễ 24h/48h mà vẫn chưa có ngày dự kiến → mỗi thứ 3 và thứ 6 ghi lại 1 lỗi R1 (vi phạm = PO + ngày đó); có ngày dự kiến
  → thôi ghi, lỗi đang chờ tự giải trình "đã có ngày dự kiến".
- **Đối tác của PO**: mọi dòng hiệu lực cùng 1 đối tác → tên đối tác, khác nhau → "Nhiều đối tác". **Giải trình hàng loạt** từ Đơn PO cho mọi PO đang lọc.
- **Vi phạm gộp** (v0.093): lỗi vẫn ghi theo từng dòng nhưng đếm / hiển thị / giải trình theo **vi phạm** = cùng loại lỗi trên cùng PO cùng kỳ:
  R1 = 1 PO (dù bao nhiêu dòng thiếu ngày DK) · R3 = PO + ngày kiểm tra thứ 2/4 · R4 = PO + mốc ngày DK bị quá · lỗi ghi tay = PO + lỗi gì + ngày ghi.
- **Tự giải trình** (chạy nền ≤ 10 phút / lần): lỗi R1 / R3 / R4 đang chờ được hệ thống tự đóng ("Auto giải trình vi phạm do …") khi **đã khắc phục sau đó**
  (R3: có mail / push / gọi-Zalo với NCC sau ngày kiểm tra · R1: dòng đã có ngày dự kiến · R4: đã nhập ngày dự kiến mới · hoặc đã có giải trình thật cùng lỗi)
  hoặc **quá 7 ngày** không giải trình (ghi nhận vi phạm). Lỗi tự đóng vẫn tính vi phạm (số lỗi, ngưỡng CEO) nhưng không tính là giải trình thật trong mọi thống kê.
- **Bảng mã lỗi** (menu Vi phạm › Bảng mã lỗi): tên, lỗi gì, yêu cầu giải trình, tự giải trình khi nào, số đang đếm theo từng mã.
- **Ca tồn CEO — mức xử lý** (v0.097): 🔴 Tồn đọng (còn lỗi chờ giải trình / quá ngày DK / trễ chưa có ngày DK / ≥ 7 ngày không ai tác động) ·
  🟠 Bỏ qua giải trình (hết vi phạm đang chạy nhưng lỗi bị tự đóng do quá 7 ngày, chưa giải trình) · 🟢 Đã xử lý (đã giải trình / khắc phục, chờ hàng).
- **Cache**: trình duyệt giữ dữ liệu lần mở trước (IndexedDB, theo tài khoản) và cập nhật ở nền; server nhớ báo cáo đã giải nén theo phiên bản dữ liệu,
  Tổng quan tính lại tối đa mỗi giờ khi dữ liệu không đổi; nút ⟳ trên thanh trên cùng tải lại ngay.
- Menu **Ca tồn CEO**: dòng đang mở cấp CEO + mã 201–203 + hành động (thúc NCC, NCC trả lời, giải trình, im lặng).
- Trạng thái luôn gắn bước: Đơn PO / popup PO = luồng tiến trình; popup đơn hàng = giai đoạn hiện tại; LK đặt "Tình trạng đơn" có tiền tố bước.
- Luồng trao đổi NCC theo dòng: 3T thúc (mail gửi có CC hộp theo dõi, push, gọi/Zalo) ↔ NCC trả lời (mail NCC) ↔ cập nhật ngày DK.

## 9. Kết nối hệ khác

| Hệ | Chiều | Nội dung |
|---|---|---|
| DVBH | Đẩy đi | Mỗi dòng EO = 1 PO (tiến độ, kế hoạch, phiếu AMIS) — chạy sau request khi dữ liệu đổi, cách nhau ≥ 2 phút, chỉ gửi dòng đổi |
| Hệ khác (DVBH, báo cáo…) | Cho đọc | API `/api/partner/ma-loi`, `/ca-ceo`, `/loi/tong-hop`, `/loi` (khoá `DOC_API_KEY`) |
| Thư ký mua hàng (`theodoimuahang`) | Nhận | Sự kiện mail NCC theo dòng (`/api/partner/mail-events`, ghi theo lô, chống trùng) |
| ETX nhân sự | Nhận | Bấm tay đồng bộ nhân sự |

## 10. Tài liệu liên quan

`CLAUDE.md`, `DEPLOY.md`, `SRS_tong_hop.md`, `nhat_ky_lam_viec.md`; ngoài repo: `../PERMISSION_SPEC.md`, `../THEO_DOI_LINH_KIEN_DAT.md`,
`../UI_GOP_2_MAN_HINH.md`.
