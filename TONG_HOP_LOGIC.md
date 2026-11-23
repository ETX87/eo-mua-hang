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

- Quy tắc: **R1** — dòng mới phải có ngày dự kiến trong 16 giờ làm việc (Karofi / Livotec / Korihome: 8 giờ); **R3** — thứ 2/4 phải có mail cập nhật với NCC; **R4** —
  quá ngày dự kiến chưa về → nhập ngày mới trong 8 giờ làm việc từ 00:00 ngày sau; lùi ngày nhiều lần → **cấp CEO**.
- **Giờ làm việc** (v0.103, mọi SLA / hạn — `lib/gioLamViec.ts`): T2–T6 8:00–12:00 + 13:00–17:00 (8h) · T7 8:00–12:00 (4h) · CN nghỉ; 24h cũ = 8h làm việc (48h → 16h, 7 ngày → 56h).
  Hạn luôn rơi vào trong / cuối 1 ca. Ngày lễ chưa tính. Lỗi ghi trước khi đổi (mốc `GIO_LV_TU`) giữ nguyên hạn cũ, không tự tính lại / tự xoá.
- Lỗi ghi vào `tl_loi` (chạy nền tối đa 10 phút/lần, idempotent); hết vi phạm thì tự xoá lỗi R1. Lỗi R3 đang chờ tự xoá khi dòng có mail /
  gọi-Zalo ghi nhận trong kỳ của nó (kể cả mail đồng bộ muộn hoặc lỗi ghi trước khi R3 tính mail), có ghi nhật ký. Mail chỉ được tính khi đã
  đồng bộ qua hộp thư theo dõi (khớp dòng hoặc mã push); tạo đợt / tải Excel / bản nháp chưa tính.
- **Nút "Tạo mail nhắc" đang tạm tắt** (v0.088, cờ `BAT_TAO_MAIL_NHAC` ở `pages/theodoi/shared.tsx`): người mua tự soạn mail cho NCC, CC
  hộp theo dõi + ghi mã 3TDO / mã LK. API tạo đợt push và luồng đồng bộ mail giữ nguyên.
- **Việc của tôi** (v0.104, `/viec-cua-toi`, `routes/viecCuaToi.ts`): dòng LK của tôi (người đặt / kho phụ trách; người xem toàn bộ có nút "Toàn bộ")
  chia 4 việc có hạn giờ làm việc + 1 nút: ① chưa có ngày DK (hạn R1) · ② thứ 2/4 chưa nhắc NCC trong kỳ (hạn 23:59; nút soạn mail Gmail có CC hộp
  theo dõi + mã 3TDO + mã LK, hoặc 📞 Đã nhắc) · ③ quá ngày DK (hạn R4) · ④ có lỗi chờ giải trình (hạn tự đóng = lỗi sớm nhất + 56h LV).
  Số đỏ menu = mục "Linh kiện đặt cần xử lý" của Việc cần xử lý (trỏ về màn này).
  Bảng mỗi mục: Hạn · PO · Linh kiện · Kho · Nhà cung cấp · Ngày dự kiến (đợt gần nhất, dòng phụ "NCC dd/mm" nếu ngày NCC cam kết khác) · SL đặt · Còn thiếu.
  Mỗi mục có nút ⬇ Xuất Excel (v0.107) — xuất đúng các dòng của mục đó (kho tên đầy đủ, ngày ban hành, ngày DK, ngày NCC cam kết, SL đặt / đã về / còn thiếu, lỗi chờ).
- **Cột Vi phạm ở Đơn PO** (v0.104): đếm vi phạm gộp của PO giống màn Vi phạm (kể cả dòng đã đóng) → trạng thái Cấp CEO (có dòng đang cấp CEO) >
  Chờ giải trình > Đã xử lý (đã giải trình / tự đóng hết) > Không vi phạm; kèm số vi phạm / chờ / đã GT / tự đóng. Chip "PO cấp CEO".
- Mức độ: CEO / CAO (lặp ≥ 3 hoặc chờ giải trình ≥ 56 giờ làm việc) / TB (lặp 2 hoặc chờ ≥ 24 giờ làm việc) / THẤP. Giải trình: từng lỗi, cả PO, hoặc nhiều lỗi cùng loại 1 lần.
- Nhắc nhở: hệ thống tự nhắc khi ghi lỗi mới; quản lý nhắc tay.
- **Quét mỗi giờ + nhắc sắp hết hạn + thông báo đẩy + popup** (v0.105): ngoài lúc có người dùng app, cron mỗi giờ chạy lại việc ghi lỗi. Người phải
  giải trình = người vi phạm của lỗi (`ai_email`, mặc định người đặt). Lỗi mới → chuông + thông báo đẩy. Còn ≤ 6 giờ làm việc tới hạn giải trình
  (hạn lỗi + 56h LV) mà chưa giải trình → nhắc 1 lần / lỗi (chuông + nhắc nhở hệ thống + thông báo đẩy). Thông báo đẩy chỉ tới thiết bị đã bấm
  "🔔 Bật đẩy" (ở chuông thông báo hoặc trong popup). Mở app mà còn lỗi chờ mình giải trình → popup liệt kê dòng LK, số lỗi, hạn, số giờ còn lại
  (đỏ khi ≤ 6 giờ); "Để sau" ẩn tới lần mở app sau hoặc khi có lỗi mới / dòng chuyển sắp hết hạn; bấm thông báo đẩy luôn mở lại popup.

## 7. 8 giai đoạn đơn hàng (chỉ đo)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & ban hành · G4 Gửi đơn NCC (song song) · G5 Chờ ngày DK · G6 Chờ giao hàng ·
G7 Nhập kho & lên hệ thống · G8 Giao bù đến đủ. Hạn tính theo giờ làm việc (cấu hình được; mặc định 8h, G8 56h; G6 = ngày dự kiến lần đầu). Hiện chỉ báo cáo đúng / trễ hạn, chưa sinh lỗi.
- **Giai đoạn hiện tại = bước MỚI NHẤT đã bắt đầu mà chưa kết thúc** (theo thứ tự G1 → G2 → G3 → G5 → G6 → G8; không bước nào mở → bước mới nhất
  đã bắt đầu). PO đã qua nháp thì G1 luôn đóng: mốc = lần gửi trình đầu sau khi tạo dòng, không có thì lần trình đầu của PO, không có trình nào
  (PO chuyển từ hệ cũ) thì ngày ban hành.

## 8. Báo cáo & tổng quan

- 4 báo cáo (tiến độ 0.1 là nguồn chung), báo cáo giai đoạn. Tổng quan: tỷ lệ đáp ứng tuần / tháng = Σmin(về, đặt) / Σđặt,
  tồn đọng theo 8 mốc tồn — cùng mốc bỏ qua với theo dõi nên số khớp màn Quản lý đơn hàng.
- "Việc cần xử lý" + số đỏ menu theo vai trò (`/api/viec-can-lam`).

## 8b. Điều hành cho lãnh đạo (v0.084, `../QUAN_TRI_DIEU_HANH.md`)

- Mỗi dòng LK **đang mở** trong phạm vi theo dõi có **mức cảnh báo**:
  - **ĐỎ**: cấp CEO · quá ngày dự kiến · trễ hạn chưa có ngày DK · lỗi chờ giải trình ≥ 56 giờ làm việc · im lặng ≥ 7 ngày (đơn tồn ≥ 7 ngày).
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

- Mọi lỗi / cảnh báo có mã (`../MA_LOI_HE_THONG.md`): **001/002** chưa có ngày DK 8h làm việc (nhóm Karofi/Livotec/Korihome) / 16h làm việc — bước G5 · **003** không thúc NCC thứ 2/4 — G4 ·
  **004** quá ngày DK không cập nhật — G6 · **101–199** lỗi ghi khi giải trình (NCC không phản hồi / báo trễ / hết hàng → G6, đặt sai → G1, chậm duyệt → G3) ·
  **201–203** cấp CEO (lùi ≥ 3 lần / DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi) · **301–308** trễ hạn bước G1–G8 (chỉ đo). Mã tính lúc đọc, không lưu DB.
- Mỗi đơn hàng / PO có bảng mã lỗi theo bước kèm giải trình; Vi phạm tổng hợp theo mã (mọi trạng thái, % giải trình, nguyên nhân theo giải trình).
- **R1 lặp lại** (v0.095): dòng đã trễ hạn R1 (8h/16h làm việc) mà vẫn chưa có ngày dự kiến → mỗi thứ 3 và thứ 6 ghi lại 1 lỗi R1 (vi phạm = PO + ngày đó); có ngày dự kiến
  → thôi ghi, lỗi đang chờ tự giải trình "đã có ngày dự kiến".
- **Đối tác của PO**: mọi dòng hiệu lực cùng 1 đối tác → tên đối tác, khác nhau → "Nhiều đối tác". **Giải trình hàng loạt** từ Đơn PO cho mọi PO đang lọc.
- **Vi phạm gộp** (v0.093): lỗi vẫn ghi theo từng dòng nhưng đếm / hiển thị / giải trình theo **vi phạm** = cùng loại lỗi trên cùng PO cùng kỳ:
  R1 = 1 PO (dù bao nhiêu dòng thiếu ngày DK) · R3 = PO + ngày kiểm tra thứ 2/4 · R4 = PO + mốc ngày DK bị quá · lỗi ghi tay = PO + lỗi gì + ngày ghi.
- **Tự giải trình** (chạy nền ≤ 10 phút / lần): lỗi R1 / R3 / R4 đang chờ được hệ thống tự đóng ("Auto giải trình vi phạm do …") khi **đã khắc phục sau đó**
  (R3: có mail / push / gọi-Zalo với NCC sau ngày kiểm tra · R1: dòng đã có ngày dự kiến · R4: đã nhập ngày dự kiến mới · hoặc đã có giải trình thật cùng lỗi)
  hoặc **quá hạn giải trình 56 giờ làm việc** tính từ hạn lỗi (ghi nhận vi phạm). Lỗi tự đóng vẫn tính vi phạm (số lỗi, ngưỡng CEO) nhưng không tính là giải trình thật trong mọi thống kê.
- **Cần giải trình ≠ vi phạm** (v0.109 hiển thị, v0.110 cách đếm): chạm quy tắc R1/R3/R4 → lỗi **CẦN GIẢI TRÌNH**, hạn giải trình = mốc lỗi (`han`, không có thì lúc ghi)
  + **16 giờ làm việc** (lỗi có mốc từ 24/11/2026; lỗi cũ hơn giữ 56 giờ — `hanGiaiTrinh` ở `lib/theoDoi.ts`). Trạng thái hiển thị (`frontend/src/lib/giaiTrinh.tsx`, khớp `tuGiaiTrinh`): **Cần giải trình** (còn hạn, kèm "còn x giờ") · **Đã giải trình** ·
  **Đã khắc phục** (tự đóng KHAC_PHUC) · **VI PHẠM** (hết hạn không giải trình — QUA_HAN, hoặc đã quá hạn mà nền chưa kịp chốt) · Ghi khi giải trình (TAY).
  Mỗi lỗi có câu "Vì sao có lỗi" (theo quy tắc + ngày) và "Kết luận" (hạn / lúc giải trình / vì sao thành vi phạm). **Cấp CEO** (lùi ≥ 3 lần, ngày DK cách ngày đặt
  ≥ 30 ngày, ≥ 3 lỗi) hệ thống tự tính theo số liệu như cũ (ngưỡng "≥ 3 lỗi" vẫn đếm mọi lỗi), KHÔNG có hạn giải trình.
  **Đếm vi phạm (v0.110)**: CHỈ lỗi hết hạn giải trình mà không giải trình (tự đóng `AUTO:QUA_HAN`, hoặc còn chờ nhưng đã quá hạn) là **vi phạm**. Lỗi giải trình
  hoặc khắc phục trong hạn KHÔNG tính vi phạm. Áp dụng: màn Vi phạm (ô "Vi phạm", lọc trạng thái, theo PO / người / mã có cột Vi phạm), cột Vi phạm ở Đơn PO
  (Cấp CEO > Cần giải trình > Có vi phạm > Xử lý trong hạn > Không có lỗi), Điều hành (cột "Vi phạm 30 ng" theo người, nguyên nhân theo quy tắc).
  Mức độ: "lặp" chỉ đếm lần chưa xử lý / thành vi phạm; TB = chờ ≥ 8 giờ LV, CAO = chờ ≥ 12 giờ LV; Điều hành ĐỎ khi lỗi chờ ≥ 12 giờ LV. Nhắc sắp hết hạn vẫn khi còn ≤ 6 giờ LV.
- **Vi phạm cũ bỏ qua (v0.113)**: lỗi có mốc trước **01/11/2026** không tính vi phạm — đang chờ thì hệ thống tự đóng "Tự bỏ vi phạm do vi phạm cũ" (`AUTO:CU`),
  các lỗi đã bị đóng "quá hạn" trước đó đổi sang `AUTO:CU` (migration 0026, 601 lỗi / 9 PO / 2 người). Hiển thị "Bỏ qua · lỗi cũ".
- **Chờ NCC báo ngày (v0.113)**: NCC trả lời nhưng chưa có ngày → NV ghi nhận nhắc đối tác (kênh gọi / Zalo / tin nhắn / **mail** / gặp) và tick "NCC chưa có ngày dự kiến",
  hẹn hỏi lại (sau hôm nay, tối đa 7 ngày; `tl_lien_he.hen_lai`). Từ ngày liên hệ đến ngày hẹn: KHÔNG ghi lỗi lặp R1 (thứ 3/6) và R3 (thứ 2/4) cho dòng; lỗi R1 đầu tiên vẫn ghi.
  Việc của tôi: dòng chuyển sang mục "Đang chờ NCC báo ngày" (hạn = ngày hẹn 17:00), không còn ở ① / ③ và không vào danh sách push; số đỏ menu cũng không tính.
  Quá ngày hẹn chưa có ngày → dòng quay lại mục cần làm.
- **Form giải trình (v0.113)**: "Ai chịu" không còn mặc định "Người đặt hàng" (phải chọn); dòng có thư NCC trả lời mà không có ngày → gợi ý 1 bấm điền Ai = Đối tác / NCC,
  Lỗi = NCC không phản hồi + nội dung; lỗi R1/R4 không cần ảnh nếu tick "dùng thư với NCC đã lưu ở hộp theo dõi" (nội dung ghi kèm "[Bằng chứng: … thư …]").
- **Mời bật thông báo đẩy (v0.113)**: thẻ nhỏ góc dưới phải khi trình duyệt chưa bật (Để sau = ẩn 3 ngày); trình duyệt đang chặn → hướng dẫn mở chặn.
- **Bảng mã lỗi** (menu Vi phạm › Bảng mã lỗi): tên, lỗi gì, yêu cầu giải trình, tự giải trình khi nào, số đang đếm theo từng mã.
- **Ca CEO — độ hot** (v0.098): 🔴 Rất hot = còn thiếu hàng + có lỗi trong hạn giải trình (≤ 56h làm việc) chưa giải trình · 🟠 Giảm hot = còn thiếu hàng + lỗi quá hạn giải trình (tự đóng) hoặc đã
  giải trình bù · ⚪ Đã xong = hàng về đủ / kết thúc sớm nhưng từng chạm ngưỡng CEO. Mốc 56h làm việc = mốc tự bỏ giải trình.
- **Cache**: trình duyệt giữ dữ liệu lần mở trước (IndexedDB, theo tài khoản) và cập nhật ở nền; server nhớ báo cáo đã giải nén theo phiên bản dữ liệu,
  Tổng quan tính lại tối đa mỗi giờ khi dữ liệu không đổi; nút ⟳ trên thanh trên cùng tải lại ngay.
- Menu **Ca tồn CEO**: dòng đang mở cấp CEO + mã 201–203 + hành động (thúc NCC, NCC trả lời, giải trình, im lặng).
- **Gộp ca CEO** (v0.100, như gộp vi phạm): 1 ca = 1 PO + 1 mã CEO (201 / 202 / 203), gộp mọi dòng LK cùng lý do trên PO đó; dòng có 2–3 mã nằm ở 2–3 ca.
  Độ hot của ca: mọi dòng đã xong → Đã xong · có dòng rất hot → Rất hot · còn lại → Giảm hot. Mọi số đếm CEO (màn Ca tồn CEO, số đỏ menu, Bảng mã lỗi 2xx,
  API đọc `so_ca` / `dem.*.ca`, ô "Ca CEO đang theo dõi" ở màn Vi phạm — v0.101) tính theo ca; số vi phạm trên các ca chỉ là dòng phụ. Màn có tab **Đang theo dõi** (rất hot + giảm hot) và tab nhỏ **Đã xong**.
- Trạng thái luôn gắn bước: Đơn PO / popup PO = luồng tiến trình; popup đơn hàng = giai đoạn hiện tại; LK đặt "Tình trạng đơn" có tiền tố bước.
- Luồng trao đổi NCC theo dòng: 3T thúc (mail gửi có CC hộp theo dõi, push, gọi/Zalo) ↔ NCC trả lời (mail NCC) ↔ cập nhật ngày DK.

## 9. Kết nối hệ khác

| Hệ | Chiều | Nội dung |
|---|---|---|
| DVBH | Đẩy đi | Mỗi dòng EO = 1 PO (tiến độ, kế hoạch, phiếu AMIS) — chạy sau request khi dữ liệu đổi, cách nhau ≥ 2 phút, chỉ gửi dòng đổi |
| Hệ khác (DVBH, báo cáo…) | Cho đọc | API `/api/partner/ma-loi`, `/ca-ceo`, `/loi/tong-hop`, `/loi` (khoá `DOC_API_KEY`) |
| App linh kiện (`linhkien`) | Cho đọc | `GET /api/partner/theo-id?ids=&po_lk=` (khoá `DOC_API_KEY`, gọi qua Service Binding): trả kết quả mua hàng (PO, trạng thái, SL đặt / về / thiếu, ngày dự kiến, ngày về) theo mã. `ids` = mã đơn `DDH-…`, ticket `TLK-…`, mã case — khớp nếu mã nằm trong ô **ID CRM** HOẶC ô **ID đặt hàng** của dòng EO (tách từng mã trong ô, bỏ dấu nháy / khoảng trắng, không phân biệt hoa thường — dữ liệu thật có nhập lẫn cột, nhiều mã 1 ô). `po_lk` = cặp `3TDO-…~MÃ_LK` (ticket đã ghi mã EO) → dòng của PO đó có mã LK đó (kể cả mã gốc trước khi thay). Mỗi dòng trả 1 lần + `khop_theo`; mã không khớp ở `khong_khop` |
| Thư ký mua hàng (`theodoimuahang`) | Nhận | Sự kiện mail NCC theo dòng (`/api/partner/mail-events`, ghi theo lô, chống trùng) |
| ETX nhân sự | Nhận | Bấm tay đồng bộ nhân sự |

## 10. Tài liệu liên quan

`CLAUDE.md`, `DEPLOY.md`, `SRS_tong_hop.md`, `nhat_ky_lam_viec.md`; ngoài repo: `../PERMISSION_SPEC.md`, `../THEO_DOI_LINH_KIEN_DAT.md`,
`../UI_GOP_2_MAN_HINH.md`.
