# Nhật ký làm việc — App EO mua hàng

> Mỗi đợt làm việc 1 mục, **mới nhất ở trên**: ngày, phiên bản, yêu cầu, đã làm gì, kiểm thử gì, việc còn dở. Chỉ ghi thêm, không xoá mục cũ.
> Không ghi tài khoản, mật khẩu, khoá hay mô tả lỗ hổng bảo mật vào file này (repo có thể công khai).


## 27/11/2026 — v0.145: Popup PO — bấm mốc ra đúng LK, bộ lọc cột trái, sắp xếp tồn, phân trang ghim đáy, tab Tổng quát

- Yêu cầu (nguyên văn): "1. sao trong luồng quy trình hiện số, ấn vào lại không có gì. 2. chuyển các filter sang góc trái vùng tôi tô đỏ. 3. sort ưu tiên đơn còn tồn lên - đơn tồn lâu lên trước,
  rồi đến đơn tồn sl nhiều - đơn đã xong - đơn hủy 4. thanh hiện số trang trong table cố định ở góc dưới. chỉ kéo bên trong danh sách chi tiết thôi. 5. Tô màu UI chi tiết PO tiêu đề nền màu <>
  với tiêu đề UI chi tiết đơn bên trong PO (tăng kích thước lên 98%) 6. Mục tiên độ lịch sử, gom tất cả các vấn đề đang hiện bên trên vào 1 tab "Tổng quát" + bỏ tiêu đề Tiến độ lịch sử =>
  đẩy Nhật ký xử lý lên làm tiêu đề 7. Sau cột SL vi phạm thêm cột tỷ lệ hàng về % = SL về/SL đặt"
- Nguyên nhân (1): số dưới mốc là số dòng ĐÃ QUA bước (vd 285/293) nhưng bấm lại lọc dòng ĐANG DỪNG ở bước (0) → bảng trống.
- Đã làm: QuyTrinh — số dưới mốc "n đang ở" / "x/y đã qua", bấm mốc trả (ids, kieu) đang dừng → có lỗi → đã qua (KIEU_TXT); popup PO dùng lỗi tính từ 20/11 cho chấm lỗi;
  bộ lọc cột dọc trái (.qv-loc) + nút Xoá lọc; sắp xếp tồn lâu (giờ ở giai đoạn hiện tại) → tạo sớm → thiếu nhiều → xong → hủy; cột Tỷ lệ về; `.qv-scroll.lk-mode` + `.qv-lk > .tbl-wrap` cuộn,
  `.dt-trang` ghim đáy; `.qv-head.po / .don / .lk` 3 màu; `.qv-panel` 98vw × 98vh; cột phải tiêu đề Nhật ký + tab Tổng quát.
- 5W1H: Who — mọi người mở chi tiết PO. When — xem / xử lý PO. Where — popup chi tiết PO (và popup đơn đặt / mã LK cho màu tiêu đề, kích thước).
  What — bấm mốc luôn ra LK, lọc gọn bên trái, đơn tồn lên đầu, phân trang cố định, tổng quát gom 1 tab. Why — bấm số không ra gì gây hiểu lầm, popup còn rối.
  How — bấm mốc (vd G3) → cột lọc trái hiện "Bước G3 … — đang dừng / có lỗi / đã qua (n)", bảng lọc theo; bấm × hoặc "Xoá lọc" để bỏ; cột phải bấm "Tổng quát" xem ô số + cảnh báo.
- Kiểm thử: typecheck; local 1600×900: popup 98%; G3 → "đang dừng (1)" 1 LK, G2 → "đã qua (4)" 4 LK; thứ tự G8 → G6 → G3 → XONG; 13 cột có Tỷ lệ về; tiêu đề PO xanh / đơn cam; tab Tổng quát 9 ô + 3 cảnh báo.

## 27/11/2026 — v0.144: Làm gọn popup chi tiết PO

- Yêu cầu (nguyên văn): "nó rối quá. 1. fix lỗi mất chữ ở luồng quy trình 2. tiêu đề bỏ hiện thị thanh luồng quy trình. 3. UI chỉnh kích thước chiếm 95% diện tích 4. Bỏ dòng "theo dõi chính"
  5. Cho phép ấn trực tiếp vào các nút quy trình để filter trực tiếp các LK đang dừng ở bước đó. 6. bỏ note 6 bước có vấn đề về xxx/yyy đi. chỉ hiện nút xem chi tiết ở góc trên (không chiếm
  diện tích hiện thị của thanh quy trình) => thanh quy trình cũng sửa lại theo logic giao diện mới (apple) 7. Vùng table danh sách tách 3 ngày đang gộp thành 3 cột riêng, giảm khoảng cao
  hiện thị xuống cho phù hợp (text dài thì "...") => hiện tối đa 10 dòng trên 1 trang, hiện: giai đoạn: Mã lk +tên lk + SL vi phạm+ sl về/sl thiếu/sl đặt+ ngày tạo + ngày nm + ngày dk +
  ngày hàng về + kho + đối tác + ghi chú 8. ở khung table, chuyển các nút filter sang góc trái. ấn vào thì table sẽ filter theo."
- Đã làm: `QuyTrinh` (TienTrinh.tsx) bản thu gọn = chỉ đường quy trình kiểu Apple (.ttq-gon.ap) + "Xem chi tiết" nổi góc phải, tên bước 2 dòng, `onChonNut(k, ids)` trả dòng đang dừng + prop `chon`;
  EoQuickView: bỏ TienTrinhPo ở tiêu đề, bỏ "Theo dõi chính" (cả Dong / Part QuickView), lọc bảng theo mốc, cột bảng mới, 10 dòng / trang, dòng 34px 1 dòng chữ (.qv-lk), thanh bảng lọc trái /
  thao tác phải; popup mở bằng hiện dần (không co giãn) → luôn đúng 95% × 95%.
- 5W1H: Who — mọi người mở chi tiết PO. When — xem / xử lý 1 PO. Where — popup chi tiết PO (Đơn PO, Lỗi theo PO, mọi link PO). What — popup gọn, bấm mốc lọc LK, bảng đủ cột cần, 10 dòng / trang.
  Why — popup cũ rối, mất chữ, nhiều thông tin trùng. How — bấm mốc (vd G6) → bảng chỉ LK đang ở G6 → bấm chip "Bước … ×" hoặc bấm lại mốc để bỏ; rê chuột Mã LK / SL vi phạm xem thêm.
- Kiểm thử: typecheck; local 1600×900: popup 95% × 95%, 8 tên bước không bị cắt, không còn "Theo dõi chính" / thanh luồng tiêu đề; bấm G6 → 1 LK + chip, bấm lại → 5; popup đơn đặt vẫn chạy.

## 27/11/2026 — v0.143: Lỗi theo PO — mốc 20/11, số không nhảy, dải giai đoạn thẳng hàng, gộp popup PO

- Yêu cầu (nguyên văn): "1. bug hiện thị 2. khi ấn vào các nút bên trên thì số bị thay đổi lung tung. 3. Đã chốt bỏ lỗi từ trước 20/11 rồi mà? sao lại thấy lỗi hết lại rồi?
  không lưu nguyên tắc à? 4. Khi đang xem lỗi G4, click vào PO bên dưới thì UI chi tiết đang hiện toàn bộ lk trong PO => Thực hiện nguyên tắc tất cả các table danh sách phải có
  công cụ filter. => khi đang xem lỗi giai đoạn nào => ấn vào PO có lỗi => thì chỉ hiện ds lk bị lỗi đó thôi (filter sẵn)" và "4. chúng ta đã có giao diện UI chi tiết theo PO rồi,
  sao lại sinh ra 1 giao diện chi tiết PO nữa => xem xét có thể gộp 2 UI này lại với nhau. thông tin nào chưa có ở UI cũ thì bổ sung."
- Nguyên nhân: (1) cột giai đoạn có lỗi có thêm 1 dòng số → cao hơn, căn đáy làm vòng tròn lệch khỏi đường nối; (2) ô số tính theo mọi bộ lọc kể cả của chính nó → bấm "Nội bộ" thì "Đối tác" = 0;
  (3) luật v0.128 chỉ bỏ VI PHẠM chốt trước 20/11 (AUTO:CU) — màn mới vẫn đếm ~840 lần lỗi trước 20/11 đã tự khắc phục / đã giải trình (dữ liệu thật: 679 + ~160 + 1).
- Đã làm: `LOI_TINH_TU = 2026-11-20` (routes/loiPo.ts) cho màn + `/dem` + popup PO (bo-sung trả `ben`, `nguoi_vp`, `tinh`); luật 15 CLAUDE.md + bộ nhớ;
  ô số / dải giai đoạn bỏ qua bộ lọc của chính mình; mỗi cột giai đoạn luôn đủ dòng → thẳng hàng, giai đoạn chọn = vòng + nhãn xanh;
  XOÁ popup PO riêng (PopupPo) — bấm PO / LK mở popup PO chung lọc sẵn LK dính lỗi đang lọc (`openEo(id, { loi: [ids], moTa })`), popup chung thêm ô Đáp ứng / Lỗi đối tác / Lỗi nội bộ
  + cột Lỗi gì / Ai lỗi (bảng dùng chung có lọc cột).
- 5W1H: Who — Giám đốc, quản lý, KH cung ứng. When — xem lỗi theo giai đoạn / bên / mã rồi mở PO. Where — menu Lỗi theo PO; popup PO (mọi nơi mở PO).
  What — số ổn định khi bấm lọc, chỉ lỗi từ 20/11, 1 popup PO duy nhất lọc sẵn LK dính lỗi đang xem. Why — số nhảy gây hiểu sai; lỗi cũ trước đào tạo đã chốt bỏ; 2 popup trùng gây rối.
  How — chọn G4 (dải giai đoạn / menu cấp 2) → bấm PO → popup chỉ hiện LK có lỗi G4, dòng "Đang lọc"; bấm "LK dính lỗi đang xem" để xem cả PO.
- Kiểm thử: typecheck BE + FE; local: chỉ còn lỗi mốc ≥ 20/11 (10 lần, menu khớp); bấm Nội bộ: Tổng / Đối tác / Nội bộ giữ số; ?gd=G6 → PO 3TDO-000001 mở popup chung 2/5 LK,
  có dòng "Đang lọc", 3 ô số + 2 cột mới; 8 vòng giai đoạn cùng toạ độ.

## 27/11/2026 — v0.142: Menu "Lỗi theo PO" chia menu phụ + cấp 2

- Yêu cầu (nguyên văn): "lỗi theo PO cũng chia theo các menu phụ".
- Đã làm: `nav.ts` menu gốc Lỗi theo PO có 8 menu phụ — Theo PO (cấp 2 G1–G8) · Theo linh kiện · Theo mã lỗi · Theo ai lỗi · Lỗi đối tác (cấp 2 mã 001/002/003/004/101–103…) ·
  Lỗi nội bộ (cấp 2 mã 003/005/102/104…) · Cần giải trình · Vi phạm; API `GET /api/loi-po/dem` đếm số lần lỗi cho menu (AppShell khoá "loi:…"); cấp 2 = 0 lần thì ẩn.
- 5W1H: Who — Giám đốc, quản lý, KH cung ứng. When — xem lỗi theo nhóm. Where — menu bên › Lỗi theo PO › menu phụ / cấp 2. What — bấm menu là màn đã lọc sẵn, số đếm cạnh menu.
  Why — đồng bộ cách dùng với Đơn PO / Vi phạm (menu 3 cấp, bấm là lọc). How — bấm "Lỗi đối tác" → bấm "004 · Quá ngày DK" → bảng PO chỉ còn PO dính lỗi 004; bấm lại cấp 2 để bỏ lọc.
- Kiểm thử: typecheck backend + frontend; local: /loi-po/dem khớp màn (29 / 16 / 13); Lỗi đối tác → 004 = 6 lần / 2 PO, menu sáng 2 cấp; Theo mã lỗi sáng 1 mục; Theo PO › G6 = 14 lần.

## 27/11/2026 — v0.141: Sửa nút thao tác popup PO không hiện + lọc sẵn LK có lỗi + dọn nốt giao diện Apple

- Yêu cầu (nguyên văn): "1. fix nốt các vấn đền còn sót 2. các nút thao tác trong UI chi tiết PO ấn vào không hiện nút nào" · "3. danh sách lỗi, ấn vào sẽ filter sẵn các lk có lỗi trong PO đó".
- Nguyên nhân (2): v0.140 thêm kính mờ (`backdrop-filter`) cho tiêu đề popup PO / tiêu đề bảng → phần tử cha có backdrop-filter thành "khung chứa" của `position: fixed`
  → menu "⋯" (MenuXo) và hộp lọc cột (DataTable) bị đặt lệch và bị khung cuộn popup cắt → bấm không thấy gì.
- Đã làm:
  - (2) MenuXo + hộp lọc cột render qua `createPortal(document.body)`; menu kiểu kính trắng.
  - (3) `openEo(id, { loi: true })` + nút "⚠ Chỉ LK có lỗi (n)" trong popup PO; tự bật từ cột lỗi Đơn PO / "Mở PO đầy đủ"; ô "Lỗi chờ GT", cảnh báo lỗi, tab Lỗi → nút "Xem các LK có lỗi".
  - (1) bỏ viền 1px / 2px quanh khối (khối có nền → bỏ viền; khối không nền → nền xám #f5f5f7; khung bảng → vòng 0 0 0 1px; ô đang chọn → vòng cam), bo góc nhỏ 6–8 → 8–10 (24 file),
    chữ đậm 800–900 → 700 (24 file), ô số Việc của tôi thành ô KPI, màu cột lỗi Đơn PO đồng bộ (đối tác cam, nội bộ tím).
- 5W1H: Who — mọi người dùng popup PO / Đơn PO. When — mở chi tiết PO, xử lý lỗi. Where — Đơn PO (cột Vi phạm, Lỗi đối tác / nội bộ), popup PO (nút ⋯, thanh tab Linh kiện, ô Lỗi chờ GT, tab Lỗi), Lỗi theo PO.
  What — nút thao tác dòng hiện lại; bấm vào lỗi là thấy ngay các LK có lỗi. Why — thao tác dòng bị chặn hoàn toàn; tìm LK có lỗi trong PO nhiều dòng mất thời gian.
  How — bấm ô lỗi ở Đơn PO → popup đã lọc; bấm nút "⚠ Chỉ LK có lỗi" (có ×) để bật / tắt.
- Kiểm thử: typecheck; local 1440px: bấm ô lỗi Đơn PO → popup lọc 3/3, menu ⋯ hiện 9 mục đúng vị trí, bấm "Lịch sử theo dõi" mở hộp thoại; tab Lỗi → "Xem các LK có lỗi" → tab Linh kiện đã lọc;
  PO 5 dòng: lọc 4 / tắt 5; 375px Việc của tôi không tràn ngang.

## 27/11/2026 — v0.140: Chuyển toàn bộ giao diện app sang phong cách Apple (skill giao-dien-apple)

- Yêu cầu (nguyên văn): "chuyển đổi toàn bộ giao diện app sang skill apple đang lưu".
- Đã làm (đổi chỗ dùng chung để cả app đổi theo, không vá từng màn):
  - `theme.css`: token mới (nền #f5f5f7, chữ #1d1d1f, màu hệ thống iOS, bóng mềm, bo 20) giữ tên biến cũ; vàng thương hiệu → cam "đang chọn / đang lọc", link → xanh #0071e3.
    Nút viên thuốc, ô nhập nền xám không viền + vòng xanh khi focus, thẻ không viền, bảng tiêu đề kính mờ + dòng kẻ mảnh + cột đang lọc nền cam nhạt,
    tab popup PO thành tab viên thuốc (đang chọn nền đen), hộp lọc cột kính mờ, segmented `.seg` + `.ptabs`, chuyển động mở popup, điện thoại Modal → bottom-sheet.
  - Font: bỏ font web Be Vietnam Pro, dùng font hệ thống (-apple-system / SF / Inter / Segoe UI).
  - `AppShell`: menu bên kính mờ sáng (mục chọn nền xanh chữ trắng, icon xanh nét mảnh), thanh trên kính mờ. `ui.tsx`: Modal (phủ mờ, bo 22, tiêu đề kính mờ, nút đóng tròn),
    Popover, WidgetCard, KpiCard (ô biểu tượng kiểu icon iOS), StatTile, Avatar. `ChonNhieu` + lọc cột `DataTable`: kính mờ, đang lọc vòng cam.
  - 332 mã màu Tailwind gắn cứng trong 36 file → màu hệ thống iOS cùng nghĩa; bỏ 4 viền màu dày (Tổng quan, Điều hành, Quản lý); 2 nhóm "tab vàng" (PO tồn CEO, Vi phạm) → segmented iOS.
- 5W1H: Who — mọi người dùng. When — từ bản v0.140. Where — toàn bộ app web + điện thoại. What — đổi vẻ ngoài, không đổi chức năng / dữ liệu / quyền.
  Why — Giám đốc chốt phong cách Apple cho mọi giao diện. How — dùng như cũ; ô lọc đang lọc có vòng cam + nút × cam, nút chính màu xanh.
- Kiểm thử: typecheck + build; local 1440px: Tổng quan, Đơn PO, popup PO, form giải trình cả PO, Vi phạm; 375px: Tổng quan, menu bên, không tràn ngang.
- Còn dở: các màn còn kẻ viền 1px quanh ô con trong trang (style viết tay từng màn) — sửa dần khi đụng tới từng màn.

## 27/11/2026 — v0.139: "Lỗi theo PO" theo demo đã duyệt — popup PO luồng ngang + thẻ trên điện thoại

- Yêu cầu (nguyên văn): "tạo 1 fiel html giao diện để tôi đánh giá trước" → đã tạo demo `../demo-loi-theo-po.html` (ngoài repo, dữ liệu giả lập) → "Giữ như demo".
- Đã làm: bấm PO / linh kiện ở màn Lỗi theo PO mở popup mới (`pages/loiPo/PopupPo.tsx`): luồng ngang G1–G8, 6 ô số, bảng linh kiện, "▾ Xem chi tiết" nhật ký,
  nút "Mở PO đầy đủ" + "✍ Giải trình lỗi của PO" (GiaiTrinhDongModal). Điện thoại: bảng → thẻ, popup → bottom-sheet. Hằng số / component nhỏ tách ra `lib/loiPo.tsx`.
- 5W1H: Who — Giám đốc, quản lý, KH cung ứng. When — xem 1 PO cụ thể từ màn Lỗi theo PO. Where — menu Lỗi theo PO › bấm 1 dòng (web + điện thoại).
  What — 1 popup nhìn ngay PO đang ở giai đoạn nào, lỗi ở giai đoạn nào, từng linh kiện lỗi gì / ai lỗi; giải trình ngay tại đó. Why — Giám đốc duyệt bản demo, popup PO cũ nhiều tab khó đọc.
  How — bấm 1 PO → xem luồng ngang (đỏ "!" = giai đoạn có lỗi) → "▾ Xem chi tiết" xem nhật ký → "✍ Giải trình lỗi của PO" (nếu còn lỗi chờ) hoặc "Mở PO đầy đủ".
- Kiểm thử: typecheck + build; local 1440px: mở popup 3TDO-000001, xổ nhật ký, mở form giải trình chung (đè lên popup), đóng; 375px: thẻ, bottom-sheet, không tràn ngang.

## 27/11/2026 — v0.138: Popup đơn hàng có lại đủ thao tác (Sửa SL đặt…) — nút "✎ Sửa đơn ▾"

- Yêu cầu (nguyên văn): "phiên gần đây tôi có yêu cầu sửa UI chi tiết, nhưng AI đã làm mất hết các chức năng trên UI. ví dụ chức năng sửa lại số lượng đặt không thấy đâu cả. check lại toàn bộ"
- Rà toàn bộ thay đổi giao diện v0.129 → v0.137: không thao tác nào bị xoá. v0.131 chỉ bỏ 3 tab trùng nhật ký (PO: Quy trình duyệt, Mail & push; đơn hàng: Trao đổi NCC) —
  nội dung vẫn ở khu "Tiến độ · lịch sử" bên phải. Thiếu thật: popup **đơn hàng** không có Sửa SL đặt / ghi chú / ID CRM, Thay mã tương đương, Duyệt / Từ chối dòng thêm sau BH
  (chỉ có trong nút ⋯ của dòng ở popup PO).
- Đã làm: thêm nút **✎ Sửa đơn ▾** trên thanh công cụ popup đơn hàng (Sửa SL đặt / ghi chú / ID CRM · Sửa mã LK / kho / đối tác — chuyển từ nút cũ vào đây · Thay mã tương đương);
  thêm Duyệt dòng / Từ chối dòng khi dòng thêm sau BH đang chờ. API `GET /theo-doi/dong/:id` trả thêm các trường cần cho form sửa và quyền.
- 5W1H: Who — người tạo EO / KH cung ứng / Admin (sửa SL, thay mã), kế toán / NV đặt hàng (sửa mã-kho-NCC), người duyệt mua (duyệt dòng). When — đơn đang mở cần đổi SL,
  ghi chú, ID CRM, nhập sai mã, NCC giao mã tương đương. Where — popup Đơn hàng (bấm mã LK ở bất kỳ đâu) › nút "✎ Sửa đơn ▾". What — mở đúng hộp sửa như ở popup PO,
  lưu xong số liệu popup tự cập nhật. Why — mở chi tiết đơn không thấy nút sửa SL, phải quay về popup PO tìm nút ⋯. How — bấm "✎ Sửa đơn ▾" → chọn việc → nhập SL mới
  + lý do (EO đã ban hành bắt buộc; SL nhỏ hơn tổng kế hoạch thì tick "Tự giảm kế hoạch") → Lưu. Không có quyền → mục đó không hiện.
- Kiểm thử: typecheck xanh; chạy local, mở đơn SAC-TYPEC-25W → Sửa đơn ▾ → Sửa SL 100 → 90 + lý do → lưu được, kế hoạch tự giảm 50 → 40, popup cập nhật SL đặt 90.

## 27/11/2026 — v0.138: Màn "Lỗi theo PO" — 1 màn trả lời PO nào, lỗi gì, ai lỗi, đối tác hay nội bộ

- Yêu cầu (nguyên văn, nhận xét của Giám đốc): "Ko đạt. Lỗi đối tác vẫn ko thể dễ sử dụng 1 tí nào. 1/Thống kê theo đơn hàng --, 1s phải biết ngay mắc lỗi gì.
  Lại đi tìm mỏi mắt, xong rồi vào mục nào để biết lỗi nào lỗi đối tác, lỗi nào lỗi nội bộ? 2/Thống kê.lọc theo mã lỗi => chúng ta cần làm mọi người đơn giản hóa đi,
  hiện tại nó phức tạp quá. hãy xác định lại toàn bộ hệ thống => vấn đề cần quan tâm làm gì, tập trung nhữn gạch đầu dòng đó ra. PO đặt hàng - LK trong PO - các giai đoạn
  của PO - Lỗi theo từng giai đoạn - Ai lỗi - là lỗi Nội bộ/đối tác - số lượng đặt, số lượng về, số lượng thiếu, tỷ lệ đáp ứng - ai vi phạm, vi phạm lỗi gì, bao nhiêu lần."
- Nguyên nhân: thông tin lỗi nằm rải ở 6–7 nơi (Đơn PO › Lỗi đối tác / nội bộ, Vi phạm › theo bên / theo mã, Điều hành 8 tab), mỗi nơi đếm 1 kiểu (vi phạm gộp / dòng / PO).
- Đã làm: API `GET /api/loi-po` + màn `/loi-po` (menu gốc ngay dưới Việc của tôi): 6 ô số · dải lỗi theo giai đoạn G1–G8 (đối tác cam / nội bộ tím) · 1 bộ lọc chọn nhiều
  (bên, mã lỗi, giai đoạn, NCC, ai lỗi, trạng thái) · 4 cách xem PO / linh kiện / mã lỗi / ai lỗi · xuất Excel. Đếm theo số lần lỗi. Giao diện theo skill "giao-dien-apple".
  Các màn cũ giữ nguyên (chưa gỡ).
- 5W1H: Who — Giám đốc, quản lý, KH cung ứng (nhân viên chỉ thấy PO / lỗi của mình). When — xem tình hình lỗi bất kỳ lúc nào, họp giao ban.
  Where — menu "Lỗi theo PO". What — mỗi PO 1 dòng: giai đoạn, thiếu, đáp ứng, lỗi đối tác / nội bộ, lỗi gì, ai lỗi, cần GT / vi phạm. Why — trước phải đi 6–7 màn mới biết.
  How — nhìn 6 ô số; bấm "Lỗi đối tác" / "Lỗi nội bộ" hoặc 1 giai đoạn để lọc; đổi cách xem "Theo mã lỗi" / "Theo ai lỗi", bấm 1 dòng → các PO bị lỗi đó; bấm PO → popup chi tiết LK.
- Kiểm thử: typecheck + build; local 1440px: bảng PO, theo mã lỗi, bấm mã 004 → còn 2 PO, ô số / dải giai đoạn tính lại; điện thoại 375px: ô số 2 cột, dải giai đoạn cuộn ngang; không lỗi console.
- Còn dở: gỡ / gộp các màn trùng (Đơn PO › Lỗi đối tác / nội bộ, Vi phạm › Lỗi đối tác / nội bộ / theo mã) — chờ Giám đốc xem màn mới rồi chốt.

## 27/11/2026 — v0.137: Hiện tên người duyệt chịu lỗi chậm duyệt ở Việc của tôi ④

- Yêu cầu (nguyên văn): "sao tôi không lỗi người duyệt mua? Nguyễn Thị Phương Hoa" (dòng lỗi chỉ ghi "chậm duyệt (người duyệt)", không rõ ai chịu).
- Đã làm: API `/viec-cua-toi` trả `nguoi_duyet_r5` (họ tên người duyệt bị ghi lỗi R5); cột "Lỗi chờ" hiện "chậm duyệt — lỗi của <tên>"; Excel mục ④ thêm cột
  "Người duyệt chịu lỗi chậm duyệt". Lỗi vẫn tính cho người duyệt như v0.136 — chỉ bổ sung hiển thị.
- 5W1H: Who — người xem phạm vi tất cả / người duyệt. When — có lỗi chậm duyệt chờ giải trình. Where — Việc của tôi › ④. What — thấy tên người chịu lỗi.
  Why — trước chỉ ghi "người duyệt", nhìn như lỗi của người đặt. How — xem dòng tím dưới số lỗi; xuất Excel có cột riêng.
- Kiểm thử: typecheck + build xanh.

## 27/11/2026 — v0.136: Lỗi chậm duyệt chỉ giao cho người duyệt giải trình, tính lỗi cho người duyệt

- Yêu cầu (nguyên văn): "vi phạm cần giải trình, lỗi phê duyệt chậm thì là do người được yêu cầu phê duyệt giải trình. và tính lỗi cho người cần phê duyệt."
- Nguyên nhân: lỗi R5 lúc ghi đã gán đúng người duyệt, nhưng mục ④ "Giải trình lỗi" ở Việc của tôi lọc theo **người đặt** của dòng và đếm cả R5 →
  người đặt (KH cung ứng) thấy "chậm duyệt" và bấm giải trình bị chặn; người duyệt lại không thấy ở mục này. Dữ liệu thật: 13 lỗi R5 đang chờ đều gán đúng người duyệt — không phải sửa dữ liệu.
- Đã làm: `routes/viecCuaToi.ts` (`giaiTrinhCuaToi`): R1/R3/R4/TAY theo dòng của mình như cũ; R5 chỉ của người duyệt bị ghi lỗi (kể cả không theo dõi dòng, PO đang duyệt);
  `viecCanLam` không đếm dòng chỉ có R5 cho người đặt; giải trình R5 (`/theo-doi/giai-trinh`, `/vi-pham/giai-trinh-nhieu`) ép Do ai = NGUOI_DUYET + email người duyệt;
  form giải trình ẩn lỗi R5 của người khác, khoá "Do ai" khi giải trình R5; mục ④ dòng chỉ có R5 không tick giải trình chung (API chung không đóng R5).
- 5W1H: Who — người duyệt (thẩm định / duyệt mua / duyệt dòng thêm sau BH) giải trình và chịu lỗi; người đặt không còn thấy. When — bước duyệt quá hạn G2/G3 (mặc định 8h LV).
  Where — Việc của tôi › ④ Giải trình lỗi, Vi phạm & GT. What — lỗi chậm duyệt về đúng người duyệt. Why — người đặt không duyệt được nên không thể giải trình / chịu lỗi thay.
  How — người duyệt mở Việc của tôi → ④ → ✍ Giải trình từng dòng → chọn Lỗi gì + nội dung → Gửi (Do ai tự khoá "Người duyệt").
- Kiểm thử: typecheck + build xanh; tra D1 thật (chỉ đọc) phân bổ lỗi R5 theo người.

## 27/11/2026 — v0.135: Thu gọn giao diện các bảng Điều hành

- Yêu cầu (nguyên văn): "thu gọn giao diện" (màn Điều hành › Điểm nóng: thanh Phạm vi, hàng chip tab, dòng hướng dẫn, nút Excel, ô tìm mỗi thứ 1 hàng).
- Đã làm: bỏ hàng chip tab trên bảng → ô chọn "Bảng" đặt đầu thanh Phạm vi (menu cấp 2 vẫn chọn được); dòng hướng dẫn chuyển vào ⓘ; nút Excel nằm cùng hàng ô tìm của bảng
  (`DataTable` thêm prop `congCu`); khung bảng bớt lề. Còn 2 hàng trên bảng (Phạm vi · tìm / Excel).
- 5W1H: Who — lãnh đạo, KH cung ứng. When — xem các bảng Điều hành. Where — Tổng quan › Điều hành. What — bảng lên gần đầu màn. Why — 5 hàng công cụ chiếm chỗ trước khi thấy dữ liệu.
  How — đổi bảng ở ô chọn đầu thanh / menu cấp 2; rê chuột ⓘ xem cách sắp / cách tính.
- Kiểm thử: typecheck + build; local Điểm nóng 1600×800: 2 hàng công cụ rồi tới bảng.

## 27/11/2026 — v0.134: Điều hành — phần tổng hợp thành menu cấp 2 riêng, các mục khác hiện thẳng bảng

- Yêu cầu (nguyên văn): "mục đầu của điều hành tách menu phụ => các filter dưới sẽ bỏ đoạn đầu này và hiện luôn table liên quan đang filter".
- Đã làm: cấp 2 mới **Kết luận & sức khoẻ** (`/dieu-hanh?tab=tong`, mặc định khi mở Điều hành) = Kết luận nhanh + ô số + luồng giai đoạn. 7 cấp 2 còn lại (Trách nhiệm, Điểm nóng,
  Theo PO / người / NCC, Nguyên nhân, Duyệt treo) chỉ còn thanh Phạm vi + bảng. Bấm ô số / câu kết luận / mốc giai đoạn → mở thẳng bảng tương ứng đã lọc (chip lọc hiện trên thanh Phạm vi).
- 5W1H: Who — lãnh đạo, KH cung ứng. When — xem điều hành. Where — Tổng quan › Điều hành › cấp 2. What — tổng hợp 1 màn, mỗi bảng 1 màn. Why — trước mỗi tab vẫn phải cuộn qua
  phần tổng hợp mới tới bảng. How — mở Kết luận & sức khoẻ, bấm ô / câu cần xem → bảng đã lọc; đổi bảng ở menu cấp 2 hoặc hàng chip trên bảng.
- Kiểm thử: typecheck; local `/dieu-hanh?tab=po` không còn Kết luận nhanh, có 1 bảng; `/dieu-hanh` hiện tổng hợp; bấm "Mức ĐỎ" → `?tab=nong` lọc "Mức ĐỎ", menu sáng Điểm nóng.

## 27/11/2026 — v0.133: Tách lại Tổng quan / Điều hành thành 2 menu phụ

- Yêu cầu (nguyên văn): "chọn menu phụ nhưng báo cáo không thay đổi, nếu không thay đổi thì tách báo cáo không liên quan riêng ra menu phụ riêng".
- Nguyên nhân: ở bản gộp v0.130, menu cấp 2 (tab Điều hành) chỉ đổi phần Điều hành nằm cuối trang; phần đầu (Việc cần xử lý, Bảng điều khiển) không đổi nên nhìn như không có gì.
- Đã làm: menu Tổng quan › **Tổng quan** (`/`: việc của bạn + bảng điều khiển + xu hướng EO, không có cấp 2) · **Điều hành** (`/dieu-hanh`, cấp 2 = 7 tab, mỗi tab đổi đúng
  nội dung chính) · Báo cáo đặt LK. Tab "Xu hướng EO" về lại trang Tổng quan. Link `/?tab=…` của bản gộp tự chuyển sang `/dieu-hanh?tab=…`.
- 5W1H: Who — mọi vai trò. When — mở app (Tổng quan) / cần truy trách nhiệm (Điều hành). Where — menu Tổng quan. What — mỗi menu phụ là 1 màn, bấm là thấy đổi.
  Why — menu phụ không đổi nội dung chính gây khó hiểu. How — bấm Tổng quan › Điều hành › tab cần xem.
- Kiểm thử: typecheck + build; local `/?tab=po` → `/dieu-hanh?tab=po`, tab Theo PO sáng ở menu + trang; `/` hiện việc của bạn + bảng điều khiển + biểu đồ.

## 27/11/2026 — v0.132: Popup chi tiết vi phạm dễ nhìn · thu gọn thanh công cụ popup PO · PO tính theo giai đoạn tồn lâu nhất

- Yêu cầu (nguyên văn): "giao diện này khó nhìn quá, tiêu đề đừng tô đậm lên, tìm phương án khác dễ nhìn hơn" (popup chi tiết lỗi ở màn Vi phạm) · "thu gọn" (thanh công cụ
  tab Linh kiện của popup PO) · "1 PO có nhiều trạng thái đơn, thì khi filter theo trạng thái tồn lâu nhất, ví dụ PO có 3 đơn đặt thì 1 đơn đang đặt bù, 1 đơn chờ duyệt
  => tính theo đơn chờ duyệt. Khi lọc theo linh kiện thì mới tính đúng theo trạng thái của lk đó."
- Đã làm:
  - Chi tiết lỗi / vi phạm (`ViPham.tsx ChiTietViPham`): bỏ Modal 70% cũ (tiêu đề đậm, khung đỏ / xanh, bảng dài); dùng bố cục popup chi tiết 95% 2 khu. Đầu: tên lỗi + mức · trạng thái
    · bên chịu + nút thao tác; dòng phụ PO · LK · mã lỗi · người chịu. Khu chính: **luồng ngang của lỗi** Phát sinh lỗi → Nhắc nhở ×n → Hạn giải trình → Giải trình / Đã khắc phục /
    Vi phạm (mốc đang chờ tô cam nổi, vi phạm đỏ, chưa tới xám, bỏ qua nét đứt; rê chuột xem chi tiết), kết luận 1 câu nền nhạt, "Vì sao có lỗi" / "Cần làm gì" 2 cột,
    thông tin dòng (nhãn nhạt, giá trị chữ thường), "▾ Xem chi tiết" = các lần lỗi + lỗi khác trên LK. Khu phụ: nhắc nhở + lịch sử LK (bỏ mục giải trình trùng).
    Tiêu đề mục trong Lịch sử theo dõi chuyển chữ nhạt, không đậm.
  - Popup PO, tab Linh kiện: thanh công cụ + ô "Xem cả đơn hủy" + dòng hướng dẫn gộp 1 hàng (hướng dẫn vào ⓘ); bảng cao thêm.
  - Đơn PO: lọc cột Tiến trình + số đếm menu cấp 2 tính **mỗi PO 1 giai đoạn = giai đoạn tồn lâu nhất** (mốc sớm nhất còn dòng, `mocPo(r)[0]`). Luồng Tiến trình trên dòng
    vẫn vẽ mọi mốc. Theo LK vẫn lọc theo giai đoạn riêng từng dòng.
- 5W1H: Who — người xem lỗi / vi phạm; người lọc Đơn PO theo giai đoạn. When — bấm 1 lỗi ở màn Vi phạm; bấm menu cấp 2 giai đoạn. Where — màn Vi phạm & GT, popup PO,
  menu Đơn PO. What — nhìn 1 giây biết lỗi đang ở mốc nào; PO không bị đếm lặp ở nhiều giai đoạn. Why — popup cũ chữ đậm dày đặc, khó tìm ý chính; PO nằm ở nhiều giai đoạn
  làm số menu cộng lại lớn hơn số PO và PO chờ duyệt bị lẫn vào nhóm giao bù. How — mở lỗi xem luồng ngang + kết luận, cần thêm thì "▾ Xem chi tiết"; lọc giai đoạn bằng menu
  cấp 2 hoặc phễu cột Tiến trình; muốn theo từng dòng thì dùng Đơn PO › Theo LK.
- Kiểm thử: typecheck; local: `/api/eo/dem` tổng theo giai đoạn = 9 = số PO (trước đếm lặp); "PO cảnh báo" G3 = 2, G6 / G8 = 0, danh sách lọc khớp; popup lỗi R5 hiện luồng 4 mốc
  (Hạn giải trình đang chờ), 2 khu; popup PO thanh công cụ 1 hàng.

## 27/11/2026 — v0.131: PO tồn CEO bảng là chính · popup chi tiết chia 2 khu, bỏ tab trùng nhật ký

- Yêu cầu (nguyên văn): "1. Po tồn CEO cũng cần làm lại giao diện, ưu tiên table danh sách 2. Các giao diện UI chi tiết mở lên đang rất rối. tôi không biết phải xem
  cái gì, tăng kích thước toàn lên 95% diện tích làm việc. chia các khu vực thành các 2 khu vực, thông tin log, lịch sử, tiến độ... khu vực công theo dõi chính cần xem
  chính. 3. UI chi tiết hiện tại có nhưng tab trung với log đã có sẵn => kiểm soát và giảm bớt".
- Đã làm:
  - PO tồn CEO (`pages/CaCeo.tsx`): bỏ 2 thẻ lớn Rất hot / Giảm hot + hàng ô số + dòng giải thích dài; còn 1 thanh: Đang theo dõi / Đã xong · ô Mã CEO (có số ca) ·
    nút Rất hot / Giảm hot / Không thúc NCC 7 ngày (có số, bấm lại = bỏ) · ô tìm · Xóa lọc · số ca / PO / dòng · tải lại · Excel · chú giải ⓘ — rồi BẢNG (gộp theo ca,
    lọc / sắp xếp tiêu đề cột như cũ).
  - 3 popup chi tiết (PO, đơn hàng, mã linh kiện): mọi lớp popup = 95% màn hình (lớp chồng trước là 93%). Đầu popup chỉ còn tên + nút thao tác + 1 dòng thông tin.
    Thân chia 2 khu: **📌 Theo dõi chính** (trái, rộng) = luồng tiến trình 1 dòng (▾ Xem chi tiết) + tab + bảng; **🕘 Tiến độ · lịch sử** (phải) = số liệu, cảnh báo,
    phiếu đang chờ duyệt, nhật ký / lịch sử. Khu phải bấm "Thu gọn ⟩" thành 1 thanh dọc (nhớ trên máy) → khu chính rộng gần hết popup.
  - Bỏ tab trùng nhật ký: popup PO bỏ "Quy trình duyệt" (nhật ký nhóm Duyệt + khối "Đang chờ duyệt" ở khu phải) và "Mail & push" (nhật ký nhóm Mail & push) — còn
    Linh kiện · Kế hoạch & hàng về · Lỗi & giải trình · Tài liệu. Popup đơn hàng bỏ "Trao đổi NCC" (Lịch sử theo dõi đã có mail gửi / nhận, push, gọi / Zalo, ngày DK)
    và bỏ mục "Giải trình & vi phạm" trong Lịch sử theo dõi (trùng tab Lỗi & giải trình) — còn Chi tiết giai đoạn · Kế hoạch & hàng về · Lỗi & giải trình.
- 5W1H: Who — mọi người mở chi tiết PO / đơn hàng / mã LK; lãnh đạo + KH cung ứng xem PO tồn CEO. When — bấm 1 dòng ở bất kỳ danh sách nào; mở menu Đơn PO › PO tồn CEO.
  Where — popup xem nhanh (web, điện thoại: 2 khu xếp dọc), màn `/ca-ceo`. What — biết ngay phải xem đâu: trái = việc theo dõi, phải = diễn biến; ít tab hơn.
  Why — popup cũ đầu quá cao, 6 tab trong đó 2–3 tab lặp lại nhật ký; PO tồn CEO chiếm nửa màn bằng thẻ số. How — mở popup, xem luồng tiến trình rồi bảng ở khu trái;
  cần lịch sử thì xem khu phải (lọc nhóm / ô tìm); muốn rộng thì "Thu gọn ⟩", mở lại bằng thanh dọc "⟨ Tiến độ · lịch sử".
- Kiểm thử: typecheck + build; local 1440×900: popup PO 4 tab + 2 khu, thu gọn khu phải → khu chính 1290px, mở lại được; popup đơn hàng chồng lên = 1368×855 (95%), 3 tab,
  không còn mục Giải trình & vi phạm ở khu phải; PO tồn CEO hiện thanh + bảng.

## 27/11/2026 — v0.130: Gộp Tổng quan + Điều hành thành 1 màn "Tổng quan & điều hành"

- Yêu cầu (nguyên văn): "Gộp thành 2 màn" — trả lời câu hỏi v0.129 về 3 báo cáo Tổng quan / Báo cáo đặt LK / Điều hành (phương án: gộp Tổng quan + Điều hành, giữ Báo cáo đặt LK riêng).
- Đã làm: `/` = màn "Tổng quan & điều hành" (`pages/Dashboard.tsx`): trên cùng Việc cần xử lý của bạn + Bảng điều khiển mua hàng (tỷ lệ đáp ứng, tồn, giai đoạn),
  dưới là toàn bộ Điều hành (`DieuHanh nhung`: phạm vi người / NCC / kho, kết luận nhanh, ô sức khoẻ, luồng giai đoạn, các tab). Bỏ khối "bảng trách nhiệm lãnh đạo"
  trùng lặp (đã là tab Trách nhiệm NCC / nội bộ). Biểu đồ xu hướng EO + tỷ lệ theo trạng thái thành tab mới "📈 Xu hướng EO" (`pages/dieuhanh/XuHuongEo.tsx`).
  `/dieu-hanh` (giữ `?tab=`) tự chuyển về `/`. Menu Tổng quan còn 2 mục: Tổng quan & điều hành (cấp 2 = 8 tab `/?tab=`) · Báo cáo đặt LK.
- 5W1H: Who — mọi vai trò (lãnh đạo xem tab Trách nhiệm / Theo người; nhân viên xem việc của mình ở đầu trang). When — mở app (màn mặc định). Where — menu Tổng quan ›
  Tổng quan & điều hành. What — 1 màn thay 2: số tổng + truy trách nhiệm + xu hướng; Báo cáo đặt LK vẫn riêng để chốt số theo kỳ. Why — 2 màn cũ trùng bảng trách nhiệm,
  phải chuyển qua lại. How — cuộn xuống phần Điều hành, chọn phạm vi / bấm ô số / bấm tab (hoặc bấm tab ở menu cấp 2); link cũ tới Điều hành vẫn mở đúng tab.
- Kiểm thử: typecheck + build; local: `/dieu-hanh?tab=xu_huong` → `/?tab=xu_huong`, menu cấp 2 "Xu hướng EO" sáng, 2 biểu đồ hiện trong tab, không lỗi console.

## 27/11/2026 — v0.129: Menu 3 cấp (Tổng quan · Đơn PO · Vi phạm & GT), trang Vi phạm lấy bảng làm chính, cột Lỗi đối tác / nội bộ

- Yêu cầu (nguyên văn, rút gọn dòng): "thêm menu ở mục "Đơn PO" làm menu gốc, tách các menu phụ - Theo PO (trang hiện tại), Theo LK (gộp menu lk đặt vào đây),
  PO chờ tôi, PO tồn CEO, PO cảnh báo, Lỗi đối tác, Lỗi nội bộ, Báo cáo đẩy lên menu phụ của tổng quan "báo cáo đặt LK", Điều hành cùng thành menu phụ của
  tổng quan … trong các menu phụ cấp 1 - thêm menu phụ cấp 2 (là các giai đoạn của PO hoặc LK đó). Khi ấn và menu phụ hoặc menu phụ 2, danh sách sẽ tự filter
  theo lựa chọn đó." · "vi phạm sửa lại giao diện theo nguyên tắc table giao diện chính luôn là ưu tiên. các công cụ filter, lọc đẩy xuống table (tham khảo
  menu Đơn PO)" · "tách thành menu ở mục vi phạm & GT => logic giống đơn PO, chia nhỏ menu phụ theo các logic chính - menu phụ 2" · "Đổi tên Ca tồn CEO => PO tồn CEO"
  · "thêm menu Đơn PO => G1, G2" · "1 cột lỗi đối tác/nội bộ trong table danh sách".
- Đã làm:
  - Sidebar 3 cấp (`lib/nav.ts` + `AppShell`): menu gốc có mũi tên xổ / thu (nhớ trên máy); cấp 2 chỉ hiện dưới menu phụ đang chọn; số đếm cạnh menu phụ
    Đơn PO lấy từ `GET /api/eo/dem` (đỏ = cần làm); bấm lại mục cấp 2 đang chọn = bỏ lọc giai đoạn.
  - Tổng quan › Tổng quan · Báo cáo đặt LK (cấp 2: 3 báo cáo) · Điều hành (cấp 2: 7 tab, tab nằm trên URL `?tab=`).
  - Đơn PO › Theo PO (cấp 2: G1…G8, Đủ hàng, Từ chối, Đã hủy) · Theo LK (cấp 2: G1…G8 `?gd=`) · PO chờ tôi · PO tồn CEO (đổi tên từ "Ca tồn CEO", cấp 2: mã 201/202/203 `?ma=`)
    · PO cảnh báo (= PO có dòng ĐỎ) · Lỗi đối tác · Lỗi nội bộ. Cấp 2 các nhóm PO = giai đoạn tiến trình, chỉ hiện giai đoạn có PO; bấm → `/eo?chip=…&moc=G…` tự lọc cột Tiến trình.
  - 2 nhóm mới ở Đơn PO: "Lỗi đối tác (chưa xử lý)" / "Lỗi nội bộ (chưa xử lý)" = PO có vi phạm gộp CHƯA xử lý (cần giải trình + vi phạm hết hạn) theo bên chịu.
    Cột mới "Lỗi đối tác / nội bộ" (sau cột Vi phạm): số lỗi mỗi bên + số chưa xử lý, lọc / sắp xếp được; Excel thêm 2 cột.
  - Bên chịu tính trong JS bằng `benLoi` (`lib/maLoi.ts`, cùng luật `BEN_SQL`), gắn vào mỗi lỗi (`dsLoiDayDu` → `ben`) và đếm theo PO (`VpPo.ncc/nb/ncc_mo/nb_mo`).
  - Vi phạm & GT › Cần giải trình · Vi phạm (hết hạn) · Đã xử lý · Lỗi đối tác · Lỗi nội bộ (cấp 2 = bước / loại lỗi: G2–G3 chậm duyệt R5, G4 không thúc NCC R3,
    G5 chưa có ngày DK R1, G6 quá ngày DK R4, lỗi ghi tay) · Tổng hợp theo mã lỗi · Bảng mã lỗi.
  - Trang Vi phạm làm lại: bỏ dải thông báo, 7 thẻ số và khung lọc riêng; còn 1 thanh gọn như Đơn PO (Của tôi / Toàn bộ · ô nhóm trạng thái + cảnh báo có số đếm ·
    cách xem · ô tìm · chip lọc từ menu · số dòng · thao tác · Excel · chú giải ?) rồi BẢNG. Lọc mã lỗi / mức độ / bên chịu / người / kho / đối tác / ngày chuyển xuống
    tiêu đề cột (kiểu Excel) ở cả 4 cách xem; thêm cột Bên chịu, Kho, Đối tác.
  - `vite.config.ts`: cổng API proxy đọc biến `API_PORT` (mặc định 8790) để chạy local song song app khác.
- 5W1H: Who — mọi vai trò (nhân viên mua hàng, người duyệt, KH cung ứng, lãnh đạo). When — mỗi lần mở app tìm việc theo nhóm / giai đoạn.
  Where — thanh menu trái (web + điện thoại), màn Đơn PO, Theo LK, PO tồn CEO, Điều hành, Vi phạm. What — 1 cú bấm menu ra đúng danh sách đã lọc; cột Lỗi đối tác / nội bộ
  cho biết lỗi của PO do bên nào. Why — trước phải chọn nhóm + lọc cột tay, menu rời rạc (LK đặt, Ca tồn CEO, Điều hành nằm riêng), trang Vi phạm chiếm nửa màn bằng thẻ số
  trước khi thấy bảng. How — bấm menu gốc → menu phụ → giai đoạn; bấm lại giai đoạn để bỏ lọc; trong bảng bấm phễu tiêu đề cột để lọc thêm, "Xóa lọc" để về mặc định.
- Kiểm thử: typecheck BE + FE; chạy local (worker cổng 8791): `/api/eo/dem` trả `loi_doi_tac`, `loi_noi_bo`, `theo_moc`; Đơn PO › Lỗi nội bộ › G3 ra 4 PO = số trên menu;
  cột Lỗi đối tác / nội bộ hiện đúng; Vi phạm › Lỗi đối tác › G6 lọc đúng; Điều hành `?tab=ncc` mở đúng tab; Theo LK `?gd=G6`; không lỗi console.
- Còn dở: menu Vi phạm chưa có số đếm từng mục (dữ liệu vi phạm nặng, chỉ tải khi mở màn). Câu hỏi gộp 3 báo cáo Tổng quan / Báo cáo LK / Điều hành: đã giải thích, chờ chủ hệ thống chốt.

## 26/11/2026 — v0.128: Rà soát vi phạm bị chốt của NV KH cung ứng + bỏ toàn bộ vi phạm chốt trước đào tạo 20/11

- Yêu cầu: "1. kiểm tra xem vai trò của nhân viên tuyết có nhìn thấy các công việc bản thân cần giải trình không? các lỗi bị chốt là do tuyết không giải trình
  hay do hệ thống không đẩy sang cho tuyết giải trình." và "2. Bỏ toàn bộ vi phạm bị chốt từ trước 20/11 => tính là bỏ qua trước thời điểm đào tạo 20/11".
- Rà soát (D1 thật, chỉ đọc): tài khoản vai trò "KH cung ứng" — `canEditPlan` + `xemToanBoTheoDoi` + `duocGiaiTrinh` đều cho phép → thấy và giải trình được lỗi của mình
  (Việc của tôi, Vi phạm "Của tôi", số đỏ menu, popup nhắc). Hệ thống CÓ đẩy: từ 04/11 đến trước lúc chốt có 59 thông báo chuông (đã đọc cả 59) + 335 nhắc nhở
  "Hệ thống ghi lỗi — cần giải trình"; người dùng hoạt động thường xuyên nhưng 0 giải trình trước 18/11. Tuy nhiên 311/312 vi phạm bị chốt CÙNG LÚC 18/11 14:38:30 —
  đúng lúc tính năng tự chốt quá hạn (v0.092) lên production và áp HỒI TỐ cho lỗi mốc 01–11/11: trước đó chưa có hạn giải trình, chưa có nhắc "sắp hết hạn",
  popup nhắc (có từ v0.105, 19/11) hay thông báo đẩy (tài khoản chưa bật đẩy). Kết luận: lỗi được đẩy sang, người dùng chưa giải trình; nhưng việc "chốt" là do
  luật mới áp hồi tố, không có cảnh báo trước. Từ 18/11 16:04 đã giải trình 548 lần, hiện 0 lỗi chờ.
- Đã làm: migration `0028_bo_vi_pham_truoc_dao_tao.sql` — vi phạm `AUTO:QUA_HAN` chốt trước 2026-11-20 → `AUTO:CU` (bỏ qua, không tính vi phạm), nội dung ghi
  "chốt trước thời điểm đào tạo 20/11/2026" + giữ nội dung cũ; event `BO_VI_PHAM_CU`; tăng version `theo_doi`. Toàn hệ thống: 347 vi phạm / 3 người (311 · 28 · 8), chốt 18/11 14:38;
  giữ nguyên 1 vi phạm chốt 20/11 10:52 (mốc lỗi 09/11) vì không thuộc "trước 20/11". Lỗi mốc trước 20/11 còn chờ: 0 → không cần đổi luật tự chốt. Nhãn FE "Bỏ qua · lỗi cũ"
  nêu thêm "chốt trước đào tạo 20/11/2026".
- 5W1H: Who — người bị gán lỗi + quản lý xem màn Vi phạm / Điều hành / Ca CEO. When — áp 1 lần cho vi phạm đã chốt trước 20/11; vi phạm chốt từ 20/11 tính bình thường.
  Where — màn Vi phạm & giải trình (cột Trạng thái "Bỏ qua · lỗi cũ"), Đơn PO cột Vi phạm, Điều hành, bảng mã lỗi, API đọc. What — 347 vi phạm thành "bỏ qua",
  không tính vào số vi phạm / % / CEO; lịch sử lỗi vẫn giữ. Why — nhân viên chưa được đào tạo và luật chốt áp hồi tố không báo trước. How — tự động khi deploy, người
  dùng không phải thao tác; mở lỗi cũ thấy dòng giải thích.
- Kiểm thử: typecheck; migration chạy trên D1 local; production: 347 bản ghi ghi "đào tạo 20/11/2026", còn 0 vi phạm `AUTO:QUA_HAN` chốt trước 20/11, 1 vi phạm chốt 20/11 giữ nguyên.

## 26/11/2026 — v0.126: `POST /api/partner/theo-id` cho app Linh kiện đồng bộ ngày dự kiến sang ticket thiếu hàng

- Báo lỗi (nguyên văn): "Nhân viên báo bug: 3004022213 linh kiện này nhân viên đã cập nhật trên EO Mua hàng ngày dự kiến hàng về rồi. Nhưng trên app đặt hàng vẫn chưa có
  thông tin => kiểm tra các app liên kết xem logic nhận thông tin ngày dự kiến có bị bug không". Chốt cách sửa: "Có, EO ghi đè luôn".
- Tra D1 thật (chỉ đọc): dòng EO 9154 (PO 3TDO-000847, ID CRM `THB-000147`) có ngày dự kiến 07/12 từ 20/11; ticket THB-000147 bên app Linh kiện chỉ có ngày từ 26/11
  14:04 do Mua hàng gõ tay lại. Nguyên nhân: app Linh kiện không có đường nhận ngày từ EO (chỉ hiện khung xem). Phía EO trả dữ liệu đúng.
  Ảnh hưởng: 3 ticket THB + 39 ticket TLK đang mở trống / lệch ngày so với EO.
- Đã làm (bên này): tách lõi `GET /theo-id` thành `traTheoId`, thêm `POST /theo-id` { ids[], po_lk[] } tối đa 1000 mã / 1000 cặp. Phần ghi đè nằm ở app Linh kiện
  (v1.568, `lib/dongBoNgayEo.ts`, cron mỗi giờ).
- Kiểm thử: typecheck.

## 26/11/2026 — v0.127: Cửa sổ mở sau luôn nằm trên

- Yêu cầu (nguyên văn): "UI mở lên lại bị hiện phía sau UI cũ" (bấm 1 dòng trong danh sách chi tiết của Bảng trách nhiệm → popup đơn hàng nằm dưới danh sách).
- Nguyên nhân: cửa sổ (Modal) cố định lớp 200, popup xem nhanh cố định lớp 80+ → popup mở từ trong cửa sổ luôn bị che.
- Đã làm: lớp hiển thị theo thứ tự mở cho mọi cửa sổ và popup xem nhanh (cái mở sau nằm trên), Esc chỉ đóng lớp trên cùng; bộ lọc cột và menu ⋯ luôn nổi trên cùng.
- Kiểm thử local: Tổng quan → bảng → "> 30 ngày" → bấm dòng: danh sách lớp 210, popup 220, popup nằm trên; Esc lần 1 đóng popup, lần 2 đóng danh sách;
  chiều ngược: popup PO (210) → ⋯ → Lịch sử theo dõi (220) nằm trên; typecheck + build.

## 26/11/2026 — v0.125: Lỗi R5 "Chậm duyệt" — người duyệt trễ phải giải trình

- Yêu cầu: "Có, làm luôn" (đề xuất: thẩm định / duyệt mua / duyệt dòng sau ban hành quá 8 giờ làm việc → ghi 1 lỗi "Chậm duyệt" cho người duyệt, giải trình 16 giờ).
- Đã làm: migration 0027 (thêm quy tắc R5 vào bảng lỗi, dựng lại kèm 2 bảng con, giữ nguyên dữ liệu); ghi lỗi R5 cho đúng người đang giữ bước duyệt / dòng chờ duyệt,
  từ 27/11/2026 08:00, không ghi lùi; tự đóng khi đã duyệt / từ chối; chỉ người duyệt (hoặc Admin) giải trình; hiện ở Vi phạm / popup nhắc / số đỏ kể cả PO chưa ban hành;
  người đặt không bị tính; giải trình cả PO không đóng R5.
- Kiểm thử local (tạm dời mốc về 20/11 rồi trả lại, đã xoá dữ liệu thử): migration giữ nguyên 22 lỗi / 20 giải trình / 11 nhắc; quét ra 6 lỗi R5 (4 bước + 2 dòng sau BH)
  đúng người duyệt; màn Vi phạm hiện đủ 6 (mã ER.MH-005); giải trình lỗi người khác → READ_ONLY, lỗi của mình → lưu; PO view không gồm R5; duyệt bước → lỗi tự đóng
  "đã khắc phục"; typecheck + build.
- Ước tính production (chỉ đọc): 1 bước duyệt mua + 1 bước thẩm định đang chờ, 12 dòng sau BH chờ duyệt (1 người duyệt, cũ nhất từ 29/09) → khoảng 14 lỗi R5 từ 27/11.

## 26/11/2026 — v0.124: Bỏ duyệt dòng đã kết thúc, gom thao tác dòng vào nút ⋯, dòng chờ duyệt chưa tính lỗi

- Yêu cầu (nguyên văn): "1. đơn đã kết thúc, bỏ việc duyệt hoặc từ chối 2. hiện quá nhiều thao tác, rút gọn lại 1 nút xổ xuống hoặc click vào để mở UI đơn chi
  tiết rồi thao tác trên đó. 3. Các đơn bị quá hạn do người duyệt không duyệt này có hiện trong danh sách cần giải trình không?"
- D1 thật (chỉ đọc): 64 dòng sau BH đang "chờ duyệt", 52 dòng đã về đủ / kết thúc / hủy → chỉ 12 dòng thật sự còn cần duyệt (11 PO). 7 lỗi R1 bị ghi
  lên dòng còn chờ duyệt (PO 3TDO-000858, 24/11) — NV đã giải trình, giữ nguyên dữ liệu.
- Đã làm: điều kiện chờ duyệt chung (dòng còn mở) cho mọi nơi đếm / liệt kê + App Nhiệm vụ; popup PO ẩn Duyệt / Từ chối ở dòng đã kết thúc, nhãn "Đã về đủ · bỏ duyệt";
  cột Thao tác thành 1 nút ⋯ (xem chi tiết, ngày DK, giải trình, lịch sử, sửa, sửa mã, thay mã, kết thúc sớm, hủy), bấm dòng mở chi tiết đơn đặt; sửa lỗi máy:
  dòng chờ duyệt chưa bắt đầu tính giờ R1/R3/R4.
- Trả lời câu 3: trễ do người duyệt hiện KHÔNG vào danh sách cần giải trình — chỉ hiện ở Duyệt đang treo, Bảng trách nhiệm, App Nhiệm vụ.
- Kiểm thử local: typecheck + build; popup PO có 5 nút ⋯, menu 8 mục có chữ; API approvals/count, post-issue, viec-can-lam, eo, dieu-hanh, dashboard/quan-ly, xem bổ sung 200.

## 26/11/2026 — v0.123: Bảng trách nhiệm dễ nhìn hơn + giải thích tổng PO

- Yêu cầu (nguyên văn): "1. thiết kế hơn khó nhìn => xem lại cách thiết kế để người dùng dễ nhìn, dễ quan sát số liệu hơn 2. Tại sao tổng lại không bằng PO lỗi
  lẻ cộng lại ví dụ 26 + 12 tổng lại là 30?"
- Giải thích: 1 PO có thể có dòng ở cả 2 bên (một phần đã gửi đơn NCC, một phần chưa) → tính ở cả nhóm NCC và nhóm nội bộ, Tổng chỉ đếm 1 lần (26 + 12 − 8 = 30).
  Ca lỗi gộp theo PO nên cũng vậy. Các cột đếm theo dòng (đơn đặt, SL, tồn > n ngày) cộng khớp.
- Đã làm: tiêu đề 2 tầng theo nhóm chỉ số có màu nền; mỗi ô 1 số (căn phải, chữ số đều), phụ chỉ còn % ở Đơn đặt / SL tồn / > 30; ô xấu tô nền đỏ đậm dần theo
  mức; số 0 hiện "·"; bỏ gạch chân, rê chuột vào số có viền xanh; hàng nhóm có vạch màu (xanh NCC, cam nội bộ), hàng con thụt lề; "Đã GT" thành nhãn % màu;
  "Ai giữ" chỉ tên đầu + số (+n, rê xem đủ); cột tên cố định khi cuộn ngang; ghi chú dưới bảng số PO / ca lỗi nằm ở cả hai bên.
- Kiểm thử local: typecheck + build; đọc DOM bảng: 4 nhóm tiêu đề, 17 cột, các hàng đúng số như trước (ô trống "·").
  Chưa chụp được màn hình (khung trình duyệt đang ẩn) — xem bằng mắt trên production.

## 26/11/2026 — v0.122: Bảng trách nhiệm tồn đọng NCC / nội bộ cho CEO

- Yêu cầu (nguyên văn): "với các vấn đề CEO quan tâm, có thể tạo 1 bảng table danh sách lỗi NCC, lỗi nội bộ rồi các tính số ca PO, số đơn đặt, số linh kiện tồn,
  tỷ lệ %, số đơn tồn trên 7 ngày, 14 ngày, 21 ngày, trên 30 ngày, tỷ lệ đã giải trình, số ca còn chưa giải trình + các chỉ số nếu bạn cảm thấy CEO cần quan tâm ...
  nhìn nhanh là thấy vấn đề. có thể click vào để xem danh sách chi tiết".
- Đã làm: bảng ở đầu Tổng quan (lãnh đạo) + tab mặc định Điều hành. Hàng Lỗi NCC (từng NCC), Lỗi nội bộ (từng khâu), PO chờ thẩm định / duyệt (không cộng tổng), Tổng.
  Thêm chỉ số: quá / chưa có ngày DK, không thúc NCC 7 ngày, cấp CEO, tồn lâu nhất, ca lỗi tách NCC / nội bộ, không giải trình, ai giữ nhiều nhất. Bấm ô số →
  danh sách dòng (lọc / sắp xếp kiểu Excel, xuất Excel, bấm dòng mở popup). Backend thêm bên đang giữ + lỗi theo dòng vào /api/dieu-hanh.
- Kiểm thử local: typecheck + build; Tổng quan và Điều hành hiện bảng; bấm "> 30 ngày" ra 7 dòng; bấm hàng PO chờ duyệt ra 6 PO; console không lỗi.
- Lưu ý: dòng ở G5 / G6 / G8 nhưng hệ thống chưa ghi nhận thư gửi đơn cho NCC (thư không CC hộp theo dõi / không gắn được dòng) được tính là nội bộ
  "chưa gửi đơn NCC" — đúng luật "gửi mail chậm là lỗi nội bộ", nhưng nếu thư thật có gửi mà không đồng bộ thì cần soát cách gửi.

## 26/11/2026 — v0.121: Giải trình chọn "Do ai" theo giai đoạn, bằng chứng tuỳ chọn, báo cáo trách nhiệm Nội bộ / NCC

- Yêu cầu (nguyên văn): "Giải trình sẽ thêm mục lựa chọn do ai, thêm bằng chứng không bắt buộc. các giai đoạn sẽ đều có người chịu trách nhiệm: chờ duyệt lỗi do người
  duyệt, chờ hàng lỗi do nhà nCC, gửi hàng muộn lỗi do ncc... còn việc chậm giải trình là lỗi do không giải trình tính riêng. => chia ra việc lên PO, duyệt, gửi mail
  chậm.. là lỗi nội bộ, còn từ khi gửi mail yc đến khi hàng về chậm thì là do nhà cc".
- Bối cảnh (D1 thật, chỉ đọc): 554 giải trình thật từ 01/11 đều để Ai = Người đặt, 0 giải trình chọn nguyên nhân NCC → báo cáo "do ai" không dùng được.
- Đã làm: bên chịu theo giai đoạn (G1–G4, G7 nội bộ; G5, G6, G8 NCC; G5 đổi từ "NV đặt hàng" sang NCC); ô "Do ai" ở 4 form giải trình chia nhóm NCC / Nội bộ,
  tự gợi ý theo giai đoạn của lỗi (R1/R4 → NCC, R3 → người đặt), đổi được; ảnh / thư bằng chứng tuỳ chọn cho mọi lỗi; lỗi hệ thống mới ghi sẵn Do ai theo gợi ý;
  Điều hành › Nguyên nhân & xu hướng thêm khối "Trách nhiệm chậm trễ theo bên" (Nội bộ / NCC / Không giải trình đúng hạn tính riêng theo người); sửa chữ hướng dẫn cũ
  "bắt buộc ảnh" ở Việc của tôi, Vi phạm, Giải trình hàng loạt, Bảng mã lỗi.
- Kiểm thử local: typecheck + build; Điều hành hiện khối 3 bên; tạo lỗi R1 thử → form tự điền "Đối tác / NCC" + nhãn "Nhà cung cấp" + "G5 Chờ ngày DK — NCC chịu",
  gửi không ảnh → lỗi "Đã giải trình", ai_ma DOI_TAC, hinh_anh rỗng; đã xoá dữ liệu thử.
- Lưu ý: lỗi / giải trình cũ giữ nguyên dữ liệu; báo cáo bên chịu tính lỗi chưa giải trình theo giai đoạn nên số NCC sẽ tăng ngay cả với lỗi cũ.

## 26/11/2026 — v0.120: Đơn tồn của PO ban hành trước 21/10 cũng bị nhắc giải trình R4

- Yêu cầu (nguyên văn): "tại sao ca này chậm ngày dự kiến lâu như vậy rồi mà chưa bị tính lỗi?" (dòng 2013080056, PO 3TDO-000714) → "Có, làm luôn".
- Nguyên nhân: PO ban hành 22/09, trước mốc áp dụng quy tắc `theo_doi_ap_dung_tu` = 21/10 → dòng chỉ được theo dõi, không sinh lỗi R1/R3/R4. Bản v0.115
  ("tồn thì vẫn tiếp tục đẩy giải trình") đặt trong vòng lặp đã lọc `ap_dung` nên sót các PO 01/07 – 20/10.
- Đã làm: `danhGiaQuyTac` ghi R4 cho dòng đó từ 27/11/2026 08:00 (không ghi lùi) — quá ngày DK trước mốc → 1 lỗi `…:TON`, sau mốc → R4 thường; chỉ R4.
  Việc của tôi (mục giải trình) + số đỏ menu "Linh kiện đặt cần xử lý" tính cả dòng này khi có lỗi chờ.
- Ước tính D1 thật (chỉ đọc) trước khi làm: ~54 dòng / 10 PO / 3 người đặt, ngày DK 04/08 – 15/11 (gồm 2 dòng 2013080056).
- Kiểm thử local (tạm dời mốc sang 26/11 08:00 rồi trả lại, đã xoá dữ liệu thử): 4 dòng cũ quá ngày DK → 4 lỗi R4 `:TON`, quét lại không trùng; Việc của tôi
  hiện 4 dòng ở mục giải trình, hạn 16h LV; typecheck + build qua.
- Còn để ý: sáng 27/11 sau 08:00 kiểm số lỗi `:TON` mới trên production.

## 24/11/2026 — Tách CLAUDE.md thành bản rút gọn + CLAUDE-full.md (không đổi code)

- Yêu cầu (Trợ lý Mây theo lời Giám đốc): CLAUDE.md ~64 KB làm phiên Claude đám mây nặng bộ nhớ → rút dưới ~10 KB, chi tiết sang tệp riêng.
  Anh Thái: *"tạo riêng 1 file claude.md rút gọn cho đối tác, 1 file claude-full.md để dành cho việc lưu chi tiết các công việc sau này"*.
- Đã làm: `git mv CLAUDE.md CLAUDE-full.md` (giữ nguyên nội dung, thêm đầu đề); `CLAUDE.md` mới ~8 KB: hệ thống, lệnh, 14 luật, nguồn định nghĩa
  duy nhất, kết nối, tài liệu, mục Trợ lý Mây. Từ nay chi tiết ghi vào `CLAUDE-full.md`.
- Kiểm thử: `wc -c CLAUDE.md` = 7.978 byte. Không đổi mã nguồn, không deploy.

## 24/11/2026 — v0.119: Cửa sổ thông tin eOffice (popup Giám đốc)

**Yêu cầu (nguyên văn):** "làm luôn cho toàn bộ hệ thống app dvbh: đặt lk, đổi trả, ông thợ, vi phạm, tiếp nhận..." (+ "thêm cả muahang", "cả ccdc") — tài liệu "API Cửa sổ thông tin — dành cho app ngoài (ETX87)".

**Đã làm:** chép nguyên bộ mã mẫu từ linh-kien-app v1.556: `backend/src/lib/cuaSoThongTin.ts` + `GET /api/cua-so` (không cần đăng nhập; Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG) và `frontend/src/components/CuaSoThongTin.tsx` (gắn ở điểm render gốc, ngoài App → hiện cả màn đăng nhập, phủ trên mọi popup). Hiện mỗi lần mở app + khi quay lại sau ≥ 10 phút ẩn; nút "Vào app" khoá `khoaNutGiay` giây; Esc / Back chỉ đóng sau khi hết khoá. API lỗi / chậm / chưa đặt khoá → không hiện, vào app bình thường.

**Kiểm thử:** build 0 lỗi; sau deploy gọi `/api/cua-so` trên production trả đúng cửa sổ đang bật. Giao diện đã xem trên linh-kien-app (cùng 1 component).

**Còn dở:** đang dùng chung mã khoá với các app khác — nên xin mã riêng cho app này ở eOffice › Quản trị › Cửa sổ thông tin › Kết nối app ngoài rồi đặt lại secret `CUA_SO_KHOA`.

## 23/11/2026 — v0.118: Điều hành — thêm tab "Theo PO"

- Yêu cầu (kèm ảnh thanh tab màn Điều hành): "bổ sung tab theo PO".
- `pages/DieuHanh.tsx`: tab "📦 Theo PO (n)" ngay sau Điểm nóng — `gomPo` gom dòng đang mở theo PO (cùng phạm vi lọc người / NCC / kho), `BangPo` bảng kiểu Excel:
  PO · Mức (nặng nhất) · Người phụ trách · NCC · Kho · Dòng mở (thiếu) · Đỏ · Quá DK · Cấp CEO · Lỗi chờ GT · Tồn max (lùi DK) · Dòng không thúc 7 ng · Hoạt động cuối.
  Bấm dòng → popup PO; bấm số → Điểm nóng lọc theo PO + tiêu chí (bộ lọc `poChon`, nhãn "PO … ×", nút Xóa lọc bỏ luôn).
- Kiểm thử local (dữ liệu demo): tab hiện 2 PO, sắp đỏ trước; bấm số Đỏ của PO 3TDO-000001 → Điểm nóng còn 4 dòng của PO đó + nhãn "PO 3TDO-000001 ×".

## 23/11/2026 — v0.117: Chọn số dòng / trang cho bảng; LK đặt mặc định 8 dòng + thanh cuộn ngang trên đầu

- Yêu cầu (kèm ảnh màn LK đặt xem nhóm theo PO): "thêm lựa chọn số dòng hiện thị, 4, 8, 16..." → "ở màn hình này, mặc định cho xem 8 dòng, thanh kéo hiện top".
- `components/DataTable.tsx`: thanh phân trang có ô "n dòng / trang" (4, 8, 16, 32, 64, 128 + số mặc định riêng của bảng) cho MỌI bảng phân trang phía máy;
  hiện cả khi chỉ có 1 trang (để tăng / giảm); prop `luuSoDong` nhớ lựa chọn, `thanhTren` thêm thanh cuộn ngang trên đầu bảng (đồng bộ với thanh dưới).
- `pages/DonHang.tsx` (LK đặt): mặc định 8 dòng (trước 20), nhớ ở `sdh-so-dong`, bật `thanhTren`.
- Kiểm thử local (dữ liệu demo 7 dòng): mặc định 8 → "Hiển thị 1–7 / 7"; chọn 4 → "1–4 / 7", 2 trang; xem nhóm theo PO vẫn chia theo nhóm; tải lại vẫn giữ lựa chọn;
  kéo thanh trên → bảng cuộn ngang theo.

## 23/11/2026 — v0.116: Đẩy PO đang chờ duyệt lên App Nhiệm vụ eOffice (Cổng nhiệm vụ)

- Yêu cầu: "phân tích 2 file "api-cong-nhiem-vu" và "ket-noi-app-nhiem-vu" => xác định xem có thể thêm nút đẩy việc PO đang chờ duyệt lên hệ thống này không?
  PO tạo xong sẽ chờ duyệt, ấn nút thì việc tồn sẽ được đẩy lên kèm link của PO cần duyệt" → "Làm luôn".
- Đã làm: `lib/congNhiemVu.ts` gom việc chờ duyệt (thẩm định, duyệt mua, dòng thêm sau BH gộp theo PO) theo từng người, gửi ảnh chụp đủ lên cổng; route
  `GET/POST /api/cong-nhiem-vu`; tự gửi sau request khi hàng chờ đổi + cron mỗi giờ; nút "📤 App Nhiệm vụ (n)" ở thanh công cụ Đơn PO; đăng nhập quay lại đúng
  đường dẫn đang mở (`?next=`) để link `/eo/<id>` từ App Nhiệm vụ mở đúng PO. Khoá app nạp bằng `wrangler secret put TASK_FEED_KEY`.
- Kiểm tra D1 thật (chỉ đọc) trước khi làm: đang chờ 2 phiếu thẩm định, 1 phiếu duyệt mua, 57 dòng thêm sau BH (người duyệt mua có chức danh Tổng Giám đốc → cần
  dấu `gd`, đã gắn cho duyệt mua / dòng thêm).
- Kiểm thử: typecheck; local (dữ liệu demo, chưa có khoá) nút hiện "(6)" = 2 thẩm định + 2 duyệt mua + 2 PO có dòng thêm / 3 người, popup báo chưa nạp khoá;
  production (sau deploy, khoá đã nạp): lần gửi đầu `ok` — 3 người / 13 việc (2 thẩm định, 1 duyệt mua, 10 PO có tổng 57 dòng thêm sau BH), không người nào
  "không tra ra"; hỏi lại cổng: người duyệt mua giữ 11 dòng, đúng tag / link `/eo/<id>` / `gd` / `count`; đăng nhập `?next=/eo/288` lưu đường dẫn, `?next=//…` bị bỏ.
  Lần đầu cổng không bắn thông báo (đúng đặc tả) — thông báo đẩy sẽ có từ PO trình / chuyển bước tiếp theo.
- Còn để ý: 10 PO có dòng thêm sau BH chờ duyệt từ tháng 6–8/2026 → hiện đỏ (quá hạn) ở App Nhiệm vụ của người duyệt mua; cần người duyệt xử lý hoặc từ chối.

## 23/11/2026 — v0.115: Bỏ lỗi cũ trước 01/11 nhưng đơn tồn vẫn tiếp tục bị nhắc giải trình

- Yêu cầu: "trước 1/11 bỏ lỗi thôi, chứ tồn thì vẫn tiếp tục đẩy giải trình vi phạm và theo dõi tiếp".
- Kiểm tra D1 thật (chỉ đọc), dòng mở từ trước 01/11: chưa có ngày DK 14 dòng — 14/14 vẫn có lỗi mới từ 01/11 (R1 lặp thứ 3/6, R3 thứ 2/4) ✓; quá ngày DK 13 dòng — chỉ 9/13 có lỗi
  mới: R4 chỉ ghi 1 lần cho mỗi ngày DK, ngày DK quá từ tháng 10 → lỗi đó vừa bị bỏ (vi phạm cũ) → 4 dòng tồn không còn bị nhắc giải trình.
- Sửa `danhGiaQuyTac`: dòng quá ngày DK có hạn cập nhật trước 01/11 mà vẫn tồn → ghi thêm 1 lỗi R4 mốc `R4_TON_TU` = 24/11/2026 08:00 (khoá `…:TON`), hạn giải trình 16h LV → 25/11 17:00.
- Kiểm thử local (tạm dời mốc sang 23/11 trong code + mở mốc áp dụng ở DB local, chạy quét rồi trả lại, đã xoá dữ liệu thử): 3 dòng quá ngày DK từ tháng 10 sinh lỗi R4 `:TON` chờ giải trình.

## 23/11/2026 — v0.114: Việc của tôi — nhóm lỗi cần giải trình theo PO / mã LK + giải trình hàng loạt; sửa "dùng thư làm bằng chứng" bị server chặn

- Yêu cầu: "ở mục việc của tôi, có phép nhóm các vần đề cần giải trình theo PO hoặc mã linh kiện, vì chúng ta có chức năng giải trình hàng loạt => tận dụng tối đa".
- `pages/ViecCuaToi.tsx` `BangGiaiTrinh`: mục ④ xem Theo PO / Theo mã linh kiện / Từng dòng (nhớ lựa chọn), dòng tiêu đề nhóm (hạn sớm nhất, số dòng, số lỗi,
  nút "Giải trình cả nhóm"), ô tick từng dòng / cả nhóm / tất cả → "Giải trình chung (n dòng · n lỗi)" = `GiaiTrinhDongModal` (cùng chức năng LK đặt).
- LỖI phát hiện khi thử: v0.113 thêm ô "dùng thư NCC làm bằng chứng" nhưng 4 API giải trình ở server vẫn bắt buộc ảnh R1/R4 → luôn báo "Bắt buộc có ảnh".
  Sửa: `kiemBangChung` — nhận `dung_mail`, kiểm từng dòng có thư đồng bộ / liên hệ NCC; không có → `THIEU_THU` + thông báo rõ.
- Kiểm thử local (lỗi thử R4 trên 2 PO, mở tạm mốc áp dụng rồi trả lại, đã xoá dữ liệu thử): nhóm theo PO hiện 2 nhóm; tick tất cả → giải trình chung 2 dòng;
  dòng không có thư → báo THIEU_THU; thêm thư thử cho 1 dòng → lưu được (Ai = Đối tác / NCC, phạm vi NHIEU, nội dung kèm "[Bằng chứng: thư …]"), dòng rời mục ④.

## 23/11/2026 — v0.113: Sửa các vấn đề khi đứng vai NV đặt hàng (chờ NCC báo ngày, form giải trình, mời bật push) + bỏ vi phạm cũ trước 01/11

- Yêu cầu: "tôi kiểm tra thì công việc của tôi của đồng thị tuyết rất nhiều và bị quá hạn rất xa, nhưng không thấy nv giải trình, hãy check lại có bị bug không? …
  thử đứng với vai trò nv đó" → sau báo cáo: "fix các lỗi tìm thấy, tuy nhiên các lỗi vi phạm cũ trước tháng 11 thì bỏ qua (auto bỏ vi phạm do vi phạm cũ)".
- Kiểm tra D1 thật (chỉ đọc): NV có ~200 giải trình 18–21/11, 0 lỗi đang chờ; việc tồn = 30 dòng chưa có ngày DK + 24 dòng quá ngày DK, gần như toàn Karofi; thư Karofi
  trả lời không có ngày (trống / "CCTT" / "chờ mua hàng phản hồi" / "đang xin hình ảnh bên 3T" / "MOQ = 400"); mọi giải trình để Ai = Người đặt (mặc định form);
  898 lỗi (mốc 07/10–11/11) bị đóng "quá hạn" cùng lúc 18/11 14:00 (lần chạy đầu tự đóng, trước khi có popup / push); 0 thiết bị bật push toàn hệ thống.
  Không có bug chặn giải trình (quyền KH cung ứng đủ).
- Đã sửa: (1) "Chờ NCC báo ngày" — nút "⏳ NCC chưa có ngày" ở Việc của tôi + ô tick trong form "Ghi nhận nhắc đối tác" (thêm kênh Mail), hẹn hỏi lại ≤ 7 ngày,
  tạm dừng lỗi lặp R1 / R3, mục riêng ở Việc của tôi, không tính số đỏ / push; (2) form giải trình: Ai chịu bắt buộc chọn, gợi ý Đối tác / NCC từ thư không có ngày,
  dùng thư đã lưu thay ảnh (4 form); nhãn lỗi "trong 48h" → "đúng hạn (8h / 16h làm việc)"; (3) vi phạm cũ: mốc trước 01/11/2026 → `AUTO:CU` "Bỏ qua · lỗi cũ"
  (601 lỗi / 9 PO / 2 người trên production; 348 vi phạm từ 01/11 giữ nguyên), event `BO_VI_PHAM_CU`; (4) thẻ mời bật thông báo đẩy / hướng dẫn mở chặn.
- Migration 0026 dựng lại `tl_lien_he` (CHECK kênh có MAIL + cột hen_lai; production 0 dòng lúc chạy).
- Kiểm thử local: lỗi cũ → TU_CU (vi phạm còn 1); Việc của tôi (toàn bộ, mở tạm mốc áp dụng ở DB local rồi trả lại) bấm "⏳ NCC chưa có ngày" → form sẵn Mail + hẹn 25/11 →
  lưu → dòng sang "Đang chờ NCC báo ngày" (còn 2.7 ngày LV), ③ từ 7 còn 6 (lần đầu lỗi CHECK kênh MAIL → sửa migration dựng lại bảng); form giải trình: Ai trống, thư NCC thử
  "CCTT" → gợi ý 1 bấm điền Đối tác / NCC + NCC không phản hồi + nội dung; thẻ push hiện hướng dẫn mở chặn (trình duyệt thử đang chặn). Chưa thử được: R1 lặp / R3 bị bỏ qua
  đúng ngày thứ 2-6 thật (cần chờ lịch), bật push trên điện thoại thật. Đã xoá dữ liệu thử local.

## 23/11/2026 — v0.112: Ô tìm chung trên thanh tab cho mọi tab của popup PO / đơn hàng

- Yêu cầu: "7. chuyển công cụ tìm kiếm lên chung và dùng cho tất cả các tab có thể tìm kiếm" (ảnh: popup đơn hàng, ô trống bên phải thanh tab).
- `O_TIM` (`components/quickview/QuickView.tsx`): ô tìm ở cuối thanh tab, viền màu khi đang tìm, nút × xoá; giữ chữ khi đổi tab.
  Popup đơn hàng: Chi tiết giai đoạn (tên / vai trò / mã lỗi), Kế hoạch & hàng về (đợt + phiếu AMIS), Mã lỗi & giải trình, Trao đổi NCC (mở bảng chi tiết, "Tìm …: x / y mục").
  Popup PO: thêm Kế hoạch & hàng về, Quy trình duyệt (người duyệt / ghi chú), Tài liệu, Mã lỗi & giải trình (trước chỉ Linh kiện + Mail & push; trước đổi tab thì xoá chữ).
  `DataTable` prop `q` (ô tìm ngoài, ẩn ô tìm riêng của bảng).
- Kiểm thử: typecheck; local — popup đơn hàng MIC-IP12: gõ "push" ở tab Mã lỗi còn 3 lỗi R3, đổi sang Trao đổi NCC vẫn giữ chữ, 3 / 4 mục; popup PO 3TDO-000001:
  "cam" lọc Linh kiện còn 1 dòng, sang Kế hoạch vẫn lọc 1 dòng.

## 23/11/2026 — v0.111: Cảnh báo cấp CEO ở popup PO gọn lại

- Yêu cầu: "6. diễn giải này đang quá rối, đọc không hiểu gì" (ảnh: khung đỏ "76 dòng ở cấp CEO: Ngày dự kiến cách ngày đặt 44 ngày, chưa có hàng; 4 lỗi; …" ở popup PO).
- `routes/xemNhanh.ts` (`GET /xem/eo/:id/bo-sung`, `canh_bao`): trước nối mọi lý do của mọi dòng; nay 1 câu tóm tắt theo 3 tiêu chí CEO (từ `ceo_chi_tiet`):
  "n dòng cấp CEO (hệ thống tự tính): x dòng ngày dự kiến cách ngày đặt ≥ 30 ngày (xa nhất … ngày) · y dòng lùi ngày dự kiến ≥ 3 lần (nhiều nhất …) · z dòng có ≥ 3 lỗi
  (nhiều nhất … lỗi). Chi tiết từng dòng ở tab "Mã lỗi & giải trình"." Cảnh báo lỗi chờ đổi thành "n lỗi cần giải trình (còn hạn — quá hạn sẽ thành vi phạm)".
- Kiểm thử: typecheck; local gọi API popup PO (dữ liệu demo không có dòng cấp CEO nên chưa thấy câu mới trên dữ liệu thật — kiểm tra trên production sau deploy).

## 23/11/2026 — v0.110: Chỉ hết hạn không giải trình mới tính vi phạm, hạn giải trình 16h LV, gộp bước giống nhau, bảng PO cuộn trong khung

- Yêu cầu: chọn "Yes, change counting" (chỉ tính vi phạm khi hết hạn không giải trình) + "5. thời gian giải trình là 16h làm việc trước khi bị tính lỗi)"
  + "trong log gải trình chung thì cũng nhóm các bước giống nhau lại (tham khảo app dvbh)" + "4. table này hiện 4 dòng => hiện thanh kéo trái phải, lên xuống luôn hiện trên cùng"
  (bảng linh kiện popup PO). Giữ yêu cầu 3 (cấp CEO tự tính như logic cũ).
- Đếm vi phạm: `lib/baoCaoLoi.ts` `dsLoiDayDu` thêm `vi_pham` / `han_gt` / `con_gio_gt` / `so_lan_xau` (mức độ "lặp" chỉ đếm lần chưa xử lý / vi phạm), `trangThaiViPham`
  ưu tiên TU_QUA_HAN; `lib/dieuHanh.ts` VpPo thêm `vi_pham` + trạng thái VI_PHAM, `loi30.vp`; màn Vi phạm: ô "Cần giải trình" + ô mới "Vi phạm", lọc trạng thái "Vi phạm",
  cột Hạn giải trình, kết luận trong chi tiết, cột Vi phạm ở theo PO / người / mã; Đơn PO cột Vi phạm; Điều hành cột "Vi phạm 30 ng". Chữ "Người vi phạm" → "Người chịu lỗi".
  Nội dung tự đóng mới: "Tự đóng lỗi … không tính vi phạm" / "Hết hạn giải trình … → ghi nhận VI PHẠM" (bản ghi cũ giữ chữ cũ). Cấp CEO KHÔNG đổi.
- Hạn giải trình 16h LV (`hanGiaiTrinh`, `HAN_GT_16_TU` = 24/11/2026): lỗi có mốc trước đó giữ 56h — không biến lỗi đang chờ (đã hứa 56h) thành vi phạm hàng loạt.
  Lọc thô SQL tự đóng / nhắc sắp hết hạn đổi -6/-5 ngày → -1 ngày. Ngưỡng: quá lâu 24→8h, rất lâu 56→12h, Điều hành đỏ 56→12h. Văn bản 56h → 16h (màn Vi phạm, bảng mã lỗi, LK đặt, Ca CEO).
- Lịch sử theo dõi: mục Hoạt động liền nhau cùng bước (cùng người + cùng nội dung giải trình, cùng lần hệ thống tự đóng, cùng tiêu đề mail, cùng đợt push, cùng người sửa ngày DK)
  gộp 1 dòng "×n" (mới nhất đầy đủ, bấm xem các lần trước), "Hiện từng mục" / "Gộp bước giống nhau" — theo mẫu app DVBH `GiaiTrinhLichSu`.
- `DataTable` prop `khungCao`: bảng cuộn trong khung, tiêu đề dính, thanh kéo ngang thêm ở trên đầu (đồng bộ 2 chiều); popup PO tab Linh kiện dùng `max(300px, calc(95vh - 420px))`.
- Kiểm thử: typecheck + build; local: lỗi thử mốc 24/11 08:00 → hạn GT 25/11 17:00 (16h LV), "Cần giải trình", popup nhắc ghi 16 giờ; lỗi R4 cũ hết hạn → `vi_pham`;
  màn Vi phạm: 1 cần GT / 3 vi phạm; popup PO: thanh ngang trên đầu kéo bảng, cuộn dọc trong khung, tiêu đề đứng yên; Hoạt động 11 mục gộp còn 6 nhóm (×4 tự đóng, ×3 push).
  Đã xoá lỗi thử khỏi DB local. Chưa thử với PO thật nhiều dòng (327 dòng) trên production.

## 23/11/2026 — v0.109: Lịch sử theo dõi gọn + phân biệt "Cần giải trình" với "Vi phạm"

- Yêu cầu: "1. các thông tin diễn giải lịch sử đang rất rối, rút gọn lại chỉ lấy thông tin chính + nút mở rộng nếu người dùng có nhu cầu đọc chi tiết.
  2. Cần phân biệt rõ là giai đoạn cần giải trình (có hạn giải trình) - hết hạn không giải trình thì mới tính là vi phạm lỗi. => trong các log, mô tả cũng cần làm rõ
  được quan điểm này để người đọc, người bị vi phạm hiểu rõ tại sao tôi bị lỗi này" và "3. tuy nhiên các lỗi gửi sang CEO sẽ có lỗi không cần thời gian giải trình
  mà là tự tính như quá 30 ngày từ ngày tạo, hoặc mắc quá x lần lỗi... như logic cũ".
- `pages/theodoi/shared.tsx` `LichSuDong` (panel "Lịch sử theo dõi" popup đơn hàng + modal lịch sử): 2 khối — **Giải trình & vi phạm** (1 dòng / nhóm lỗi: trạng thái + quy tắc
  + ngày + hạn GT; bấm mở "Vì sao có lỗi" / "Kết luận" / người chịu / mã lỗi / nội dung giải trình) và **Hoạt động** (mail, giải trình, gọi/Zalo, push, ngày DK gộp 1 dòng thời
  gian, mỗi mục 1 dòng cắt "…", bấm mở chi tiết; lọc loại chọn nhiều; 8 mục mới nhất + "Xem thêm"). Nút "▾ Xem chi tiết / ▴ Thu gọn" mở hết.
- `lib/giaiTrinh.tsx` (mới): trạng thái Cần giải trình / Đã giải trình / Đã khắc phục / VI PHẠM / Ghi khi giải trình, hạn GT = mốc + 56 giờ LV (bản sao `congGioLV`), câu
  "Vì sao" theo R1/R3/R4, câu "Kết luận". Dùng ở bảng giai đoạn (cột "Giải trình / vi phạm": n vi phạm · n cần GT · n đã xử lý, rê chuột xem lý do) và tab
  "Mã lỗi & giải trình" (cột mới "Hạn giải trình", "Hạn" đổi tên "Mốc lỗi"; cấp CEO ghi "tự tính — không cần" hạn GT).
- KHÔNG đổi cách đếm: số lỗi, ngưỡng CEO "≥ 3 lỗi", mức độ, màn Vi phạm vẫn đếm mọi lỗi như trước. Cấp CEO giữ logic cũ (yêu cầu 3).
- Kiểm thử: typecheck + build; local (dữ liệu demo) popup MIC-IP12: VI PHẠM 1 / Đã khắc phục 4 / Ghi khi giải trình 2, mở dòng R4 hiện đúng "Vì sao… 31/10/2026 đã qua…"
  + "Hết hạn giải trình 11/11/2026 12:00 (56 giờ làm việc)… → ghi nhận VI PHẠM"; tab Mã lỗi hiện cột Hạn giải trình; console không lỗi. Chưa có dữ liệu demo lỗi đang trong hạn.
- Còn mở: có đổi cách ĐẾM (chỉ tính vi phạm khi hết hạn không giải trình — màn Vi phạm, ngưỡng CEO "≥ 3 lỗi", mức độ, Điều hành) hay không — chờ chủ hệ thống chốt.

## 20/11/2026 — v0.108: Hiện rõ ID case / ID đặt hàng ở chi tiết đơn + API trả kết quả mua hàng cho app linh kiện

- Yêu cầu: "việc dở liên quan đến việc dựa vào ID case và ID đơn hàng để trả kết quả về bên app linh kiện" và "2. là UI chi tiết đơn hiện thị thiếu
  thông tin ví dụ ID case, ID đơn hàng => khi mở 1 đơn đặt linh kiện A không biết đơn đó đặt cho ID nào".
- Dữ liệu thật (đọc D1): 9.205 dòng EO, 882 dòng có ID CRM, 852 dòng có ID đặt hàng; ô ID đặt hàng lẫn 3 kiểu (`DDH-…` mã đơn app linh kiện, `TLK-00…`
  ticket thiếu hàng, `TLK-<hex>` mã cũ từ Sheet — không còn tồn tại bên app linh kiện); có dòng ghi ticket `TLK-…` vào ô ID CRM; 67 ô có dấu nháy / 2 mã 1 ô.
  App linh kiện: 321 ticket đã ghi mã EO `3TDO-…`.
- UI: popup EO tách cột "Ca / ghi chú" (cắt 120px) thành 3 cột **ID case**, **ID đặt hàng** (không cắt, lọc được) và **Ghi chú**; popup đơn hàng thêm
  "ID case … · ID đặt hàng …" ở đầu dòng thông tin; popup mã LK thêm cột "ID case · ID đặt hàng" (bỏ "Ca …" khỏi cột ghi chú).
- API `GET /api/partner/theo-id?ids=&po_lk=` (khoá `DOC_API_KEY`) — xem TONG_HOP_LOGIC mục 9. App linh kiện v1.543 gọi API này (khung "Mua hàng (EO)").
- Công cụ: `scripts/do-sql-api.mjs` đo số dòng D1 từng câu SQL của API trên fixture demo; tách fixture `scripts/demo-d1-seed.mjs` dùng chung với
  `scripts/demo-d1.mjs` (bộ đo sức tải 19/11, nay đưa vào Git cùng `bao-cao-demo-d1.mjs`; thêm `external: node:*` để build được sau khi có Web Push).
  Đo nhanh polling `/api/viec-can-lam` (năm 5): ~10.300 dòng / lượt, chủ yếu 4 câu đếm (AMIS chưa khớp, EO nháp theo người tạo, dòng chờ duyệt sau BH,
  lỗi chờ GT) — CHƯA tối ưu, để đợt sau.
- Kiểm thử: typecheck + build; local (Miniflare, fixture 1 năm + dữ liệu thử): ticket `TLK-001254` khớp 2 dòng (1 dòng ghi đúng ô, 1 dòng ghi nhầm ô ID CRM),
  case `b1467882` khớp không phân biệt hoa thường, ô `" DDH-008172 TLK-001254"` tách đúng, cặp `3TDO-000002~LK-0017` khớp, mã lạ vào `khong_khop`,
  thiếu tham số → 400; lần gọi thứ 2 đọc 28 dòng D1. Sau deploy gọi thử API thật bằng mã có sẵn trong dữ liệu.

## 20/11/2026 — v0.107: Việc của tôi thêm Ngày dự kiến, SL đặt, Xuất Excel từng mục

- Yêu cầu: "chỗ này thêm cột kho, và ngày dự kiến đã điền (nếu có), số lượng đặt + xuất file excel của mỗi 1 phân loại" và "Tiếp nhận việc đang dở và thực hiện nốt (đóng và bỏ lỗi từ trước tháng 4/2026)".
- `pages/ViecCuaToi.tsx`: bảng 4 mục thêm cột **Ngày dự kiến** (đợt gần nhất; "chưa có" nếu chưa điền; dòng phụ "NCC dd/mm" khi ngày NCC cam kết khác) và **SL đặt**
  (cột Kho đã có từ v0.106 — bản đang chạy thật trước đó là v0.105 nên chưa thấy). Mỗi mục có nút **⬇ Xuất Excel** xuất đúng các dòng của mục.
  Mục ③ bỏ dòng phụ "ngày DK cũ" (trùng cột mới). API `/viec-cua-toi` đã trả sẵn các trường, không đổi backend.
- Việc dở (đóng PO trước 04/2026): kiểm lại D1 thật — 0 dòng còn mở, 0 lỗi `tl_loi` của PO ban hành trước 04/2026; commit kèm script SQL đã chạy.
- Kiểm thử: typecheck + build; local với 2 dòng giả: cột Kho "KHN", Ngày DK "chưa có" / "15/11/2026" + "NCC 14/11/2026", SL đặt 30, nút Xuất Excel chỉ hiện ở mục có dòng.
  Chưa bấm tải file Excel thật.

## 20/11/2026 — Dữ liệu: đóng toàn bộ PO tồn ban hành trước 04/2026 (không đổi code, không deploy)

- Yêu cầu: "check trên mua hàng, các mã PO , đơn hàng tồn từ trước tháng 4/2026 => đóng kết thúc toàn bộ" và "2. các lỗi, vi phạm liên quan đến các PO đơn hàng tồn trước tháng 4/2026 cũng loại bỏ".
- Phạm vi: PO `ISSUED` có `issued_at < 2026-04-01` (403 PO / 3.752 dòng). Còn mở 272 dòng / 98 PO: 11 dòng về 1 phần, 261 dòng chưa về; không dòng nào chờ duyệt sau BH.
- Đã làm: chạy `scripts/dong_po_truoc_2026-04_2026-11-20.sql` lên D1 thật — đúng quy tắc **Kết thúc sớm cả PO** (`POST /eo/:id/ket-thuc-som`): về 1 phần → SL đặt = SL đã về,
  cắt kế hoạch từ đợt xa nhất (xoá 5 đợt, giảm 5 đợt); chưa về → SL 0 + `CANCELLED_LINE`; đánh dấu `ket_thuc_som_*` (lý do "Đóng PO tồn ban hành trước 04/2026…"), ghi event_log
  `KET_THUC_SOM` ×272, `KET_THUC_SOM_PO` ×98, `DELETE_PLAN`/`UPDATE_PLAN` ×5; tính lại khớp AMIS cho các mã phê duyệt có dòng bị huỷ; tăng version `eo`, `amis` (cache + đồng bộ DVBH tự chạy lại).
  Người thực hiện ghi là tài khoản quản trị bootstrap. Sao lưu `eo_item` / `item_plan` trước khi chạy ở thư mục cha `_backup_dong_po_truoc_t4/` (không đưa lên Git).
- Lỗi / vi phạm: `tl_loi`, `tl_nhac_nho`, `tl_giai_trinh` của các PO này = 0 bản ghi (mốc `theo_doi_bo_qua_truoc` = 2026-07-01 đã loại PO ban hành trước 07/2026 khỏi theo dõi) → không cần xoá gì; dòng đã đóng cũng không phát sinh lỗi mới.
- Kiểm thử (D1 thật): còn 0 dòng mở của PO trước 04/2026; 272 dòng có SL đặt = SL đã về theo AMIS (lệch 0); 0 lỗi vi phạm.

## 20/11/2026 — v0.106: Thêm cột "Kho" ở màn Việc của tôi

- Yêu cầu: "ở màn hình việc của tôi, bổ sung thêm cột “kho”".
- `pages/ViecCuaToi.tsx`: bảng của cả 4 mục (nhập ngày DK, push NCC, quá ngày DK, giải trình) thêm cột **Kho** giữa Linh kiện và Nhà cung cấp, hiện mã kho rút gọn
  (`<Kho>` — rê chuột xem tên đầy đủ) như các màn khác. API `/viec-cua-toi` đã trả sẵn `kho`, không đổi backend.
- Kiểm thử: typecheck; local với 1 dòng giả: cột Kho hiện "KHN" đúng vị trí.

## 19/11/2026 — v0.105: Quét mỗi giờ, nhắc sắp hết hạn giải trình, thông báo đẩy, popup khi mở app

- Yêu cầu: làm tương tự app linh kiện — *"Hệ thống tự quét mỗi giờ. Ca quá hạn sẽ báo đích danh người phải giải trình, và nhắc lại khi còn 6 giờ là hết
  hạn giải trình. đẩy qua thông báo, khi mở sẽ hiện popup nhắc nhở."* Chủ hệ thống chọn làm cả thông báo đẩy (app này trước chỉ có chuông trong app).
- Đã làm: cron mỗi giờ gọi `danhGiaQuyTac`; nhắc 1 lần / lỗi khi còn ≤ 6 giờ làm việc tới hạn giải trình (56h LV) — chuông + nhắc nhở hệ thống + đẩy;
  lỗi mới cũng đẩy; dựng Web Push (bảng `push_subscriptions`, khoá VAPID riêng, service worker, nút Bật/Tắt đẩy ở chuông); popup khi mở app
  (`GET /api/vi-pham/nhac-cua-toi`). Migration 0025 (`tl_loi.nhac_het_han_luc`, `push_subscriptions`). Thêm `viewport-fit=cover` ở `index.html`.
- Kiểm thử (local): typecheck 0 lỗi; popup hiện 2 lỗi / 1 dòng sắp hết hạn (khung đỏ, hạn + giờ còn lại); hàm nhắc chỉ nhắc lỗi còn ~4 giờ LV (không nhắc
  lỗi còn 30 giờ), gọi lần 2 không nhắc lại, chuông + nhắc nhở đúng nội dung. Chưa thử: cron thật, nhận thông báo đẩy trên điện thoại (cần deploy + bấm bật đẩy).

## 19/11/2026 — v0.104: Cột Vi phạm ở Đơn PO + màn "Việc của tôi"

- Yêu cầu: "trong danh sách đơn PO, thêm cột trạng thái vi phạm của PO (CEO hay mấy vi phạm, đang chờ giải trình...)" và "2. Với vai trò 1 nhân viên,
  làm sao tôi xác định được việc cần làm, như vào đâu để thêm ngày dự kiến trước khi bị tính lỗi, vào đâu để push mail nhắc nhở? đơn giản dễ hiểu,
  nhìn cái hiểu phải làm gì luôn".
- Cột **Vi phạm** (Đơn PO): `lib/dieuHanh.ts` `viPhamTheoPo` (trong `tomTatTheoPo`, ghi nhớ ≤ 5 phút) dùng `dsLoiDayDu` + khoá `vp_khoa` như màn Vi phạm
  (cả dòng đã đóng) + số dòng đang cấp CEO → `vp { tt, tong, cho, da_gt, tu_dong, ceo, cao }`. `routes/eo.ts`: cột lọc / sắp `vi_pham`, chip `po_ceo`.
  FE thay cột "Lỗi chờ GT" (chỉ dòng mở) bằng cột Vi phạm; Excel thêm 6 cột vi phạm.
- Màn **Việc của tôi** (`/viec-cua-toi`, menu đầu tiên, số đỏ = việc LK cần xử lý): `routes/viecCuaToi.ts` + `pages/ViecCuaToi.tsx` — 4 mục có hạn
  "Còn / Trễ … giờ làm việc" và 1 nút: ① nhập ngày dự kiến (mở form NgayHangVeModal) · ② push NCC thứ 2/4 gom theo NCC (✉ Soạn mail Gmail điền sẵn
  CC theodoimuahang@gmail.com + tiêu đề mã PO + bảng mã LK, 📋 chép nội dung cho Outlook, 📞 Đã nhắc gọi/Zalo) · ③ quá ngày DK nhập ngày mới ·
  ④ giải trình (hạn tự đóng). Việc cần xử lý "Linh kiện đặt cần xử lý" trỏ về màn này. Hướng dẫn HTML người đặt hàng thêm hộp "Mỗi sáng mở Việc của tôi".
- Kiểm thử: typecheck + build; local: cột Vi phạm EO-000001 = 8, EO-000008 = 7 (khớp màn Vi phạm), giả lập 1 lỗi chờ → "Chờ giải trình", lọc chọn đúng 1 PO,
  sắp `vi_pham:desc`, chip `po_ceo` (0) chạy, trả lại dữ liệu; Việc của tôi (tạm mở phạm vi theo dõi local) → 7 dòng quá ngày DK xếp theo hạn
  ("Trễ 29 ngày LV"), nút mở đúng form nhập ngày, menu số đỏ 7; trả lại cài đặt, không phát sinh lỗi / nhắc nhở. Chưa thử mục push với dữ liệu
  (hôm nay thứ 5 — chỉ hiện thứ 2/4).

## 19/11/2026 — v0.103: Mọi SLA / hạn giải trình theo giờ làm việc

- Yêu cầu: "chuyển đổi toàn bộ sla, hạn giải trình theo mốc giờ làm việc. 24h = 8h làm việc. bỏ qua CN + nửa thứ 7 = 8h + 4h".
  Chốt thêm: khung giờ T2–T6 8:00–12:00 + 13:00–17:00 (8h) · T7 8:00–12:00 (4h) · CN nghỉ; chỉ áp dụng từ nay (lỗi đã ghi giữ hạn cũ).
- Thêm `backend/src/lib/gioLamViec.ts` (`congGioLV` cộng giờ làm việc, `demGioLV` đếm giờ làm việc — tuần tròn 44h; mốc `GIO_LV_TU`).
  `congGioLamViec` (theoDoi) và `gioLamViec` (giaiDoan) chuyển sang lịch này.
- Quy đổi: R1 48h → 16h LV, nhóm Karofi/Livotec/Korihome 24h → 8h LV; R4 24h → 8h LV; SLA giai đoạn 24h → 8h, G8 168h → 56h;
  hạn giải trình (tự đóng `AUTO:QUA_HAN`) 7 ngày → 56h LV (`GIO_TU_DONG`); mức độ vi phạm chờ ≥ 3 / 7 ngày → ≥ 24 / 56h LV (`tuoi_gio`);
  Điều hành "lỗi chờ giải trình" đỏ 7 ngày → 56h LV; ca CEO rất hot / giảm hot theo hạn giải trình. Giữ theo ngày lịch: im lặng, thúc NCC 7 ngày, R3 (thứ 2/4), R1 lặp (thứ 3/6), mốc tồn.
- Chỉ áp dụng từ nay: khối đồng bộ lỗi R1 đang chờ (tính lại hạn / tự xoá) chỉ xét lỗi ghi từ `GIO_LV_TU`; lỗi cũ giữ nguyên hạn.
- Nhãn UI đổi theo (8h/16h LV, 56h LV, "giờ làm việc T2–T6 8h, T7 4h"); `gioTxt` FE quy 1 ngày làm việc = 8 giờ. Cache: `tl:goc-theo-doi:v8`,
  `rep:giai-doan:v3`, tag dòng `|gd4`; Cài đặt › SLA giai đoạn mặc định 8 / 56.
- Kiểm thử: typecheck; 13 ca thử hàm lịch (T2 10h + 8h = T3 10h; T6 16h + 8h = T2 11h; T7 tối + 8h = T2 17h; trưa 12:30 + 1h = 14:00;
  56h từ T2 8h = T3 tuần sau 12h; đếm 1 tuần = 44h; 46 tuần = 2.024h); local: dòng bắt đầu T7 18:09 → hạn R1 16h = T3 17:00, G5 8h = T2 17:00,
  R4 ngày DK T6 → T2 12:00; `/api/vi-pham` ngưỡng 24 / 56h LV, mức độ theo `tuoi_gio`; màn Vi phạm hiện nhãn giờ làm việc, không lỗi server.
- Còn mở: ngày lễ chưa trừ.

## 19/11/2026 — v0.101: Ô "Cấp CEO" ở màn Vi phạm đếm theo ca (khớp màn Ca tồn CEO)

- Báo: màn Vi phạm ô "Cấp CEO" = 57, màn Ca tồn CEO = 15 ca — "2 số vẫn khác nhau gây khó hiểu".
- Nguyên nhân: 2 đơn vị khác nhau — màn Vi phạm đếm VI PHẠM (chưa đóng) trên dòng cấp CEO, màn CEO đếm CA (PO + mã CEO).
- Sửa: ô đổi tên "Ca CEO đang theo dõi", số lớn = số ca đang theo dõi (cùng hàm gộp `gomCa` chuyển sang `frontend/src/lib/caCeo.ts`, dùng chung 2 màn; "Của tôi" = ca có dòng
  mình đặt); dòng phụ "n vi phạm trên các ca này" + link "Mở Ca tồn CEO →"; bấm ô vẫn lọc vi phạm như cũ. Dải tóm tắt: "x ca CEO (n vi phạm trên các ca này)".
- Kiểm thử: typecheck; local với dữ liệu giả: màn CEO "Đang theo dõi (3 ca)" = ô màn Vi phạm 3.

## 19/11/2026 — v0.100: Gộp ca CEO theo PO + mã CEO, tab riêng "Đã xong"

- Yêu cầu: "1. cảnh báo cấp CEO cũng gom vi phạm 2. Các ca lỗi CEO đã xong, tab riêng tab nhỏ trong tab CEO để tránh loãng."
- 1 ca CEO = 1 PO + 1 mã CEO (ER.MH-201 / 202 / 203) — giống gộp vi phạm (PO + quy tắc). Độ hot ca: mọi dòng đã xong → Đã xong; có dòng rất hot → Rất hot; còn lại Giảm hot.
- Backend: `lib/caCeo.ts` `khoaCa` / `gomCaCeo`, `demTheoMuc` đếm `{ ca, dong, po }`; API đọc `/api/partner/ca-ceo` thêm `so_ca`, `ca` (kèm `item_ids`);
  Bảng mã lỗi đếm 2xx theo ca; số đỏ menu "Ca tồn CEO" = số ca (PO × loại lý do).
- Màn Ca tồn CEO: tab "🔥 Đang theo dõi" + tab nhỏ "⚪ Đã xong"; ô số theo ca (kèm số PO / dòng LK); bảng nhóm theo ca (tiêu đề ca bấm thu gọn), dòng có nhiều mã
  ghi "dòng này còn ở ca …"; Excel thêm cột Ca / Mức của ca.
- Số liệu thật (trước deploy, tính từ API đọc): 364 dòng → 18 ca = 3 rất hot · 12 giảm hot · 3 đã xong (nhiều dòng đã về đủ nằm trong PO còn dòng thiếu nên ca vẫn mở).
- Kiểm thử: typecheck; local với dữ liệu giả (7 dòng → 4 ca, đổi tab, nhóm, ghi chú dòng nhiều mã); API local 200.

## 19/11/2026 — v0.099: Sửa bug màn Ca tồn CEO trắng trang

- Báo lỗi: "bug: vào màn ceo bị trắng xóa".
- Nguyên nhân: cache trình duyệt (v0.097) còn dữ liệu Ca CEO của bản trước (mức TON_DONG / BO_QUA_GT / DA_XU_LY); v0.098 đổi mức thành RAT_HOT / GIAM_HOT / DA_XONG
  → `MUC[r.muc_xu_ly]` undefined → lỗi "reading 'nen'" → React gỡ cả cây → trắng trang. Tái hiện được ở local bằng cách ghi cache kiểu cũ.
- Sửa: (1) cache trình duyệt gắn phiên bản app (`pb`), khác phiên bản → bỏ; (2) màn Ca CEO chịu giá trị mức lạ (`mucCua`); (3) khung bắt lỗi `components/KhungLoi.tsx`
  bọc mọi màn — lỗi hiển thị → thông báo + nút "Xoá cache & tải lại", menu vẫn dùng được.
- Kiểm thử: typecheck + build; local: cache kiểu cũ → màn hiện bình thường; cache hỏng hẳn → hiện khung lỗi thay vì trắng trang.

## 19/11/2026 — v0.098: Ca CEO theo độ hot (rất hot / giảm hot / đã xong)

- Yêu cầu: "cấp CEO: 1. Đơn đã xong (không còn tồn hàng chờ) => bị tính lỗi CEO nhưng hàng đã về nên không còn hot 2. Đơn chưa xong (vẫn còn tồn hàng chờ và lỗi
  ghi nhận > 7 ngày hoặc đã giải trình bù) => … đang giảm hot 3. Đơn chưa xử lý (vẫn còn tồn hàng chờ và lỗi ghi nhận <=7 ngày vẫn chưa giải trình bù) => … đang
  rất hot. vì 7 ngày là ngày chúng ta chốt việc tự động bỏ qua việc giải trình các ca cũ".
- `lib/caCeo.ts`: thay 3 mức v0.097 bằng RAT_HOT (còn thiếu + lỗi chờ giải trình — luôn ≤ 7 ngày vì quá 7 ngày hệ thống tự đóng) · GIAM_HOT (còn thiếu + lỗi
  > 7 ngày tự đóng / đã giải trình bù) · DA_XONG (về đủ / kết thúc sớm). Thêm ca ĐÃ ĐÓNG từng chạm ngưỡng CEO (tính lại 3 ngưỡng: lùi ≥ 3, ngày DK cách ngày đặt
  ≥ 30, ≥ 3 lỗi; chỉ dòng áp dụng quy tắc; bỏ dòng hủy). Màn Ca tồn CEO + API đọc theo 3 mức mới.
- Kiểm thử: typecheck + build; API local trả đủ 3 mức; số liệu thật kiểm tra sau deploy qua API đọc.

## 19/11/2026 — v0.097: Ca tồn CEO chia 3 mức xử lý + tăng tốc mở app (cache trình duyệt / server, tách mã, nút Tải lại)

- Yêu cầu: "với đơn vi phạm CEO, tôi cần tách được đơn CEO nhưng các vi phạm vẫn chưa được xử lý => … trong 150 ca này bao nhiêu ca vẫn đang tồn đọng, bao nhiêu
  ca đã xử lý xong hoặc được giải trình rồi => nó sẽ có độ hot khác nhau dễ phân biệt" + "2. khi mở app muahang lên tốc độ load rất chậm. => xem lại logic load dữ liệu,
  nếu dữ liệu không có gì thay đổi thì hạn chế việc phải load lại mỗi lần mở web. có thể tìm phương án lưu cache không? + thêm nút load báo cáo thủ công nếu cần".
- Ca tồn CEO (`lib/caCeo.ts` `dsCaCeoXuLy`, dùng chung `/api/ca-ceo` + API đọc `/api/partner/ca-ceo` thêm `muc_xu_ly`, `ly_do_xu_ly`, `dem`): 🔴 TỒN ĐỌNG (còn lỗi chờ GT /
  quá ngày DK / trễ chưa có ngày DK / ≥ 7 ngày không tác động) · 🟠 BỎ QUA GIẢI TRÌNH (hết vi phạm đang chạy nhưng lỗi bị tự đóng do quá 7 ngày, chưa từng giải trình
  thật) · 🟢 ĐÃ XỬ LÝ (đã giải trình / khắc phục, chỉ chờ hàng). Màn: 3 ô lớn (số ca, PO, %) bấm lọc, cột "Mức xử lý" + lý do, sắp nóng trước, Excel.
- Tốc độ: đo D1 (`wrangler d1 insights` 1 ngày) — truy vấn nhanh, chậm do file JS 1,5MB + ~9 API lúc mở, mỗi API giải nén / tính lại báo cáo.
  · Cache trình duyệt `lib/cacheTrinhDuyet.ts`: lưu query đọc vào IndexedDB (theo tài khoản, ≤ 3 ngày), nạp TRƯỚC khi vẽ → hiện ngay, tải mới ở nền.
  · Tách mã từng màn (`React.lazy`): JS ban đầu 1.530KB → 255KB (gzip 461 → 83KB); thư viện Excel chỉ tải khi cần.
  · Server: `cachedReport` nhớ chuỗi JSON đã giải nén trong isolate theo tag (không đọc lại payload D1 / gunzip); `/dashboard/quan-ly` cache theo giờ (`dash:quan-ly:v1`).
  · Nút **⟳ giờ dữ liệu** trên thanh trên cùng: xoá cache trình duyệt + tải lại ngay mọi dữ liệu đang hiện. Đăng xuất xoá cache.
- Kiểm thử: typecheck + build; local mở Tổng quan lần 1 2,5 giây → lần 2 (có cache) 0,4 giây; màn Ca tồn CEO 3 mức + nút Tải lại không lỗi trang.

## 18/11/2026 — v0.096: Chụp lại ảnh hướng dẫn HTML theo tên giai đoạn mới

- Yêu cầu: "Chụp lại" (ảnh hướng dẫn sau khi đổi tên G5 "Chờ ngày DK", G6 "Chờ giao hàng").
- Chụp lại toàn bộ ảnh `frontend/public/huong-dan/img` bằng `../huong-dan/_build/shots-v086.mjs` (dữ liệu demo, Gmail che bằng địa chỉ mẫu); sửa kịch bản ảnh 12 bấm mốc "Chờ giao hàng".
- Kiểm thử: soát ảnh Điều hành (khung G6 Chờ giao hàng) và popup đơn hàng (bảng giai đoạn G5 Chờ ngày DK / G6 Chờ giao hàng).

## 18/11/2026 — v0.095: Đối tác của PO, giải trình hàng loạt, R1 lặp thứ 3 / thứ 6, đổi tên giai đoạn

- Yêu cầu: "1. 1 đơn PO sẽ thêm 1 cột đánh giá đặt hàng cho đối tác nào… nhiều đối tác khác nhau => Nhiều đối tác… 2. Cho phép giải trình PO hàng loạt cho riêng
  đối tác Karofi… filter danh sách đối tác karofi => ấn nút giải trình hàng loạt => hiện UI các lỗi cần giải trình => tích chọn để giải trình hàng loạt. 3. Mốc giải
  trình 24h/48h chưa có ngày dự kiến sẽ đẩy lại vào mỗi thứ 3 thứ 6 hàng tuần. (nếu đã có ngày dự kiến thì thôi… thêm giải trình tự động đã có ngày dự kiến)"
  + "4. đổi tên Giai đoạn "Có ngày dự kiến" => "Chờ ngày DK", "Chờ sản xuất & giao" => "Chờ giao hàng"".
- (1) Đơn PO: cột **Đối tác** (`doi_tac_po` ở `routes/eo.ts`, cache `eo:ds-v3`): mọi dòng hiệu lực cùng 1 đối tác → tên, khác nhau → "Nhiều đối tác"; lọc chọn nhiều, Excel.
- (2) Nút **Giải trình hàng loạt** ở Đơn PO (`pages/eo/GiaiTrinhHangLoat.tsx`): lấy MỌI PO đang lọc (mọi trang) → vi phạm chờ giải trình (gộp) → tab theo loại lỗi →
  tick → `GiaiTrinhNhieuModal` (giải trình chung cùng loại).
- (3) **R1 lặp lại**: đã trễ 24h/48h mà vẫn chưa có ngày DK → mỗi thứ 3 / thứ 6 sau hạn ghi lại 1 lỗi R1 (khoá `R1:<dòng>:<ngày>`, vi phạm gộp = PO + ngày),
  tính từ `app_settings.r1_lap_tu` (mặc định 2026-11-18, không hồi tố). Có ngày DK → dừng ghi + lỗi đang chờ tự giải trình "đã có ngày dự kiến" (đã có từ v0.092).
  Đồng bộ R1 theo mốc hiện tại chỉ áp lỗi R1 đầu tiên. Production lúc làm: 105 dòng / 14 PO đang trễ chưa có ngày DK.
- (4) Đổi tên giai đoạn G5 "Chờ ngày DK", G6 "Chờ giao hàng" (backend `lib/giaiDoan`, mã lỗi, FE, cấu hình hạn, hướng dẫn — ảnh hướng dẫn cũ còn tên cũ).
- Kiểm thử: typecheck + build; local: dòng thử không có kế hoạch → R1 ghi lại 03/06/10/13/17-11 (thứ 3/6), cũ > 7 ngày tự đóng; nhập ngày DK → 2 lỗi chờ tự giải trình
  "đã có ngày dự kiến"; Đơn PO cột Đối tác (1 tên / Nhiều đối tác), Giải trình hàng loạt hiện vi phạm của PO đang lọc; dọn dữ liệu thử.

## 18/11/2026 — v0.094: Cột "Ngày đặt hàng" trong file Excel danh sách linh kiện

- Yêu cầu: "file tải excel trong danh sách linh kiện mua hàng thêm ngày đặt hàng" + "ngày đặt hàng chính là ngày PO được duyệt".
- Định nghĩa: Ngày đặt hàng = ngày PO được duyệt mua (ban hành, `eo.issued_at`); dòng thêm sau ban hành = ngày dòng đó được duyệt (`post_issue_approved_at`);
  chưa duyệt / PO chưa ban hành → trống.
- Popup PO › "Tải danh sách linh kiện" (`xuatDongEo`): thêm cột cạnh "Ngày ban hành". LK đặt: trường `ngay_dat_hang` (backend `xayDongSdh`, đổi hậu tố
  cache theo dòng `|gd3` để dựng lại), cột chọn được "Ngày đặt hàng" (lọc từ – đến), file Excel luôn có cột này (chèn sau Mã phê duyệt nếu đang ẩn).
- Kiểm thử: typecheck; local tải 2 file thật (bắt nội dung file) — EO-000008: 2 dòng trước BH = 13/10/2026 (ngày duyệt mua), dòng sau BH chờ duyệt = trống;
  LK_dat.xlsx có cột ở vị trí 2.

## 18/11/2026 — v0.093: Gộp vi phạm theo PO + loại lỗi + kỳ

- Yêu cầu (kèm ảnh popup EO-000014 "Mã lỗi & giải trình (1332)"): "tại sao 1 ca lại có nhiều lỗi như vậy? có hợp lý không? nếu cùng 1 lỗi, trên cùng 1 PO thì
  gộp nó lại thành 1 vi phạm lỗi chung. ví dụ chưa có ngày DK của 3 / 6 đơn trên PO đó, tính 1 lần vi phạm".
- Nguyên nhân: lỗi ghi theo DÒNG × mỗi lần kiểm tra — PO 327 dòng: R1 326 bản ghi (2 mốc), R3 960 (7 ngày kiểm tra), R4 46 (12 mốc) = 1.332.
  Toàn hệ thống 1.731 bản ghi = 113 vi phạm nếu gộp (R1 27, R3 55, R4 31).
- Quy tắc gộp (`lib/maLoi.ts` `khoaViPham` / `VP_SQL`): R1 = 1 PO · R3 = PO + ngày kiểm tra · R4 = PO + ngày DK bị quá · TAY = PO + lỗi gì + ngày ghi.
  `tl_loi` vẫn ghi theo dòng; đếm / hiển thị / giải trình theo vi phạm. Trạng thái vi phạm: còn dòng chờ → chờ; có giải trình thật → đã giải trình; còn lại tự đóng.
- Áp dụng: `lib/baoCaoLoi` (`vp_khoa`, `gomViPham`, `trangThaiViPham`; `tongHopTheoMa` đếm vi phạm + `so_ban_ghi`), Bảng mã lỗi, Vi phạm (1 hàng = 1 vi phạm,
  cột "Số dòng", nút Giải trình của vi phạm nhiều dòng = giải trình chung; thẻ số / theo PO / theo người / theo mã đếm vi phạm), popup PO + đơn hàng (bảng mã lỗi
  gộp; 2xx gộp theo mã, 3xx gộp theo bước; tab ghi "n vi phạm"; nút Giải trình cả PO đếm vi phạm), Điều hành (`vp_cho` theo dòng → ô "Vi phạm chờ giải trình",
  theo người, theo PO, lỗi 30 ngày, độ phủ giải trình; cache `dh:goc:v2`), API (`tong_vi_pham`, `vi_pham` mỗi lỗi).
- Kiểm thử: typecheck + build; local: 3 dòng R3 cùng PO cùng ngày → 1 vi phạm (3 dòng), 2 dòng R1 cùng PO khác hạn → 1 vi phạm; popup PO 12 bản ghi → 4 vi phạm;
  màn Vi phạm / popup / Điều hành không lỗi trang.

## 18/11/2026 — v0.092: Bảng mã lỗi + hệ thống tự giải trình lỗi đã khắc phục / quá 7 ngày

- Yêu cầu: "1. tôi cần 1 bảng mã lỗi chi tiết, có giải trình, diễn giải và số lượng lỗi đang đếm. 2. Việc giải trình sẽ không cần thiết nữa nếu lỗi đó đã bị
  ghi nhận và quá 7 ngày không giải trình (tính vi phạm rồi) hoặc cùng lỗi đó, đã có giải trình gần nhất rồi. ví dụ không push mail tuần 1 - tuần 2, tuần 3
  đã push mail hoặc giải trình => tuần 1,2 không cần giải trình nữa cho đỡ rách => tự động giải trình luôn (dạng "auto giải trình vi phạm do lý do...)";
  làm rõ: "mục 1. ý là mô tả mã lỗi đó tên là gì, lỗi gì.. chứ không phải thông tin giải trình chi tiết của từng lỗi".
- (1) Màn **Bảng mã lỗi** (`/ma-loi`, menu con của Vi phạm, `pages/BangMaLoi.tsx`): mỗi mã ER.MH — nhóm, bước, tên + lỗi gì, yêu cầu giải trình, tự giải trình khi nào,
  số đang đếm (0xx/1xx: tổng · chờ · đã giải trình · tự đóng do khắc phục · tự đóng do quá 7 ngày; 2xx: dòng đang cấp CEO; 3xx: dòng đang trễ bước), "Xem lỗi", Excel.
  `lib/maLoi.ts` thêm `yeu_cau_gt` / `tu_dong`; `GET /vi-pham/ma-loi` trả thêm `dem_ceo`, `dem_gd`.
- (2) **Tự giải trình** (`tuGiaiTrinh` cuối `danhGiaQuyTac`, ≤ 10 phút/lần): lỗi R1/R3/R4 đang chờ → `tl_giai_trinh` pham_vi `AUTO`, nhóm `AUTO:KHAC_PHUC` (R3 có mail /
  push / gọi-Zalo sau ngày kiểm tra · R1 dòng đã có ngày DK · R4 đã nhập ngày DK mới > ngày bị quá · đã có giải trình thật cùng lỗi sau hạn) hoặc `AUTO:QUA_HAN`
  (quá 7 ngày từ hạn — ghi nhận vi phạm); nội dung "Auto giải trình vi phạm do …", người ghi = tài khoản hệ thống, event `AUTO_GIAI_TRINH`.
  Vẫn tính vi phạm (số lỗi, ngưỡng CEO) nhưng KHÔNG tính là giải trình thật: Điều hành (độ phủ, hoạt động cuối, giải trình gần nhất, xu hướng, nguyên nhân),
  Vi phạm (% giải trình, thẻ "Đã giải trình 7 ngày", trạng thái mới "Tự đóng"), tổng hợp theo mã, API (`giai_trinh.tu_dong`); lịch sử dòng hiện "Hệ thống · Tự giải trình".
- Đo trước trên production (chỉ đọc): 1.707 lỗi chờ → 642 đã khắc phục (R3 408, R1 234) + 948 quá 7 ngày (R3 652, R1 248, R4 48) → còn ~117 lỗi phải giải trình.
- Kiểm thử: typecheck + build; local: R3 có push sau đó → tự đóng "đã khắc phục", R3 cũ không ai xử lý → "quá 7 ngày", R3 hôm qua → vẫn chờ; event ghi "Hệ thống";
  màn Bảng mã lỗi / Vi phạm / popup không lỗi trang.

## 18/11/2026 — Bật API đọc (không đổi code)

- Yêu cầu: "Tạo khoá ngay" (khoá cho API đọc v0.091).
- Tạo khoá ngẫu nhiên, lưu ở file ngoài repo (thư mục cha, không đưa vào git), đặt secret `DOC_API_KEY` cho Worker `muahang` (`wrangler secret put`).
- Kiểm thử production: khoá sai 401; `/api/partner/ma-loi` 21 mã; `/ca-ceo` 154 dòng; `/loi/tong-hop` 1.731 lỗi (1.707 chờ giải trình) — 001: 113, 002: 433, 003: 1.116, 004: 69 — 0,36 giây;
  `/loi?ma=ER.MH-004` 69 lỗi.
- Còn mở: chủ hệ thống chọn hệ thống sẽ gọi API và chuyển khoá cho bên đó.

## 18/11/2026 — v0.091: 6 yêu cầu quản trị của lãnh đạo (mã lỗi theo bước, theo mã, Ca tồn CEO, API, trạng thái gắn bước, trao đổi NCC)

- Yêu cầu: rà 6 yêu cầu của lãnh đạo ("1. Trạng thái phải ghi rõ gắn với bước nào 2. Chưa rõ luồng trao đổi và push đối tác 3. Bảng mã lỗi từng bước đâu?
  Trong từng đơn hàng phải có bảng mã lỗi từng bước - Giải trình 4. Tổng hợp lỗi - giải trình ở 1 khu vực - theo mã lỗi - chi tiết 5. Ca tồn CEO tách riêng menu
  6. API app mua hàng có ca tồn CEO, tổng hợp lỗi - giải trình theo mã lỗi và chi tiết") → đánh giá đạt / chưa → "Làm theo đề xuất".
- Mã lỗi ER.MH trong app (theo `../MA_LOI_HE_THONG.md`): `lib/maLoi.ts` (bảng mã 001–004, 101–199 theo danh mục LOI, 201–203, 301–308; tính lúc đọc từ
  `tl_loi` — R1 tách 001/002 theo đối tác nhóm 24h + hạn sau 08/11). `lib/baoCaoLoi.ts` (danh sách lỗi đầy đủ + tổng hợp theo mã + ca CEO) dùng chung
  màn Vi phạm, Ca tồn CEO, API đọc; `/theo-doi/dong/:id` và `/xem/eo/:id/bo-sung` trả thêm `ma_loi` / `ten_ma` / `buoc`.
- (3) Tab **Mã lỗi & giải trình** ở popup đơn hàng + popup PO (`components/BangLoiTheoBuoc.tsx`): Bước · Mã · Lỗi · (Mã LK) · Hạn · Trạng thái · Giải trình,
  gồm lỗi phải giải trình, cảnh báo CEO 2xx, trễ hạn bước 3xx; nút Giải trình trên dòng.
- (4) Vi phạm: cách xem **Theo mã lỗi** (mọi trạng thái, % giải trình, nguyên nhân theo giải trình) → "Xem chi tiết"; bộ lọc Mã lỗi (chọn nhiều); cột Mã lỗi · bước.
- (5) Menu **Ca tồn CEO** (`/ca-ceo`, `routes/caCeo.ts`, `pages/CaCeo.tsx`): mã 201/202/203 + diễn giải, thúc NCC, NCC trả lời, giải trình, im lặng;
  `/canh-bao-ceo` chuyển về đây, số đỏ "Ca tồn CEO" ở menu.
- (6) API đọc `/api/partner/ma-loi`, `/ca-ceo`, `/loi/tong-hop`, `/loi?ma=&po=&trang_thai=&tu=&den=` — khoá secret `DOC_API_KEY` (chưa đặt → 503).
- (1) Đầu popup PO = luồng tiến trình (thay "Đã ban hành"), đầu popup đơn hàng = giai đoạn hiện tại (G6 · Chờ SX & giao, trễ hạn), cột "Tình trạng đơn" ở LK đặt
  có tiền tố bước (G6 · Hàng chưa về). (2) Tab **Trao đổi NCC** ở popup đơn hàng (`components/LuongTraoDoiNcc.tsx`): đường ngang 3T thúc / NCC trả lời /
  cập nhật ngày DK, tóm tắt "NCC chưa trả lời n ngày", Xem chi tiết.
- Hướng dẫn HTML: bảng mã lỗi, Vào đâu để… (4 dòng mới), người đặt hàng (trao đổi NCC, mã lỗi trong đơn), lãnh đạo (Ca tồn CEO, Theo mã lỗi, API); 4 ảnh mới.
- Kiểm thử: typecheck + build; local: bảng mã 21 mã, lỗi R1 → 002/G5, R3 → 003/G4, ghi tay NCC báo trễ → 102/G6; API đọc: khoá sai 401, chưa đặt 503,
  tổng hợp + chi tiết lọc nhiều mã đúng; 5 màn mới / tab mới mở không lỗi trang.
- Còn mở: đặt secret `DOC_API_KEY` trên production + báo hệ thống nào dùng; dữ liệu demo chưa có ca CEO nên màn Ca tồn CEO mới thử trạng thái rỗng.

## 18/11/2026 — v0.090: Bộ lọc mặc định cho chọn nhiều

- Yêu cầu: "các công vụ filter mặc định luôn cho phép tích chọn nhiều lựa chọn khi tìm kiếm. => fix lại và lưu nguyên tắc chung này lại"
  (ảnh: Đơn PO › Lọc khác › ô "ở kho…" chỉ chọn 1).
- Thêm component dùng chung `components/ChonNhieu.tsx` (checkbox, tìm không dấu, Chọn tất cả / Bỏ chọn, số đếm, viền vàng + × khi đang lọc).
- Đổi sang chọn nhiều: Đơn PO › Lọc khác (kho, đối tác, lý do PS — trước là ô chọn 1 / ô gõ tự do), LK đặt (nhóm nhanh = hợp các nhóm, giai đoạn),
  Điều hành (người phụ trách, NCC, kho), Vi phạm (mức độ, loại lỗi, người, kho, đối tác), Nhập AMIS (kho, trạng thái khớp), Báo cáo giai đoạn (kho, NCC, loại hình).
  Backend `GET /eo` và `GET /amis/receipts` nhận nhiều giá trị nối "|" (`lib/thamSo.ts`); link và bộ lọc đã lưu 1 giá trị cũ vẫn dùng được.
- Giữ chọn 1 (không phải lọc giá trị): ô Xem, khoảng ngày theo…, đúng / trễ hạn, EO áp dụng quy tắc, chờ / đã giải trình, chứng từ đã hủy,
  ETX đang làm / nghỉ, ô nhập trong form.
- Lưu nguyên tắc chung vào hướng dẫn toàn cục của chủ hệ thống (mục "Bộ lọc: mặc định cho tick CHỌN NHIỀU") + CLAUDE.md dự án.
- Kiểm thử: typecheck + build; local: `/api/eo` kho HN 5 + HCM 2 = 7 khi chọn cả hai (khớp màn Đơn PO 7 PO), AMIS khớp 4 + không khớp 0 = 4;
  LK đặt nhóm Thiếu NM + Chưa về = 4 dòng, thêm Về thiếu = 7; giai đoạn G8 = 3, G8 + G6 = 5; mở Điều hành / Vi phạm / Nhập AMIS / Báo cáo giai đoạn
  đều hiện ô chọn nhiều, mọi API trả 200.

## 18/11/2026 — v0.089: Giai đoạn hiện tại theo bước mới nhất + lọc đơn thiếu ngày / thiếu hàng

- Yêu cầu: "1. các lk này đều đã qua bước G1 rồi, fix lại lấy theo bước mới nhất. 2. Tôi muốn lọc danh sách các đơn thiếu ngày Nhà máy cam kết
  hoặc thiếu ngày dự kiến, hoặc thiếu hàng về... thì làm thế nào?"
- Nguyên nhân G1: `lib/giaiDoan.ts` đóng G1 bằng lần gửi trình ĐẦU TIÊN SAU ngày tạo dòng; production có ~2.950 dòng của PO đã ban hành không có lần
  trình nào như vậy (~2.075 dòng PO chuyển từ hệ cũ không có `eo_submission`, ~875 dòng tạo sau lần trình) → G1 không bao giờ đóng, và giai đoạn hiện
  tại lấy "bước ĐẦU TIÊN chưa đóng" nên kẹt ở G1 (trễ hạn hàng trăm ngày).
- Sửa: PO đã qua nháp thì G1 luôn đóng (lần trình đầu sau tạo dòng → lần trình đầu của PO → ngày ban hành); giai đoạn hiện tại = bước MỚI NHẤT đang
  mở. Đổi khoá cache `rep:giai-doan:v2` + hậu tố `|gd2` ở tag `dong_cache` để dựng lại mọi dòng.
- Lọc: LK đặt thêm 4 nhóm nhanh "Thiếu ngày NM cam kết", "Thiếu ngày dự kiến", "Chưa về hàng nào", "Về thiếu (chờ giao bù)" (đơn còn chờ hàng;
  link `?nhom=THIEU_NM|THIEU_DK|CHUA_VE|VE_THIEU`). Bảng dùng chung `DataTable`: phễu cột ngày / số có "Tất cả / Chưa có ngày (ô trống) / Đã có ngày"
  (`GiaTriLoc.rong`), backend `routes/eo.ts` (lọc Đơn PO phía server) khớp cùng quy ước.
- Kiểm thử: typecheck; local giả lập dòng tạo sau lần trình → trước kẹt G1, nay G8 (G1 đóng), trả lại dữ liệu; 4 nhóm mới có số đếm, lọc đúng;
  phễu "Ngày dự kiến gần nhất" Đã có 7/7 · Chưa có 0/7 (khớp nhóm Thiếu ngày DK = 0); `/api/eo` lọc `issued` trống 7 + có 2 = 9 PO.

## 18/11/2026 — v0.088: Tạm tắt "Tạo mail nhắc", chỉ tính push khi mail đã đồng bộ

- Yêu cầu: "tiếp nhận lại các công việc đang dang dở" → "hãy phân tích xem hướng nào phù hợp, nếu máy người dùng không có outlook thì sao?"
  → "tạm thời tắt tính năng này đi. để người dùng tự gửi mail thủ công".
- Phân tích: người dùng đăng nhập bằng Gmail cá nhân, nhiều máy có thể không có Outlook → bản nháp `.eml` không mở được (Gmail web không nhận .eml
  thành nháp), trình hỗ trợ cài máy cũng cần Outlook. Tạo nháp Gmail qua API cần quyền Gmail bị Google hạn chế (thẩm định bảo mật). Hướng khả thi
  khi mở lại: liên kết soạn thư Gmail (To/CC/tiêu đề/nội dung, Excel tải kèm để kéo vào) + `.eml` cho máy có Outlook; hoặc hệ thống tự gửi.
- Đã làm (gồm phần dở từ phiên trước): một đợt push gộp mọi dòng chọn + 1 Excel, popup To/CC theo đối tác (`localStorage`), bản nháp `.eml`;
  backend chỉ tính đợt push là "đã thúc" khi có mail đồng bộ khớp mã push (`lib/mailNhacDongBo.ts`, R3 / Việc cần làm / Điều hành).
  Rồi **ẩn nút "Tạo mail nhắc"** ở Đơn hàng (thanh chọn + menu Công cụ), popup PO, popup LK bằng cờ `BAT_TAO_MAIL_NHAC = false`. Nút "📞 Đã nhắc
  đối tác" giữ nguyên. Hướng dẫn HTML (người đặt hàng mục 6) đổi sang cách tự gửi mail: CC theodoimuahang@gmail.com + mã 3TDO / mã LK.
- Kiểm thử: typecheck + build; local: tick 2 dòng ở Đơn hàng chỉ còn "Giải trình chung" / "📞 Đã nhắc đối tác", menu Công cụ không còn
  "Tạo mail nhắc", không lỗi console.
- Còn mở: chọn hướng khi bật lại tính năng; repo chưa có remote `etx87`.

## 18/11/2026 — v0.087: Sửa thanh trên của hướng dẫn HTML

- Production phục vụ `/huong-dan/dat-hang.html` thành `/huong-dan/dat-hang` (Cloudflare bỏ đuôi .html) → thanh trên không gạch chân trang đang xem. `hd.js` so tên trang không đuôi.
- Kiểm thử: các trang /huong-dan/* trả 200 trên production (sau chuyển hướng), ảnh + CSS tải được.

## 18/11/2026 — v0.086: Cột Tiến trình ở Đơn PO, bộ lọc cá nhân, hướng dẫn HTML theo vai trò

- Yêu cầu: "1. Trạng thái của PO "Đã ban hành" chỉ là 1 giai đoạn => thay bằng luồng tiến trình. 2. Cho phép lưu bộ lọc cá nhân trên máy cache
  người dùng ở trạng PO => với từng vai trò, tạo tài liệu hướng dẫn chi tiết dạng html, đầy đủ hình ảnh hướng dẫn, thao tác. tạo, theo dõi, tìm kiếm,
  giải trình, xác định vấn đề tồn, vào đâu để giải trình, vào đâu để push?"
- Trước đó cùng ngày (theo yêu cầu "Chạy lại luôn"): sao lưu DB app Thư ký (`../_backup/`, ngoài repo), chạy lại xử lý 99 thư thô + đẩy lại sự kiện sang EO →
  EO thêm 306 bản ghi mail, số dòng có mail 571 → 614, lỗi R3 chờ 1.106 → 1.102 (ít hơn ước tính ~20 vì thư bảng không cột PO chạm trần 100 dòng / thư).
- Cột **Tiến trình** (`components/TienTrinhPo.tsx`): luồng ngang Lập → Thẩm định → Duyệt mua → Có ngày DK → Chờ hàng → Giao bù → ✓ Đủ hàng; PO đã ban hành
  theo số dòng đang ở từng giai đoạn (backend `tomTatTheoPo` trả thêm `gd`, `routes/eo.ts` gắn `gd` vào dòng); lọc / sắp vẫn theo trạng thái duyệt.
- **Bộ lọc đã lưu cá nhân** ở Đơn PO: nút "★ Đã lưu" (localStorage `eo-loc-luu`), ☆ đặt mặc định khi mở (`eo-loc-mac-dinh`, chỉ áp khi URL không có `?chip`).
- **Hướng dẫn HTML** `frontend/public/huong-dan/` (index + người đặt hàng / người duyệt / lãnh đạo / kho / kế toán / admin, 32 ảnh dữ liệu demo có khoanh nút),
  nút "📘 Hướng dẫn" trên thanh trên cùng. Script chụp ảnh: `../huong-dan/_build/shots-v086.mjs` (Puppeteer, local dev).
- Kiểm thử: typecheck + build; local: cột Tiến trình đúng với PO nháp / thẩm định / duyệt mua / đã ban hành có dòng sau BH chờ duyệt; bộ lọc mặc định tự áp;
  7 trang hướng dẫn tải đủ ảnh, không lỗi tải.

## 18/11/2026 — v0.085: Soát mail chưa gắn dòng + tự bỏ lỗi R3 oan

- Yêu cầu: "Soát mail chưa gắn dòng" → sau khi báo kết quả: "Sửa và xoá luôn".
- Soát (chỉ đọc, chi tiết `../QUAN_TRI_DIEU_HANH.md` mục 4): EO không mất thư nào; hộp theo dõi chỉ nhận 99 thư / tháng (19 thư bỏ đều là quảng cáo);
  11 thư thật chưa đẩy (3 thư bảng không cột PO xử lý trước tính năng quét mã LK 08/11, 8 thư chỉ ghi tên linh kiện); vài NCC lớn không có mail nào.
  141 lỗi R3 đang chờ (02/11, 04/11) là oan: dòng có mail trong kỳ nhưng lỗi ghi trước khi R3 tính mail (05/11).
- Sửa `lib/theoDoi.ts` `danhGiaQuyTac`: lỗi R3 đang chờ có `tl_mail` / `tl_lien_he` trong kỳ (`kyR3Tu`) hoặc `tl_push_item` đúng ngày → xoá + xoá nhắc nhở
  gắn lỗi + event `XOA_LOI_THEO_DOI` (lý do ghi rõ). Chạy ở lần đánh giá kế tiếp sau deploy → bỏ 141 lỗi trên production.
- Kiểm thử: typecheck; câu chọn chạy chỉ đọc trên production ra đúng 141 (46 + 95), ~3ms; local: lỗi có mail trong kỳ bị xoá + có event, lỗi không mail giữ nguyên.
- Còn mở: chạy lại xử lý thư trước 08/11 ở app Thư ký (gắn ~63 dòng, bỏ thêm tối đa ~20 lỗi R3 ngày 09/11); quy trình CC hộp theo dõi + ghi mã;
  lãnh đạo quyết 672 lỗi R3 26–28/10 (khi đó chưa có dữ liệu mail để chứng minh).

## 18/11/2026 — v0.084: Màn Điều hành cho lãnh đạo + cột cảnh báo ở Đơn PO

- Yêu cầu (nguyên văn, rút gọn): "Lãnh đạo của tôi không hài lòng với các thông tin quản trị trên app mua hàng hiện tại. rất khó quản lý và đánh giá
  nhanh kết quả mong muốn: 1. Cần xác định app mua hàng có mục đích là gì … kiểm soát được luồng tồn đọng đang ở đâu, do ai, ai đã làm gì, đã thực
  hiện quyết liệt chưa, tồn bao lâu … đã push đối tác bao nhiêu lần, tại sao vẫn tồn … 2. Các vấn đề cần quan tâm chỉ cần 3-5s là phải nhìn thấy …
  3. Các trạng thái chung của PO, linh kiện cần hiện thị ở các cột bên ngoài … 4. Các nhắc nhở, vi phạm, lỗi cần xác định theo giai đoạn … => với vai
  trò 1 vị quản lý khó tính … phân tích => đưa yêu cầu => phản biện lại … đến khi nào 1 vị CEO khó tính … cũng phải hài lòng thì báo cáo kết quả."
- Phân tích 6 vòng yêu cầu ↔ phản biện, số liệu thật (chỉ đọc) và đặc tả chốt: `../QUAN_TRI_DIEU_HANH.md`. Phát hiện chính: ~1,3% lỗi đã được
  giải trình; lỗi dồn gần hết về người lập PO do gán mặc định; form push chuẩn gần như không dùng (thúc NCC thực tế qua mail).
- Backend: `lib/dieuHanh.ts` (mức ĐỎ/VÀNG/XANH + lý do; tác động / im lặng / thúc NCC / phản hồi NCC / giải trình gần nhất theo dòng; thống kê
  giai đoạn 30 ngày theo người chịu; xu hướng tuần; tóm tắt theo PO ghi nhớ ≤ 5 phút), `routes/dieuHanh.ts` (`GET /api/dieu-hanh`,
  `POST /api/dieu-hanh/nhac-nguoi`), tách `ghiNhacNho` ở `routes/viPham.ts` dùng chung; `routes/eo.ts` gắn `dh` vào danh sách, chip
  `po_do` / `po_im_lang` / `po_loi_cho`, cột lọc / sắp `canh_bao` / `loi_cho` / `thuc` / `im_lang`.
- Frontend: `pages/DieuHanh.tsx` (menu "Điều hành" ngay dưới Tổng quan), `pages/eo/EoListInner.tsx` (4 cột mới, sắp lại cột: trạng thái / cảnh báo
  đứng ngay sau mã PO, 3 nhóm nhanh mới, xuất Excel kèm cột cảnh báo).
- Kiểm thử: typecheck + build; chạy local (dữ liệu demo) — màn Điều hành đủ khối, bấm ô / mốc / tab lọc đúng, không lỗi console; API `/eo` chip
  `po_do`, sắp `canh_bao:desc`, lọc `im_lang` ≥ 10 trả đúng; `nhac-nguoi` với người không có lỗi trả 0.
- Còn mở (cần chủ hệ thống quyết): chuyển lỗi sang người chịu thật theo giải trình; soát mail NCC không gắn được dòng (ảnh hưởng R3); báo cáo
  điều hành tự gửi mỗi sáng (app không có cron); ngày lễ trong giờ làm việc.

## 17/11/2026 — Tạo bộ tài liệu tổng hợp

- Yêu cầu: "dựa theo nguyên tắc tạo 3 file bắt buộc, rà soát toàn bộ các repo và tạo 3 file rồi đẩy lên repo etx87".
- Tạo `nhat_ky_lam_viec.md` (file này), `TONG_HOP_LOGIC.md`, `SRS_tong_hop.md`.
- Phần "Lịch sử dựng lại từ Git" bên dưới sinh tự động từ commit (bỏ commit gộp nhánh + commit tự động Workflow Mây). Từ nay ghi tay mục mới ở trên.

## Lịch sử dựng lại từ Git (98 commit, 2026-09-09 → 2026-11-17)

### 2026-11-14
- v0.083: doi khoa cache goi y dong (dm:goi-y-dong:v3) - ly do PS "Het hang" (migration 0024) hien trong o chon (`50940e6`)
- v0.082: them ly do phat sinh chuan "Het hang" (migration 0024) (`d669dc7`)

### 2026-11-13
- v0.081: dem lui ngay du kien theo tung dot - them dot giao bu khong con bi tinh la lui (`3c98e20`)
- v0.080: ghi nhan nhac doi tac khong qua mail (goi dien/Zalo/tin nhan) tinh nhu da push R3; hien so lan lui ngay DK + tung lan lui o popup don hang/PO/ma LK (`ff86222`)
- v0.079: ket thuc som (theo ma LK / ca PO) ap dung ca dong them sau BH dang cho duyet (`fa1435b`)

### 2026-11-12
- v0.078: icon app tran vien (bo vien trang + nen trong suot), them manifest + icon maskable Android (`80d0aaa`)

### 2026-11-09
- v0.077: bat buoc ly do khi huy EO va khi dat SL = 0 (huy dong) (`27e597a`)
- v0.076: ket thuc som theo ma linh kien (moi PO dang mo) - doi tac bao ngung san xuat (`4cd10d8`)

### 2026-11-08
- v0.075: dung cache theo dong chia lo theo do dai (<=45k ky tu/cau lenh, <=40 cau/batch) - lan dung dau tren production vuot gioi han D1; ghi loi dung cache (migration 0022) (`b1628cc`)
- v0.074: nhat ky gon - gop muc lien tiep cung loai/cung nguoi (x n) co mo rong, o popup PO va popup ma LK (`8d0794d`)
- v0.073: cache theo tung dong (dong_cache) - popup PO / ma LK chi doc dong can, LK dat tai tang dan (IndexedDB + seq); UI ma LK loc theo PO; bang LK popup PO loc kieu Excel, an don huy, uu tien con thieu (`1e3a1be`)
- v0.072: 2 giao dien theo ma LK - dong nhom mo UI chung (moi don cua ma), dong le mo UI le (ma trong 1 PO), chuyen qua lai 2 chieu; chung tu chua khop co link ma LK (`222a822`)
- v0.071: popup PO / don hang thu gon chi 1 dong quy trinh (~80% cho danh sach), so lieu + canh bao + van de theo buoc vao Xem chi tiet (`a1ceac3`)
- v0.070: man MISA - bam ma hang mo popup don hang (cung giao dien LK dat), bo popup ma LK rieng va link '· dong' (`063272c`)
- v0.069: quy trinh gon + hang ve nhieu dot + van de theo buoc o popup PO/don hang, bo loi giai doan truoc khi don sang giai doan sau, man AMIS lien ket nhanh + loc, sua ma LK/kho/doi tac co log, ket thuc som ca PO, trang thai DONE, sua o loc bi cat chu (`caaffa5`)
- v0.068: moc G4 bo qua mail 'van de chung' (theodoimuahang gan theo ma LK khi thu khong co ma PO) (`6731e99`)
- v0.067: doi ten Duyet cuoi -> Duyet mua, kho hien thi theo ma kho, y nghia loai hinh (cap 2), bo qua loi phat sinh sau khi hang ve, sheet Huong dan + canh bao doi tac/ly do khi import (`622c07e`)
- v0.066: ten hien thi theo ETX, Gmail phu (nhieu Gmail / 1 tai khoan), R1 24h nhom Karofi/Livotec/Korihome, chuan hoa Doi tac + 4 Ly do PS (migration 0020) (`319ca87`)
- v0.065: tang so phien ban cho ban LK dat (3 che do xem + giai trinh chung) - v0.064 da dung cho giao dien mobile (`50d3336`)
- v0.064: LK dat 20 dong/trang, 3 che do xem (tung dong / nhom theo PO / nhom theo LK), tick dong/ca nhom -> giai trinh chung (POST /vi-pham/giai-trinh-dong); sidebar 'Danh sach' (`c4dac5b`)

### 2026-11-07
- v0.064: giao dien mobile - sidebar thanh ngan keo truot, thanh tren thu gon, luoi tu gap cot, popup/modal full man hinh (`31b970b`)
- v0.063: thanh thao tac gon 1 dong cho LK dat va Don PO (doi ten Quan ly EO); Danh sach / Bao cao LK dat thanh muc con o sidebar (`837e9c5`)
- v0.062: bang kieu Excel (loc + sap xep tren tieu de cot) cho Quan ly EO va LK dat; mac dinh EO con ton / Con cho hang (`cfa5045`)

### 2026-11-06
- v0.061: chong tinh lai bao cao dong thoi (khoa computing_until trong report_cache) + dong bo DVBH cach nhau 2 phut thay 20s (`c9c3774`)

### 2026-11-05
- v0.060: Ket thuc som don dat (SL dat = SL da ve, trang thai 'Kết thúc sớm') + Huy don khong tinh SL da ve (`f15232d`)
- v0.059: R1 khong co ngay du kien 24h -> 48h lam viec + giai trinh chung nhieu loi cung loai (`cf3180f`)
- v0.058: nhan su kien XOA_LOI_THEO_DOI (Bo loi theo doi) trong lich su EO (`7879b03`)
- v0.057: R3 khong push - co mail voi doi tac cua dong (tl_mail) trong ky = da push, khong ghi loi (`ee3380a`)

### 2026-11-04
- v0.056: bo qua PO ban hanh truoc moc theo_doi_bo_qua_truoc (1/7/2026) - tinh theo ngay ban hanh PO, khong tinh vi pham (`46b70d9`)
- v0.055: man Vi pham & giai trinh + giai trinh chung ca PO + nhac nho + tien to ma EO moi MH- (`d6e972d`)

### 2026-10-31
- v0.054: dien giai ly do cap CEO + tien trinh thu gon cho tung dong linh kien (`a1cdcd4`)
- v0.053: hieu nang + nhan mail theo lo + giai trinh gop loi cung loai (`baba8f2`)
- v0.052: duong tien trinh 8 giai doan (popup EO + popup don hang moi); gom log trung khi hien thi (`bb5e1a7`)
- v0.051: man Quan ly EO gop Viec can duyet + chi tiet EO; Tong quan gon; AMIS khong EO thanh tab (`ad37bf5`)
- v0.050: man Quan ly don hang gop Theo doi LK / So don hang / Canh bao CEO / Ke hoach / 3 bao cao (`ee2ebb6`)
- v0.049: goi y ma LK / doi tac / ly do PS khi tao dong EO + bo loc theo dong (`27c338b`)

### 2026-10-30
- chore: .gitignore scripts/migrate.mjs (co email nhan vien, chi giu tren may) (`cbc866f`)
- chore: bo du lieu AMIS that (scripts/amis_rows.json) khoi git, them vao .gitignore (`0394054`)

### 2026-10-29
- v0.048: tu dong dien ngay NM cam ket tu ngay KRF dap ung khi nhan mail (dong khop chac) (`7b01a22`)
- CLAUDE.md: ghi chu Ngay KRF tu mail (v0.047) (`0b211f8`)
- v0.047: goi y Ngay nha may cam ket tu ngay "KRF dap ung" trong mail (app theodoimuahang) (`32dec06`)
- v0.046: o chon kho chi hien kho dang dung; khop AMIS uu tien dong dang hieu luc (`715760c`)
- v0.045: bao cao Giai doan don hang + khoi giai doan tren Tong quan + sua han giai doan (Cau hinh) (`c91e9f7`)
- v0.044: 8 giai doan don hang + So don hang (chon cot, bo loc day du, loc luu san), loc them Danh sach EO (`cd9b2c9`)

### 2026-10-26
- v0.043: nut Copy EO - tao EO moi tu thong tin phieu (khong chep dong linh kien) (`7d18b8f`)
- v0.042: nut Tai danh sach linh kien cua EO (Excel 37 cot) (`2f371d3`)
- v0.041: tab Ke hoach & hang ve thanh bang THEO DONG linh kien (`97fd852`)
- v0.040: o tim nhanh trong popup EO va popup ma linh kien (tung tab + nhat ky) (`d12c627`)
- v0.039: bang dieu khien quan ly - ty le dap ung thang/tuan, tra linh kien, ton dong theo moc thoi gian, tim nhanh moi danh sach (`bba3d82`)
- v0.038: lam gon import ke hoach hang ve - 3 buoc, file mau ghi ro cot can dien, dien san dot dang co (`982e637`)

### 2026-10-22
- v0.037: Nhap AMIS doc thang bao cao MISA 'So chi tiet vat tu hang hoa' (`eecce6d`)
- v0.036: dong them sau BH tu duyet khi nguoi them la nguoi duyet cuoi; huy dong sau ban hanh (ke ca da duyet) (`b7c7fa9`)
- v0.035: cot thao tac dua len dau bang + ghim trai (khong bi day ra ngoai khi nhieu cot) (`ff2279d`)
- v0.034: giai thich ro so lieu & cach nhap; sua SL dat tu giam ke hoach; tu choi dong them sau ban hanh (`251b4b9`)
- v0.033: Nhap AMIS - nut Tai file mau + huong dan cot bat buoc (`20d04fc`)

### 2026-10-21
- v0.032: khoa nhap tay ngay hang ve - chi lay tu phieu nhap AMIS (`2dda889`)
- v0.031: bo dong tieu de lap o moi trang - tieu de len thanh tren cung, nut thao tac vao thanh loc (`400a350`)
- v0.030: Danh sach EO bo dong tieu de lap (da co o thanh tren), nut Tao EO vao cuoi thanh loc (`ace2a17`)
- v0.029: chuan hoa 3 loai ngay (hang ve / du kien / nha may cam ket) + 1 man cap nhat chung cho moi dong (`acfe627`)
- v0.028: thao tac xu ly ngay trong popup EO & ma linh kien (duyet, sua dong, thay ma, ke hoach, ngay DK, giai trinh, push, tai lieu) (`c172c62`)
- v0.027: popup xem nhanh EO & ma linh kien 95% man hinh, cai tao form EO, bang gon (cot co dinh + cat ...) (`92a8cad`)
- Ordered-parts tracking: ignore lines ordered before 2026-07-01 (setting theo_doi_bo_qua_truoc) (`337daf5`)
- Ordered-parts rules: exempt only fully received lines (by AMIS document date) (`6891e3f`)
- Role-based to-do counts: red badges after menu titles and a 'Việc cần xử lý' panel on the dashboard (`c58c100`)
- Ordered-parts tracking: expected-date rules, auto errors, explanations, partner push, CEO escalation (`fc92384`)

### 2026-10-20
- EO attachments: delete button in create/edit form and attachments tab (`3136115`)
- EO form: department Kho van Mien Bac/Nam auto-assigns the order warehouse (6804 / 6803), no manual pick (`f5f0267`)
- Push PO lines to the DVBH app; add CRM case ID and order ID to EO lines (`cf7d152`)

### 2026-10-19
- Let the creator edit an EO that is still awaiting approval (`05c7129`)
- EO item lines: add Ghi chu column to form, Excel import and all item views (`29785b5`)

### 2026-10-16
- AMIS re-import dedup: normalized text key, ISO dates, per-row preview (`2d11656`)

### 2026-10-13
- Let accounting correct AMIS data: period re-sync, batch void, per-receipt void/restore (`5cb8f2d`)
- Bulk arrival plans, weekly KRF plans, equivalent-part swap, Excel import and EO attachments (`7ae38e3`)

### 2026-10-12
- chore: bump app version to 0.014 (`ab85e40`)
- Approvals: only offer "Yeu cau cap nhat" on review tasks; readable errors; block double submit (`a3cd38b`)
- Harden approval flow against double-clicks and concurrent reviewers; add OAuth state (`4c6865f`)

### 2026-10-03
- Hide admin-only settings menu for non-admins; replace fake week dropdown in weekly report (`81dbe78`)
- Add manual ETX HR directory sync with Gmail-based account linking (`67b0273`)
- Open sidebar account menu upward so it is not clipped at the bottom of the screen (`49ee659`)
- Wire up dead UI found in screen audit: post-issue line approval, plan editing, catalog CRUD (`c062f96`)

### 2026-09-10
- Fix "Sua EO" silently creating a duplicate EO instead of editing (`c62ea9a`)
- Add one-off backfill script for legacy EOs missing item lines (`f8e178c`)
- Use real app icon for sidebar logo instead of hand-drawn placeholder (`4edeceb`)
- Add app icon, wire up header notification bell + account menu (logout), remove dead search box (`5ed9e31`)
- feat: EO file attachments via Google Drive (ported from linh-kien-app) (`f106846`)

### 2026-09-09
- feat: real Excel export + manual user add; remove undecided dots menu (`8c59ded`)
- fix: wire up dead UI found in audit + fix EO creation for non-admins (`6f47498`)
- chore: bump app version to 0.003 (`a739d38`)
- fix: chunk recomputeMatch scope to avoid D1 too-many-variables error (`1ef1fa8`)
- chore: rename worker eomua -> muahang (`8f88eb4`)
- chore: set real D1 database_id after wrangler d1 create (`677d35f`)
- chore: initial deployable snapshot (EO Mua hang) (`0188361`)
