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
- Lỗi ghi vào `tl_loi` (chạy nền tối đa 10 phút/lần, idempotent); hết vi phạm thì tự xoá lỗi R1.
- Mức độ: CEO / CAO (lặp ≥ 3 hoặc chờ ≥ 7 ngày) / TB / THẤP. Giải trình: từng lỗi, cả PO, hoặc nhiều lỗi cùng loại 1 lần.
- Nhắc nhở: hệ thống tự nhắc khi ghi lỗi mới; quản lý nhắc tay.

## 7. 8 giai đoạn đơn hàng (chỉ đo)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & ban hành · G4 Gửi đơn NCC (song song) · G5 Có ngày dự kiến · G6 Chờ SX & giao ·
G7 Nhập kho & lên hệ thống · G8 Giao bù đến đủ. Hạn tính theo giờ làm việc (cấu hình được). Hiện chỉ báo cáo đúng / trễ hạn, chưa sinh lỗi.

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
  **Im lặng** = số ngày từ tác động cuối (hoặc từ ngày bắt đầu) đến hôm nay. **Thúc NCC** = push + mail gửi + liên hệ; **phản hồi NCC** = mail nhận.
- **Người phụ trách**: dòng đã ban hành = người lập PO; G2 = người thẩm định; G3 = người duyệt mua; G6 / G8 = NCC; G7 = Kho / Kế toán.
  Lỗi hệ thống vẫn gán mặc định cho người lập PO; nguyên nhân thật đọc từ giải trình (Ai + Lỗi gì), luôn hiện kèm **độ phủ giải trình**.
- Màn **Điều hành** (`/dieu-hanh`): kết luận nhanh (câu tự sinh), ô sức khoẻ, luồng giai đoạn ngang (đang ở / trễ / lỗi, 30 ngày đúng hạn),
  tab Điểm nóng / Theo người / Theo NCC / Nguyên nhân & xu hướng / Duyệt đang treo; lọc phạm vi theo người, NCC, kho.
  Quản lý (Admin, KH cung ứng, Theo dõi TD) bấm **Nhắc** = nhắc giải trình mọi lỗi chờ của 1 người.
- **Đơn PO**: cột Cảnh báo (n đỏ / n vàng + lý do), Lỗi chờ GT, Thúc NCC (7 ngày / lần cuối), Hoạt động cuối (im lặng) đặt sát mã PO; nhóm nhanh
  "PO có dòng ĐỎ", "PO im lặng ≥ 7 ngày", "PO có lỗi chờ giải trình"; lọc / sắp xếp các cột này phía server.

## 9. Kết nối hệ khác

| Hệ | Chiều | Nội dung |
|---|---|---|
| DVBH | Đẩy đi | Mỗi dòng EO = 1 PO (tiến độ, kế hoạch, phiếu AMIS) — chạy sau request khi dữ liệu đổi, cách nhau ≥ 2 phút, chỉ gửi dòng đổi |
| Thư ký mua hàng (`theodoimuahang`) | Nhận | Sự kiện mail NCC theo dòng (`/api/partner/mail-events`, ghi theo lô, chống trùng) |
| ETX nhân sự | Nhận | Bấm tay đồng bộ nhân sự |

## 10. Tài liệu liên quan

`CLAUDE.md`, `DEPLOY.md`, `SRS_tong_hop.md`, `nhat_ky_lam_viec.md`; ngoài repo: `../PERMISSION_SPEC.md`, `../THEO_DOI_LINH_KIEN_DAT.md`,
`../UI_GOP_2_MAN_HINH.md`.
