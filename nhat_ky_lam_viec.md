# Nhật ký làm việc — App EO mua hàng

> Mỗi đợt làm việc 1 mục, **mới nhất ở trên**: ngày, phiên bản, yêu cầu, đã làm gì, kiểm thử gì, việc còn dở. Chỉ ghi thêm, không xoá mục cũ.
> Không ghi tài khoản, mật khẩu, khoá hay mô tả lỗ hổng bảo mật vào file này (repo có thể công khai).

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
