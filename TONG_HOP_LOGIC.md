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

- **Dòng thêm sau ban hành chờ duyệt (v0.124)**: chỉ tính là việc chờ duyệt khi dòng CÒN MỞ (đang hoạt động, chưa kết thúc sớm, chưa về đủ theo phiếu nhập AMIS) —
  một điều kiện chung `lib/choDuyetSauBh.ts` cho số đỏ menu, Phiếu chờ bạn duyệt, Duyệt đang treo, Tổng quan, Đơn PO, App Nhiệm vụ eOffice. Dòng đã về đủ / kết thúc:
  ẩn nút Duyệt / Từ chối, nhãn "Đã về đủ · bỏ duyệt" (dữ liệu giữ nguyên). Dòng còn chờ duyệt **chưa bắt đầu** tính giờ R1 / R3 / R4 (trễ là do người duyệt).
- **Lỗi R5 — Chậm duyệt (ER.MH-005, v0.125)**: bước thẩm định / duyệt mua của PO (phiếu duyệt đang chờ của lần trình đang chờ) hoặc dòng thêm sau ban hành
  còn chờ duyệt (dòng còn mở) quá hạn G2 / G3 (cấu hình `giai_doan_sla`, mặc định 8 giờ làm việc từ lúc được giao) → 1 lỗi cho **đúng người duyệt đang giữ**
  (Do ai = Người duyệt, bên nội bộ). Áp dụng từ 27/11/2026 08:00 (bước đã quá hạn từ trước tính hạn = mốc này). Tự đóng "đã khắc phục" khi bước đã duyệt / từ chối /
  lần trình đổi, hoặc dòng không còn chờ duyệt; hết 16 giờ làm việc không giải trình → vi phạm. **Chỉ chính người duyệt (hoặc Admin) giải trình** lỗi R5;
  "Giải trình cả PO" / giải trình chung theo dòng không đóng R5. Lỗi R5 hiện ở màn Vi phạm, popup nhắc, số đỏ "Lỗi của bạn" kể cả PO chưa ban hành; người đặt
  không bị tính lỗi R5 của người duyệt. Vi phạm gộp R5 = PO + người duyệt + ngày bắt đầu chờ.


G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & ban hành · G4 Gửi đơn NCC (song song) · G5 Chờ ngày DK · G6 Chờ giao hàng ·
G7 Nhập kho & lên hệ thống · G8 Giao bù đến đủ. Hạn tính theo giờ làm việc (cấu hình được; mặc định 8h, G8 56h; G6 = ngày dự kiến lần đầu). Hiện chỉ báo cáo đúng / trễ hạn, chưa sinh lỗi.
- **Bên chịu trễ theo giai đoạn (v0.121)**: **Nội bộ** — G1 Lập & trình (người tạo EO) · G2 Thẩm định (người thẩm định) · G3 Duyệt mua (người duyệt) ·
  G4 Gửi đơn cho NCC (NV đặt hàng) · G7 Nhập kho (Kho / Kế toán). **Nhà cung cấp** — từ khi gửi mail yêu cầu đến khi hàng về: G5 Chờ ngày DK · G6 Chờ giao hàng ·
  G8 Giao bù. **Không giải trình đúng hạn** (hết 16h làm việc) là lỗi riêng của người phải giải trình, tính tách khỏi 2 bên.
  **Bảng trách nhiệm tồn đọng (v0.122)** — đầu màn Tổng quan (vai trò Admin / KH cung ứng / Theo dõi tiến độ / View) và tab mặc định của Điều hành:
  mỗi dòng LK đang tồn thuộc **bên đang giữ** — NCC khi đã ở G5 / G6 / G8 **và** đã ghi nhận gửi đơn cho NCC (G4 = DA_GUI); còn lại nội bộ (G1–G3, hoặc
  chưa ghi nhận gửi đơn → khâu "G4 chưa gửi đơn NCC"). Hàng: Lỗi nhà cung cấp (từng NCC) · Lỗi nội bộ (từng khâu) · PO chưa ban hành đang chờ thẩm định / duyệt
  (không cộng vào tổng) · Tổng cộng. Cột: số PO, số đơn đặt (dòng) + % , SL tồn / SL đặt + %, tồn > 7 / 14 / 21 / 30 ngày (từ ngày ban hành, cộng dồn),
  tồn lâu nhất, quá ngày DK, chưa có ngày DK, không thúc NCC 7 ngày, cấp CEO, ca lỗi (vi phạm gộp; tách NCC / nội bộ), % đã giải trình (thật / (thật + chưa
  + không GT), ca tự khắc phục không tính), chưa giải trình, không giải trình, ai giữ nhiều nhất. Bấm ô số → danh sách dòng (Excel, bấm dòng = popup).
  Trình bày (v0.123): tiêu đề 2 tầng theo nhóm chỉ số (Quy mô tồn · Tồn quá (ngày) · Ngày DK & thúc NCC · Lỗi & giải trình), ô xấu tô nền đỏ theo mức (so với ô lớn
  nhất cùng cột), số 0 hiện "·". **Số PO và ca lỗi KHÔNG cộng dồn**: 1 PO có dòng ở cả NCC và nội bộ được đếm ở cả 2 nhóm, Tổng chỉ đếm 1 lần (ca lỗi gộp theo PO
  nên tương tự) — bảng ghi chú số PO / ca nằm ở cả hai bên; các cột đếm theo dòng cộng khớp.
  Điều hành › Nguyên nhân & xu hướng có khối "Trách nhiệm chậm trễ theo bên": dòng đang trễ, lượt trễ bước 30 ngày, lỗi 30 ngày cho từng bên + vi phạm không giải trình theo người.
- **Giai đoạn hiện tại = bước MỚI NHẤT đã bắt đầu mà chưa kết thúc** (theo thứ tự G1 → G2 → G3 → G5 → G6 → G8; không bước nào mở → bước mới nhất
  đã bắt đầu). PO đã qua nháp thì G1 luôn đóng: mốc = lần gửi trình đầu sau khi tạo dòng, không có thì lần trình đầu của PO, không có trình nào
  (PO chuyển từ hệ cũ) thì ngày ban hành.

## 7b. Menu (v0.129) — 3 cấp, bấm là lọc

- Menu gốc → menu phụ → cấp 2 (giai đoạn / nhóm con), định nghĩa ở `frontend/src/lib/nav.ts`. Bấm menu = mở danh sách đã lọc theo URL:
  Đơn PO `/eo?chip=<nhóm>&moc=<giai đoạn>` (lọc cột Tiến trình), Theo LK `/don-hang?gd=G…`, PO tồn CEO `/ca-ceo?ma=ER.MH-20x`, Điều hành `/dieu-hanh?tab=…`,
  Vi phạm `/vi-pham?tt=cho|vi_pham|xl|mo&ben=NCC|NOI_BO&qt=R1|R3|R4|R5|TAY`.
- Nhóm PO: Theo PO (mặc định "còn tồn"; cấp 2 dùng mọi PO) · PO chờ tôi · PO tồn CEO (PO có dòng cấp CEO) · PO cảnh báo (có dòng ĐỎ) ·
  Lỗi đối tác / Lỗi nội bộ = PO có vi phạm gộp CHƯA xử lý (cần giải trình còn hạn + vi phạm hết hạn không giải trình) mà bên chịu là NCC / nội bộ.
- Bên chịu 1 lỗi (`benLoi` = `BEN_SQL`): đã giải trình thật → theo "Do ai" (Đối tác = NCC, còn lại nội bộ); chưa / tự đóng → R1, R4 = NCC; R3, R5 = nội bộ;
  lỗi ghi tay theo "Do ai". 1 vi phạm gộp lấy bên của dòng đại diện (dòng còn chờ, không có thì dòng mới nhất).
- Số đếm menu Đơn PO = `GET /api/eo/dem` (`theo_moc[nhóm][giai đoạn]` = số PO của nhóm đang có dòng ở giai đoạn đó; 1 PO có thể nằm ở nhiều giai đoạn).

## 8. Báo cáo & tổng quan

- 2 màn dưới menu Tổng quan (v0.130, chủ hệ thống chốt gộp 27/11/2026): **Tổng quan & điều hành** (`/`) = việc cần xử lý của bạn + bảng điều khiển (tỷ lệ đáp ứng,
  tồn theo mốc, giai đoạn) + toàn bộ Điều hành (phạm vi, kết luận nhanh, ô sức khoẻ, luồng giai đoạn, tab Trách nhiệm / Điểm nóng / Theo PO / người / NCC / Nguyên nhân /
  Duyệt treo / Xu hướng EO); `/dieu-hanh` cũ chuyển về `/`. **Báo cáo đặt LK** = số liệu theo kỳ của dòng linh kiện (giai đoạn đơn hàng, tiến độ tuần KRF, lũy kế năm).

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
  tab Điểm nóng / Theo PO / Theo người / Theo NCC / Nguyên nhân & xu hướng / Duyệt đang treo; lọc phạm vi theo người, NCC, kho.
  **Theo PO** (v0.118): gom dòng đang mở (trong phạm vi lọc) theo PO — mức = mức nặng nhất của các dòng; đếm dòng mở / thiếu, đỏ, quá DK, cấp CEO,
  lỗi chờ GT, tồn lâu nhất (+ số lần lùi DK nhiều nhất), dòng không thúc NCC 7 ngày, hoạt động cuối (tác động mới nhất trên mọi dòng). Sắp: đỏ → vàng → xanh,
  nhiều dòng đỏ trước. Bấm dòng = popup PO; bấm 1 con số = Điểm nóng chỉ các dòng đó của PO (nhãn "PO … ×" để bỏ).
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
- **Bỏ vi phạm chốt trước đào tạo 20/11/2026 (v0.128)**: mọi vi phạm "hết hạn giải trình" (`AUTO:QUA_HAN`) hệ thống chốt trước 20/11/2026 đổi sang `AUTO:CU`
  (migration 0028, 347 vi phạm / 3 người — luật tự chốt áp hồi tố 18/11, trước khi đào tạo). Vi phạm chốt từ 20/11 tính bình thường.
- **Bỏ LỖI cũ, KHÔNG bỏ theo dõi đơn tồn (v0.115)**: chỉ lỗi có mốc trước 01/11 bị bỏ; dòng tồn vẫn theo dõi và vẫn bị nhắc giải trình như mọi dòng.
  R1 / R3 lặp lại theo lịch nên tự tiếp tục; R4 chỉ ghi 1 lần / ngày DK → dòng quá ngày DK từ trước 01/11 mà vẫn tồn được ghi THÊM 1 lỗi R4 mốc 24/11/2026 08:00
  (khoá `R4:<dòng>:<ngày DK>:TON`, hạn giải trình 16h LV → 25/11 17:00; nhập ngày DK mới thì tự đóng "đã khắc phục").
- **Đơn tồn của PO ban hành TRƯỚC mốc áp dụng quy tắc (v0.120)**: PO ban hành 01/07 → 20/10/2026 (trước `theo_doi_ap_dung_tu`) trước đây chỉ được theo dõi, không bao giờ
  sinh lỗi. Nay dòng còn tồn + quá ngày DK + chưa về hàng lần nào bị **R4** từ 27/11/2026 08:00 (không ghi lùi): quá ngày DK trước mốc → 1 lỗi khoá `…:TON` mốc 27/11 08:00
  (hạn giải trình 16h LV → 28/11 17:00); ngày DK mới về sau lại quá → R4 thường. Chỉ R4 — R1 / R3 và ngưỡng Ca tồn CEO vẫn chỉ cho dòng từ mốc áp dụng.
  Lỗi này hiện ở màn Vi phạm, mục giải trình của Việc của tôi và số đỏ menu như mọi lỗi. Lúc làm: ~54 dòng / 10 PO / 3 người đặt.
- **Chờ NCC báo ngày (v0.113)**: NCC trả lời nhưng chưa có ngày → NV ghi nhận nhắc đối tác (kênh gọi / Zalo / tin nhắn / **mail** / gặp) và tick "NCC chưa có ngày dự kiến",
  hẹn hỏi lại (sau hôm nay, tối đa 7 ngày; `tl_lien_he.hen_lai`). Từ ngày liên hệ đến ngày hẹn: KHÔNG ghi lỗi lặp R1 (thứ 3/6) và R3 (thứ 2/4) cho dòng; lỗi R1 đầu tiên vẫn ghi.
  Việc của tôi: dòng chuyển sang mục "Đang chờ NCC báo ngày" (hạn = ngày hẹn 17:00), không còn ở ① / ③ và không vào danh sách push; số đỏ menu cũng không tính.
  Quá ngày hẹn chưa có ngày → dòng quay lại mục cần làm.
- **Form giải trình (v0.113)**: "Ai chịu" không còn mặc định "Người đặt hàng" (phải chọn); dòng có thư NCC trả lời mà không có ngày → gợi ý 1 bấm điền Ai = Đối tác / NCC,
  Lỗi = NCC không phản hồi + nội dung; lỗi R1/R4 không cần ảnh nếu tick "dùng thư với NCC đã lưu ở hộp theo dõi" (nội dung ghi kèm "[Bằng chứng: … thư …]").
- **Do ai + bằng chứng (v0.121)**: form giải trình có ô **Do ai** chia nhóm Nhà cung cấp / Nội bộ (người đặt, người duyệt, kho, kế toán, khác), tự gợi ý theo
  giai đoạn của lỗi: R1 chưa có ngày DK (G5) và R4 quá ngày DK (G6) = **Đối tác / NCC**, R3 không thúc NCC (G4) = **Người đặt**; người giải trình đổi được
  (chọn khác gợi ý thì hiện nhắc ghi rõ lý do). Lỗi hệ thống mới ghi sẵn Do ai theo gợi ý này; người phải giải trình vẫn là người đặt. **Ảnh / thư bằng chứng không
  bắt buộc** với mọi lỗi; tick "kèm thư NCC" mà dòng không có thư nào thì vẫn báo `THIEU_THU`. Báo cáo bên chịu: có giải trình thật → theo Do ai đã chọn;
  chưa giải trình / hệ thống tự đóng → theo giai đoạn (R1/R4 NCC, R3 nội bộ).
- **Bằng chứng R1/R4 bằng thư (v0.114; từ v0.121 bằng chứng là tuỳ chọn)**: 4 API giải trình (`/theo-doi/giai-trinh`, `/vi-pham/giai-trinh-po|nhieu|dong`) nhận `dung_mail: true` thay ảnh — server kiểm
  MỖI dòng có lỗi R1/R4 phải có ≥ 1 thư đã đồng bộ (theo dòng / theo đợt push) hoặc 1 ghi nhận liên hệ NCC; thiếu → 400 `THIEU_THU` (phải thêm ảnh). (`kiemBangChung`, lib/theoDoi.ts)
- **Việc của tôi › ④ Giải trình (v0.114)**: xem Theo PO (mặc định) / Theo mã LK / Từng dòng; tick dòng / cả nhóm → "Giải trình chung" (1 nội dung đóng mọi lỗi chờ của các dòng,
  nhiều PO, nhiều loại — cùng API `/vi-pham/giai-trinh-dong` của LK đặt); tiêu đề nhóm có nút "Giải trình cả nhóm".
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
| App linh kiện (`linhkien`) | Cho đọc | `GET /api/partner/theo-id?ids=&po_lk=` (khoá `DOC_API_KEY`, gọi qua Service Binding): trả kết quả mua hàng (PO, trạng thái, SL đặt / về / thiếu, ngày dự kiến, ngày về) theo mã. `ids` = mã đơn `DDH-…`, ticket `TLK-…`, mã case — khớp nếu mã nằm trong ô **ID CRM** HOẶC ô **ID đặt hàng** của dòng EO (tách từng mã trong ô, bỏ dấu nháy / khoảng trắng, không phân biệt hoa thường — dữ liệu thật có nhập lẫn cột, nhiều mã 1 ô). `po_lk` = cặp `3TDO-…~MÃ_LK` (ticket đã ghi mã EO) → dòng của PO đó có mã LK đó (kể cả mã gốc trước khi thay). Mỗi dòng trả 1 lần + `khop_theo`; mã không khớp ở `khong_khop`. `POST /api/partner/theo-id` { ids[], po_lk[] } = cùng kết quả, tối đa 1000 mã / 1000 cặp — app Linh kiện gọi mỗi giờ để **ghi đè ngày dự kiến của EO lên ticket thiếu hàng THB / TLK đang mở** (EO là nguồn chuẩn, v0.126) |
| Thư ký mua hàng (`theodoimuahang`) | Nhận | Sự kiện mail NCC theo dòng (`/api/partner/mail-events`, ghi theo lô, chống trùng) |
| ETX nhân sự | Nhận | Bấm tay đồng bộ nhân sự |
| App Nhiệm vụ eOffice (Cổng nhiệm vụ, mã app `mua-hang`) | Đẩy đi | PO đang chờ duyệt → việc của từng người duyệt (v0.116, xem dưới) |

**Đẩy việc chờ duyệt lên App Nhiệm vụ (v0.116, `lib/congNhiemVu.ts`)**
- Việc gửi = đúng hàng chờ "Chờ tôi duyệt": (1) phiếu thẩm định đang chờ → người thẩm định, tag "Thẩm định PO"; (2) phiếu duyệt mua đang chờ → người
  duyệt mua, tag "Duyệt mua PO"; (3) dòng thêm sau ban hành chờ duyệt → người duyệt mua của PO, **gộp 1 việc / PO** + số dòng (`count`), tag "Duyệt dòng thêm".
- Mỗi việc: tiêu đề có mã PO (MH-/EO- hoặc 3TDO) + tiêu đề PO; link `/eo/<id>` mở thẳng popup PO (chưa đăng nhập → đăng nhập xong quay lại đúng PO);
  hạn = thời điểm giao + hạn giai đoạn (G2 thẩm định / G3 duyệt mua, giờ làm việc, cấu hình hạn giai đoạn); quá hạn → khẩn (🔴, lên đầu).
- Mã việc ổn định: `EO<id>-L<lần trình>-THAMDINH|DUYET`, `EO<id>-THEMSAUBH` — trình lại sau khi sửa = việc mới = có thông báo lại.
- Người nhận: mã nhân sự ETX nếu tài khoản đã liên kết, không thì Gmail đăng nhập. Duyệt mua / dòng thêm luôn đánh dấu "Giám đốc quyết" (`gd`);
  thẩm định chỉ đánh dấu khi người thẩm định có chức danh Giám đốc (Giám đốc chỉ nhận việc có dấu này).
- Luôn gửi **ảnh chụp đủ** (toàn bộ việc của mọi người): PO duyệt xong / từ chối / rút về tự biến mất ở lần gửi sau. Gửi khi: dữ liệu PO / người dùng đổi
  (sau request, bỏ qua nếu hàng chờ không đổi; lần lỗi → thử lại sau 10 phút) · cron mỗi giờ (làm mới khẩn) · nút **📤 App Nhiệm vụ** ở Đơn PO (gửi ngay).
- Lần gửi đầu tiên của app không bắn thông báo (cổng chống báo dồn); từ đó mỗi việc mới có thông báo đẩy về điện thoại người duyệt (đã cài App Nhiệm vụ).
- Chưa nạp khoá → không gửi, không lỗi; trạng thái lần gửi cuối lưu ở `app_settings` `cong_nv_state`.

## 10. Tài liệu liên quan

`CLAUDE.md`, `DEPLOY.md`, `SRS_tong_hop.md`, `nhat_ky_lam_viec.md`; ngoài repo: `../PERMISSION_SPEC.md`, `../THEO_DOI_LINH_KIEN_DAT.md`,
`../UI_GOP_2_MAN_HINH.md`.

## Cửa sổ thông tin eOffice (popup Giám đốc)

`GET /api/cua-so` (không cần đăng nhập) → Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG. Frontend `CuaSoThongTin` hiện mỗi lần mở app (và khi quay lại sau ≥ 10 phút ẩn), nút "Vào app" khoá theo `khoaNutGiay`. Lỗi / chậm / chưa có khoá → không hiện, vào app bình thường. Cùng 1 bộ mã ở mọi app hệ DVBH (bản gốc ở linh-kien-app).
