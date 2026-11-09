# CLAUDE.md — hệ EO Mua hàng

Ứng dụng web nội bộ quản lý **EO mua hàng** (yêu cầu mua linh kiện) của 3T: tạo EO → thẩm định →
duyệt cuối → ban hành → theo dõi kế hoạch hàng về → đối chiếu với AMIS (MISA) → 4 báo cáo.
Thay cho hệ no-code trên Google Sheets. Chuỗi tài liệu thiết kế ở thư mục cha
(`../TARGET_ARCHITECTURE.md`, `../TARGET_DATABASE.md`, `../WORKFLOW_SPEC.md`, `../PERMISSION_SPEC.md`,
`../REPORT_SPEC.md`, `../MIGRATION_PLAN.md`, `../CHOT_OPEN_QUESTIONS.md`, `../REPORT_LOGIC_EXTRACT.md`).

## Stack

Cloudflare Workers (Hono) phục vụ cả API lẫn frontend tĩnh từ 1 Worker · D1 (SQLite) · React + Vite +
Tailwind. Google OAuth tự cài trong Worker, session JWT cookie. **Không cron, không R2.** Quy ước kỹ
thuật giống `../linh-kien-app` (đọc `CLAUDE.md` repo đó nếu cần đối chiếu).

## Commands

```bash
npm install
npm run dev:worker        # wrangler dev backend, port 8790  (.dev.vars: đặt LOCAL_DEV_BYPASS_AUTH=true)
npm run dev:frontend      # vite, port 5176, proxy /api -> 8790
npm run build             # tsc + vite build (frontend)
npm run typecheck         # backend + frontend
npm run db:migrate:local  # áp migrations/ vào .wrangler/state (an toàn)
npm run db:migrate:remote # áp vào D1 THẬT (chỉ sau khi điền database_id trong wrangler.jsonc)
npm run deploy            # build + wrangler deploy
```

`.dev.vars` (copy từ `.dev.vars.example`) — local đặt `LOCAL_DEV_BYPASS_AUTH=true` để bỏ OAuth,
đăng nhập như `BOOTSTRAP_ADMIN_EMAIL`.

## wrangler.jsonc

- `assets.run_worker_first: ["/api/*"]` **load-bearing** — không xóa.
- Worker `muahang` (https://muahang.dichvu3t.workers.dev), D1 `eo-mua-hang-db` — `database_id` đã điền (production thật).
- Secrets (`wrangler secret put`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ETX_HR_API_KEY`, `DVBH_API_KEY`,
  `THEODOI_MUAHANG_API_KEY` (chưa đặt — khi app theo-doi-mua-hang sẵn sàng).
- Service Binding `DVBH` → Worker `dvbh` (app DVBH, repo `../../cloudflare smarttrade base`).
- Bump `frontend/src/version.ts` (`+0.001`, sửa tay chuỗi) trước mỗi deploy.

## Cấu trúc

```
migrations/                  0001 schema · 0002 don_gia · 0003 report_cache · 0004 google_drive_oauth
                             · 0005 notifications · 0006 etx_nhan_su · 0007 thay mã + kế hoạch tuần
                             · 0008 hủy / đồng bộ lại AMIS · 0009 khóa chống trùng AMIS
                             · 0010 đồng bộ PO sang DVBH · 0011 xóa mềm file đính kèm
                             · 0012 theo dõi linh kiện đặt (lỗi / giải trình / push / mail) · 0013 mốc bỏ qua đơn cũ
                             · 0014 từ chối dòng sau BH · 0015 chỉ mục hiệu năng · 0016 vi phạm (nhắc nhở, giải trình PO) · 0017 R1 48h · 0018 kết thúc sớm · 0019 khoá tính báo cáo · 0020 chuẩn hoá đối tác/lý do + Gmail phụ + R1 24h · 0021 cache theo dòng · 0022 ghi lỗi dựng cache
backend/src/
  index.ts                   Hono app, mount router, middleware chain
  middleware/                session (OAuth/JWT), guards (loadUser/requireApproved/requireWrite/requireAdmin)
  lib/                       eoAccess (quyền hành động), amisMatch (khớp AMIS↔EO), reportCache + dataVersions,
                             audit (event_log), notify, googleDrive + secretBox, etxNhanSu, week, vnTime, jwt
  routes/                    auth, users, eo, approvals, plans, amis, reports (4 BC), dashboard, danhMuc
                             (+ Google Drive OAuth), notifications, etxNhanSu
frontend/src/
  components/                AppShell (sidebar + topbar), DataTable (phân trang 10 dòng), ui
  lib/nav.ts                 menu sidebar  ↔ quyền ở backend lib/eoAccess.ts (đồng bộ tay)
  pages/                     Dashboard (Tổng quan), eo/ (EoList = Quản lý EO, EoForm, eoActions), DonHang (Quản lý đơn hàng)
                             + donhang/, theodoi/ (modal dùng chung), KeHoachTuan, amis/, reports/ (nhúng làm tab), admin/
scripts/                     migrate.mjs (xlsx → SQL), import_amis_history.mjs, seed_demo.mjs
../huong-dan/                tài liệu hướng dẫn .docx + _build/ (script dựng tài liệu + chụp ảnh)
```

## Luồng duyệt — chú ý khi sửa `routes/approvals.ts`

- Mỗi action trên phiếu **"giữ chỗ" bằng 1 UPDATE có điều kiện** (`WHERE status='PENDING'` + submission còn mở)
  trước mọi ghi khác; `meta.changes = 0` → 409. Đây là chốt chống bấm đúp (duyệt cuối bấm 2 lần từng có thể
  cấp 2 mã 3TDO). Batch lỗi → trả phiếu về PENDING.
- Mở phiếu FINAL / chuyển `WAITING_FINAL_APPROVAL` kiểm tra "hết phiếu REVIEW PENDING" **trong SQL** của batch,
  không tính trong JS — 2 reviewer cuối duyệt cùng lúc vẫn ra đúng 1 phiếu FINAL.
- Sửa dòng (`PATCH /eo/items/:id`) chỉ khi EO `DRAFT` hoặc `ISSUED`. Người tạo sửa EO đang `IN_REVIEW`/`WAITING_FINAL_APPROVAL`
  qua `POST /eo/:id/recall`: đóng submission (UPDATE có điều kiện, chặn duyệt muộn) → phiếu PENDING `WITHDRAWN` → EO `DRAFT`.
- Ban hành / thêm dòng sau ban hành / Admin hủy EO đã ban hành / thay mã LK → `recomputeMatch([approval_code])`.

## Kế hoạch hàng về, thay mã, đính kèm

- `item_plan.loai`: `NGAY` (ngày về cụ thể) | `TUAN` (đơn KH tháng KRF, màn `/plans/tuan`; `planned_date` = Thứ Bảy
  của tuần, `tuan` = `Yyy-Wnn`). Tổng 2 loại ≤ `current_qty`. Ghi hàng loạt/import Excel qua `POST /plans/bulk`
  (dry_run xem trước, tất cả-hoặc-không, `thay_the` = xóa mềm KH cùng loại của các dòng trong file rồi ghi lại;
  danh sách id truyền qua `json_each(?)` — không bind từng biến vì D1 giới hạn 100 biến/statement).
  File mẫu/đọc Excel ở FE `lib/planExcel.ts` + `lib/excel.ts` (đọc bằng `xlsx` phía trình duyệt, gửi JSON).
- Thay mã tương đương (`POST /eo/items/:id/replace-part`, EO ISSUED): `part_code` = mã đang dùng,
  `part_code_goc` = mã đã duyệt ban đầu; AMIS khớp theo **cả 2 mã** (`lib/amisMatch.ts`).
- Đính kèm (`POST /eo/:id/files`, Google Drive): Excel/ảnh/PDF/Word ≤ 20MB, ghi `UPLOAD_FILE` vào event_log.
  Form Tạo/Sửa EO upload sau khi lưu, trước khi gửi trình. Xóa (`DELETE /eo/:id/files/:fileId`) = xóa mềm
  (`deleted_at`, file vẫn trên Drive), ghi `DELETE_FILE`; trước ban hành: người quản lý EO / người tải lên, sau: chỉ Admin.

## Sửa dữ liệu AMIS (kế toán)

`amis_receipt` không xóa — dòng sai được **đánh dấu hủy** (`voided_at`, `void_reason`); dòng hủy luôn
`UNMATCHED` và `amisMatch` bỏ qua, nên mọi truy vấn lọc `MATCHED_EO` / `CODE_ONLY_NO_LINE` tự loại. Truy vấn
AMIS **không** lọc match_status phải thêm `voided_at IS NULL`. 3 cách (Kế toán/Admin, bắt buộc lý do):
`POST /amis/import` `mode=SYNC` (đồng bộ lại kỳ: dòng sống trong kỳ ngày CT + phạm vi kho mà không còn trong
file → hủy; có `dry_run`), `POST /amis/batches/:id/void` (hủy dòng do lô đó thêm), `POST /amis/receipts/:id/void|restore`.
Import lại đúng chứng từ đã hủy → tự khôi phục.

**Chống trùng AMIS** (MISA không có ID dòng; kế toán tải lại file chồng lấn kỳ cũ): `amis_receipt.khoa_trung`
(UNIQUE) = `SỐ_CT|Tên kho|MÃ_HÀNG|SL nhập|Ngày CT ISO|MÃ_PHÊ_DUYỆT` (in hoa a-z, + `#n` cho dòng giống hệt thứ n
trong cùng file). Hàm `khoaTrung()` ở `routes/amis.ts` phải khớp biểu thức SQL ở `migrations/0009`. FE đọc
Excel với `dateNF: "yyyy-mm-dd"` — mặc định SheetJS ra `m/d/yy` (trước 0009 đã lưu nguyên chuỗi đó vào doc_date).
`natural_key` (sha256) chỉ còn để tương thích, không dùng so trùng.

## Đồng bộ PO sang app DVBH

`lib/dvbhSync.ts`: mỗi dòng `eo_item` = 1 PO (payload = báo cáo 0.1 `computeTienDo01` + kế hoạch hàng về + phiếu nhập
AMIS + ID CRM/ID đặt hàng/link EO) đẩy sang DVBH `POST /api/partner/sync/po-dat-hang` (X-API-Key = `DVBH_API_KEY`,
key nằm ở bảng `partner_api_keys` bên DVBH, tên đối tác `muahang`). **Không cron:** middleware `index.ts` gọi
`maybeSyncDvbh` (waitUntil) sau mọi request `/api/*`; chỉ chạy khi version `eo/amis/settings` hoặc ngày VN đổi,
cách lần trước ≥ 2 phút (20s trước 2026-11-06), có khóa `running_until`; chỉ gửi dòng có hash khác lần gửi thành công (`dvbh_sync_item`).
Khóa dòng `id_dat_lk` = `legacy_id` (LK-…) hoặc `EOI-<eo_item.id>`. Admin: Cấu hình hệ thống › "Đồng bộ PO sang
app DVBH" (gửi ngay / đồng bộ toàn bộ). DVBH dùng song song với Google Sheet cũ (~1 tháng). Thêm field vào
payload = DVBH nhận nguyên JSON (`po_dat_hang_eo.payload`), map ở `frontend/src/lib/poDatHangEo.ts` bên đó.

## Theo dõi linh kiện đặt (kiểm soát ngày dự kiến)

Quy tắc R1/R3/R4, giải trình (Ai + Lỗi gì + ảnh), cấp CEO, form push chuẩn, API mail: **`../THEO_DOI_LINH_KIEN_DAT.md`**.
`lib/theoDoi.ts`: `layDongTheoDoi` (dựa trên báo cáo 0.1 + item_plan + event_log + tl_loi; phần đọc DB **cache** `tl:goc-theo-doi`
theo version eo/amis/settings/theo_doi — phần theo giờ hiện tại (trễ 24h, quá ngày DK, hạn cập nhật lại, cấp CEO) tính mỗi lần gọi), `danhGiaQuyTac` (ghi lỗi
idempotent, chạy sau request API tối đa 10 phút/lần — đọc `tl_state` trước, không ghi khóa mỗi request).
`/api/partner/*` (`routes/partner.ts`) mount TRƯỚC session middleware. `POST /partner/mail-events` ghi **theo lô** (INSERT … SELECT
json_each, tra mã LK- 1 lần) — không lặp truy vấn theo dòng: D1 giới hạn 1.000 truy vấn / request (1 thư KRF có thể 100+ dòng).
Payload > 20.000 ký tự → bỏ (không cắt chuỗi JSON). Đọc mail theo EO (`xemNhanh`) gom 1 thư = 1 dòng trong SQL (`item_ids`), dùng UNION
thay OR. Giải trình (`POST /theo-doi/giai-trinh`, `cung_loai` mặc định true) đóng MỌI lỗi cùng quy tắc đang chờ của dòng — R3 ghi mỗi
thứ 2/4 chỉ cần giải trình 1 lần; FE hiện 1 dòng "× n lần". R3 (v0.057): có `tl_mail` của dòng (GUI/NHAN) trong kỳ (sau ngày
kiểm tra trước → hết ngày thứ 2/4) = đã push, không ghi lỗi. Hiệu năng đo bằng `npx wrangler d1 insights eo-mua-hang-db --timePeriod 7d`. Domain version `theo_doi` (DVBH tag có).
**Ngày KRF từ mail** (v0.047, `lib/krfGoiY.ts`): app `theodoimuahang` (`../../thu ky mua hang`, Worker cùng tên) đọc mail
theodoimuahang@gmail.com theo **mã 3TDO + mã LK** (không dùng mẫu MH-PUSH / EO-PUSH cũ) và đẩy `tl_mail` mỗi dòng 1 bản ghi, `payload.dong` =
{ngay_can, dap_ung, ngay_dap_ung, note, ton_kho…} (cột "KRF đáp ứng" của file/bảng KRF trả lời). `GET /theo-doi/goi-y-krf` = dòng đang
mở có ngày KRF (mail NHAN mới nhất) khác ngày NM cam kết; `POST /theo-doi/ap-dung-krf` = người dùng chọn rồi áp dụng.
Cách áp dụng: 0 đợt → thêm đợt (NM = DK = ngày KRF, SL = còn thiếu); 1 đợt ngày → sửa NM, DK theo NM khi DK trống /
bằng NM cũ / sớm hơn ngày KRF; nhiều đợt / kế hoạch tuần → sửa tay. Ghi `ADD_PLAN`/`UPDATE_PLAN` metadata `nguon='mail_krf'`.
**Tự động (v0.048, yêu cầu người dùng 2026-10-30):** `POST /api/partner/mail-events` nhận thư KRF (NHAN) có `payload.dong.ngay_dap_ung`
→ `tuDongDienKrf` điền ngay cho dòng **khớp chắc**: mã 3TDO + mã LK trong mail = `approval_code` + `part_code`/`part_code_goc`, EO chỉ có
đúng 1 dòng ACTIVE mang mã LK đó, chưa về đủ, 0/1 đợt ngày. Người ghi `item_plan` = `BOOTSTRAP_ADMIN_EMAIL` (FK users), `event_log.user_email`
= NULL (FE hiện "Hệ thống"), `nguon='mail_krf_tu_dong'`, ghi chú "Tự động theo mail KRF …". Dòng không chắc vẫn ở danh sách gợi ý.
Mail đã nhận TRƯỚC v0.048 không tự chạy lại (tl_mail chống trùng) — dùng nút áp dụng ở danh sách gợi ý.
FE: nút "Ngày KRF từ mail (n)" ở `/don-hang` (`pages/theodoi/KrfGoiY.tsx`), khung "Mail KRF … Điền vào form" trong `NgayHangVeModal`,
lịch sử mail hiện dữ liệu dòng (`DongMail`).
Số đỏ sau tên menu + khung "Việc cần xử lý" ở Tổng quan: `GET /api/viec-can-lam` (`routes/viecCanLam.ts`, ma trận vai trò ở file
trên mục 4); FE dùng queryKey `inbox-count` (nhiều màn đã invalidate key này).

## Vi phạm & giải trình (v0.055, `/vi-pham`, migration 0016)

`routes/viPham.ts` + FE `pages/ViPham.tsx`: mỗi dòng = 1 lỗi `tl_loi` kèm người vi phạm (`ai_email`, mặc định người đặt), **mức độ**
(CEO = dòng cấp CEO · CAO = cùng loại lặp ≥ 3 lần / chờ ≥ 7 ngày · TB = lặp 2 / chờ ≥ 3 ngày "quá lâu" · THẤP), lần thứ / số lần,
số ngày chờ, giải trình, số lần nhắc. Phạm vi: Admin / KH cung ứng / Theo dõi TD / chỉ xem = tất cả (`xemToanBoTheoDoi`), còn lại = lỗi
của mình / đơn mình đặt / kho phụ trách. FE: "Của tôi / Toàn bộ", 6 thẻ số bấm = lọc, xem theo lỗi (gộp lỗi lặp "× n") / theo PO / theo người.
**Nhắc nhở** `tl_nhac_nho`: hệ thống tự nhắc khi `danhGiaQuyTac` ghi lỗi mới (+ `notification` loai `vi_pham`), quản lý nhắc tay
`POST /vi-pham/nhac-nho` (loai `nhac_vi_pham`, event `NHAC_NHO_VI_PHAM`). **Giải trình cả PO** (PO = 1 EO): `POST /vi-pham/giai-trinh-po`
đóng mọi lỗi chờ của các dòng được chọn (hoặc `moi: true` = ghi lỗi TAY cho mọi dòng đang theo dõi); mỗi dòng vẫn 1 bản ghi
`tl_giai_trinh` (`pham_vi='PO'`, chung `nhom`) nên các màn cũ đọc như giải trình thường. Form `pages/theodoi/GiaiTrinhPo.tsx` (cũng ở popup EO).
**Giải trình chung nhiều lỗi cùng loại** (v0.059): tick các lỗi ở màn Vi phạm → `POST /vi-pham/giai-trinh-nhieu` (`loi_ids`, bắt buộc cùng
`quy_tac` — khác loại trả `KHAC_LOAI`; quyền trên mọi EO), `pham_vi='NHIEU'`, form `GiaiTrinhNhieuModal`.
R1 = **48h làm việc** (`GIO_R1` ở `lib/theoDoi.ts`, v0.059); `danhGiaQuyTac` đồng bộ lỗi R1 đang chờ với mốc hiện tại (hết vi phạm → xóa + event
`XOA_LOI_THEO_DOI`, còn → cập nhật `han`). Mã lỗi danh mục vẫn `KHONG_NDK_24H`.
Số đỏ menu: `viecCanLam` key `vi_pham` = lỗi chờ giải trình CỦA TÔI.
Tiền tố mã EO mới `MH-` (từ 2026-11-04; mã `EO-` đã cấp giữ nguyên), push `[MH-PUSH]` / `MH-PUSH_<mã>.xlsx`.

## 3 loại ngày của 1 dòng linh kiện — tên & định nghĩa CHUNG ở `frontend/src/lib/ngay.tsx`

- **Ngày hàng về**: thực tế nhập kho, từ phiếu AMIS khớp dòng — không nhập tay.
- **Ngày dự kiến** (`item_plan.planned_date`): ước tính hàng về; quy tắc R1/R4, số lần lùi, cấp CEO dựa vào ngày này.
- **Ngày nhà máy cam kết** (`item_plan.factory_committed_date`): NM/NCC xác nhận. Thường = ngày dự kiến → form / import
  Excel tự lấy ngày dự kiến theo ngày NM khi để trống.
Ngày hàng về **không có đường nhập tay nào** (không cột DB, không API ghi): import Excel kế hoạch (`parseDailyFile`) chặn cả file
nếu có cột mang nghĩa thực tế (`COT_THUC_TE`: "Ngày hàng về", "Ngày về", "Ngày nhập kho", "SL đã về"…) có dữ liệu — không thêm
alias "Ngày về" / "SL về" cho ngày dự kiến / SL kế hoạch. Không dùng chữ "ngày về" trần cho ngày dự kiến. Một màn duy nhất cho cả 3 ngày của 1 dòng: `NgayHangVeModal`
(`pages/theodoi/shared.tsx`, dữ liệu `GET /api/theo-doi/dong/:id` → `item`, `ke_hoach`, `phieu_nhap`). Ô bảng dùng `<BaNgay>`.

## Thuật ngữ số liệu — `frontend/src/lib/thuatNgu.tsx`

Mọi nhãn số lượng / ô nhập của EO & dòng linh kiện lấy từ `TN` + `<Hoi k>` (tooltip "là gì / để làm gì"); nút "?" ở thanh trên
mở bảng giải thích. Lưu ý API `/eo/:id` trả `da_dat` = **đã về theo AMIS** (không phải "đã đặt"), `chua_dat` = còn thiếu.
Giảm SL đặt < tổng kế hoạch: `PATCH /eo/items/:id` với `cat_ke_hoach: true` tự giảm/xóa đợt từ đợt xa nhất (có log).
Dòng thêm sau ban hành: người duyệt cuối của EO / Admin duyệt (`approve-post-issue`) hoặc từ chối (`reject-post-issue`,
bắt buộc lý do → dòng hủy SL 0, xóa kế hoạch; ghi ở cột `post_issue_rejected_*` vì CHECK của `post_issue_status`).
Người thêm chính là người duyệt cuối → tự duyệt (log APPROVE_POST_ISSUE_ITEM). Hủy 1 dòng sau ban hành (kể cả đã duyệt):
`POST /eo/items/:id/cancel-line` (người quản lý EO / người duyệt cuối, bắt buộc lý do) — nút "Hủy đơn" ở popup đơn hàng + popup EO;
dòng hủy **không tính SL đã về** (báo cáo 0.1 `actual_eo = 0`, `/eo/:id` `da_dat = 0`; v0.060). **Kết thúc sớm** (v0.060, migration 0018):
`POST /eo/items/:id/ket-thuc-som` (cùng quyền, bắt buộc lý do, chỉ khi 0 < đã về < SL đặt) → `current_qty` = SL đã về AMIS, cắt kế hoạch
(`catKeHoach`, dùng chung với giảm SL), lưu `ket_thuc_som_at/by/ly_do`, `sl_dat_truoc_kts`, event `KET_THUC_SOM`; báo cáo 0.1 trạng thái
**"Kết thúc sớm"**. Danh sách trạng thái đã đóng dùng chung `TRANG_THAI_DONG` (`routes/reports.ts`) — thêm trạng thái đóng thì sửa ở đó.

## Bảng điều khiển quản lý (đầu trang Tổng quan) — `frontend/src/pages/QuanLyPanel.tsx`

`GET /api/dashboard/quan-ly` gom từ báo cáo 0.1 đã cache (không cache kết quả — mốc tồn "< 1 ngày" tính theo giờ):
tỷ lệ đáp ứng tháng/tuần = Σmin(về, đặt)/Σđặt của dòng ĐẶT trong kỳ; tồn đọng + 8 mốc tồn (`MOC_TON`, khớp
`frontend/src/lib/tonDong.tsx`) dùng CÙNG mốc bỏ qua với `lib/theoDoi` (`theo_doi_bo_qua_truoc` so với **ngày ban hành PO** — PO cũ bỏ cả dòng thêm sau,
chốt 2026-11-04; vi phạm của PO cũ cũng không tính) & ngày đặt (dòng trước BH = ngày ban hành, thêm sau BH = ngày tạo) để số trên Tổng quan = số ở Quản lý đơn hàng (`/don-hang?ton=<mốc>` — lọc mốc tồn chỉ tính dòng `theo_doi`, theo `bat_dau`). `GET /api/dashboard/tim-linh-kien?q=` tra mã/tên không dấu.
`DataTable` có ô tìm nhanh mặc định (`timKiem={false}` khi trang tự tìm phía server).

## 8 giai đoạn đơn hàng — `backend/src/lib/giaiDoan.ts` (FE nhãn `frontend/src/lib/giaiDoan.tsx`)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & BH · G4 Gửi đơn NCC (mail GUI đầu tiên trong `tl_mail`, CC theodoimuahang —
luồng SONG SONG, không chặn giai đoạn hiện tại) · G5 Có ngày dự kiến · G6 Chờ SX & giao (hạn = ngày DK lần đầu) ·
G7 Nhập kho & lên hệ thống (ngày CT AMIS → `amis_receipt.created_at`, chỉ đo) · G8 Giao bù đến đủ. Giờ & hạn = giờ LÀM VIỆC
(bỏ Chủ nhật, như R1); hạn `app_settings.giai_doan_sla` (JSON giờ, mặc định 24/…/G8 168). Chốt 2026-10-29: CHỈ đo + báo cáo
đúng/trễ hạn, chưa sinh lỗi giải trình (bật sau 2–4 tuần). `layGiaiDoan(env)` cache mốc, phần "bây giờ" tính lúc request.
Báo cáo giai đoạn = tab Báo cáo của Quản lý đơn hàng (`/don-hang?tab=bao-cao&bc=giai-doan`).

## 2 màn chính (v0.050–0.051, `../UI_GOP_2_MAN_HINH.md`) — menu: Tổng quan · Đơn PO (Quản lý EO) · LK đặt · Vi phạm · Nhập AMIS · Cài đặt

**Bảng kiểu Excel (v0.062, `components/DataTable.tsx`)**: cột khai báo `loc` (`chu` tìm không dấu · `chon` tick giá trị · `ngay` từ–đến ·
`so` từ–đến) + `gt` (giá trị thô) [+ `gtSap`, `nhanChon`] → phễu lọc + bấm tiêu đề sắp xếp, nhãn "Đang lọc n cột · x / y dòng".
Tự quản lý state, hoặc điều khiển ngoài `loc/onLoc/sap/onSap` + `ngoai` (rows đã lọc sẵn: server, hoặc trang dùng `locVaSap`).
Thanh trên mỗi màn chỉ còn bộ lọc **thường dùng** (ô tìm + nhóm nhanh); bộ lọc **ít dùng** ẩn sau nút "Bộ lọc khác".
**Thanh thao tác 1 dòng (v0.063)**: nhóm nhanh = ô chọn (có số đếm), bộ lọc ít dùng / bộ lọc đã lưu / công cụ / chú giải = bảng xổ
`Popover` + `MenuItem` (`components/ui.tsx`), Chọn cột / Xuất Excel = nút icon; ô nhập/chọn trên thanh dùng class `.tb` (cao 32px).
Menu "Quản lý EO" đổi tên **"Đơn PO"** (đường dẫn vẫn `/eo`). "LK đặt" có 2 mục con ở sidebar (`NavItem.children` trong `lib/nav.ts`):
Danh sách (`/don-hang`) · Báo cáo (`/don-hang?tab=bao-cao`).
**LK đặt v0.065**: 20 dòng / trang; ô "Xem" 3 chế độ (localStorage `sdh-xem`): từng dòng · nhóm theo PO (`eo_id`) · nhóm theo mã LK —
`DataTable` prop `nhom={ khoa, dau }` (dòng tiêu đề nhóm bấm thu gọn/mở, phân trang theo nhóm trọn vẹn ~pageSize dòng, ẩn cột đã ở tiêu đề nhóm).
Tick 1 / nhiều dòng / cả nhóm (ô tick ở tiêu đề nhóm; dòng `theo_doi`) → **Giải trình chung** (`GiaiTrinhDongModal` → `POST /vi-pham/giai-trinh-dong`:
`xem` = xem trước lỗi chờ theo dòng; mặc định đóng MỌI lỗi chờ của các dòng (nhiều PO, nhiều loại; R1/R4 bắt buộc ảnh); `moi` = ghi lỗi TAY
đã giải trình cho dòng đang mở; `pham_vi='NHIEU'`, nhom `D:…`) hoặc Push (chỉ dòng còn mở).

- **Quản lý EO** `/eo` (`pages/eo/EoList.tsx` + `EoListInner.tsx`): chip có số đếm (`GET /eo/dem`, lọc `GET /eo?chip=`, định nghĩa
  `CHIP_EO` ở `routes/eo.ts`: **mặc định `con_ton`** = không hủy / từ chối và (chưa ban hành hoặc còn dòng chưa về đủ); cho_toi_duyet = phiếu PENDING
  của tôi ở lần trình mở + EO tôi duyệt cuối có dòng sau BH chờ duyệt, …). `GET /eo` (v0.062): toàn bộ EO dựng 1 lần vào cache `eo:ds-v1`
  (eo/amis) → lọc chip / `q` (không dấu) / `kho` `doi_tac` `ly_do` / `loc` (JSON lọc cột, `COT_EO`) / `sap=cot:asc|desc` + phân trang trong JS;
  trả `tuy_chon` (giá trị lọc "chọn"), `tong_truoc_loc`;
  nút Đồng ý / Từ chối / Yêu cầu cập nhật ngay trên dòng (`phieu_cho_toi_id/buoc` trong list). **Chi tiết EO = popup** — `/eo/:id`
  mở màn này + bật popup rồi đổi URL về `/eo`. Đã bỏ trang EoDetail và Approvals (`/approvals` → `/eo?chip=cho_toi_duyet`).
- **LK đặt** `/don-hang` (`pages/DonHang.tsx`, trước tên "Quản lý đơn hàng"; mỗi dòng = 1 dòng linh kiện mọi trạng thái; **mặc định nhóm
  "Còn chờ hàng"** khi vào không kèm bộ lọc; lọc cột `LOC_COT`; bộ lọc cũ trùng lọc cột đã bỏ khỏi thanh trên nhưng vẫn nhận từ link
  `?gd= ?ton= ?tinhTrang=…` — hiện nhãn "×" `LOC_LIEN_KET`): `GET /api/so-don-hang` =
  báo cáo 0.1 + EO + giai đoạn + **chỉ số theo dõi** (`layDongTheoDoi`: `theo_doi`, `tinh_trang`, `ap_dung`, `han_*`, `so_lan_lui`,
  `ceo_ly_do`…; gọi `danhGiaQuyTac` trước). Nhóm nhanh `NHOM` (Cần xử lý, Trễ 24h, Quá DK, Lỗi chờ GT, Cấp CEO, Về tuần này…), cột
  Thao tác (ngày NM/DK, giải trình, lịch sử), tick → push đối tác, Ngày KRF từ mail, KH hàng về Excel (`donhang/KeHoachExcelModal`),
  KH tuần KRF = trang con `/don-hang/ke-hoach-tuan`, Bảng lỗi (Admin, `theodoi/BangLoi`), tab Báo cáo (Giai đoạn, Tiến độ tuần, Lũy kế
  năm — component báo cáo nhận `nhung`). Chọn cột / lọc / lưu bộ lọc ở FE (localStorage `sdh-cot`, `sdh-loc-luu`). Trang remount theo
  query string (link nội bộ đổi `?nhom=`/`?gd=`… áp lọc mới).
- Đường dẫn cũ chuyển hướng giữ query (`ChuyenHuong` trong `App.tsx`): `/theo-doi`, `/so-don-hang`, `/canh-bao-ceo`, `/plans`,
  `/plans/tuan`, `/reports/*`. "AMIS không EO" = tab **Chứng từ chưa khớp** ở `/amis?tab=chua-khop`.
- Số đỏ menu: `badgeOf` so theo đường dẫn bỏ `?query` — `viecCanLam` trỏ `/eo?chip=…`, `/don-hang?nhom=…` vẫn cộng vào mục menu.

## Popup xem nhanh (95% màn hình)

**3 loại popup** (v0.052): EO (`openEo`), **đơn hàng = 1 dòng linh kiện** (`openDong(itemId)`, `DongQuickView` — mở khi bấm dòng ở
Quản lý đơn hàng / nút tiến trình trong popup EO), mã linh kiện (`openPart`). **Đường tiến trình 8 giai đoạn** `components/TienTrinh.tsx`
(dữ liệu `GET /so-don-hang?eo_id=` — `gd_moc/gd_gio_tung/gd_tre_tung`; EO = gộp các dòng, thời gian = dòng chậm nhất; lỗi gắn giai đoạn
R3→G4, R1→G5, R4→G6). **Gom log trùng khi hiển thị** `lib/gopTrung.ts`: `tl_mail` lưu 1 bản ghi / dòng cho cùng 1 thư (gom theo
hướng + tiêu đề + thời gian); lỗi R3/R4 nhiều ngày cùng loại → "× n lần"; event_log kế hoạch chuyển từ Sheet cũ trùng giây → "(×n)".
Dữ liệu gốc không sửa.
**Tiến trình thu gọn** `TienTrinhGon` (8 chấm, 1 ô bảng; bấm → popup đơn hàng): cột Tiến trình ở popup EO (tab Linh kiện), popup mã LK
(tab Lịch sử EO / đặt hàng — `GET /xem/linh-kien` trả `giai_doan` theo item), cột chọn được ở Quản lý đơn hàng.
**Diễn giải cấp CEO**: `layDongTheoDoi` trả `ceo_chi_tiet` (LUI: từng lần lùi — lúc, ai, từ → đến; XA: ngày đặt → ngày DK; LOI: số lỗi
theo quy tắc, đếm từng lần) + `lui_ds`, `loi_qt`; FE `GiaiThichCeo` / `ceoTxt`. **Không đổi chuỗi `ceo_ly_do`** (viecCanLam lọc theo chữ).
Khóa cache `tl:goc-theo-doi:v4` (đổi hậu tố khi đổi định dạng dữ liệu cache).

`components/quickview/QuickView.tsx`: `QuickViewProvider` (bọc trong App) giữ **ngăn xếp** popup EO / mã linh kiện,
Esc đóng popup trên cùng. Mở từ bất kỳ đâu bằng `useQuickView().openEo/openPart`, `<EoLink id>`, `<PartLink ma>`.
Dữ liệu bổ sung: `routes/xemNhanh.ts` mount `/api/xem` — `GET /eo/:id/bo-sung` (theo dõi, lỗi, giải trình, push, mail,
phiếu AMIS, cảnh báo) và `GET /linh-kien?ma=` (lịch sử EO/đặt hàng, AMIS, log, lỗi theo mã). Nhãn sự kiện dùng chung
`lib/eventLabels.ts`. Thao tác trong popup dùng chung code với trang: `pages/eo/eoActions.tsx` (`quyenEo()` = quyền
khớp backend, tab Kế hoạch/Tài liệu, modal sửa dòng/thay mã/thêm dòng/hủy/rút về, modal duyệt) và `pages/theodoi/shared.tsx`
(ngày DK, giải trình, lịch sử, `taoPushDoiTac` + `PushKetQua`) — sửa 1 chỗ, cả trang lẫn popup cùng đổi. `Modal` zIndex 200
(trên popup 80+) và có `data-modal` để Esc chỉ đóng modal. Bảng: `DataTable` cột có `maxW` → `<Clip>` cắt "…" + title khi bị cắt; form EO `table.eo-lines`
table-layout fixed + colgroup (cuộn ngang trong khung, không tràn trang).

## Quy ước

- Cột & comment DB/code **không dấu**; chuỗi UI có dấu.
- Thời gian: **giờ tường Asia/Ho_Chi_Minh** (`nowVN()`, `datetime('now','+7 hours')`), không UTC.
- `users` khóa chính = `email` (bất biến). Mọi FK người dùng tham chiếu email.
- Mọi thay đổi nghiệp vụ có ý nghĩa audit → 1 dòng `event_log`. Thảo luận → `eo_comment`.
- Không hard-delete `eo_item` / `item_plan` / `eo_approval` / `eo_file` / `amis_receipt`.
- Mọi write path gọi `bumpVersions(db, [...domains])`.
- `lib/nav.ts` (FE) ↔ quyền ở BE đồng bộ tay khi thêm.
- **Luôn commit trước khi deploy.** Không chạy `npm run deploy` khi cây làm việc còn thay đổi
  chưa commit — commit (hoặc stash) hết, rồi mới deploy, để mỗi bản deploy khớp đúng 1 commit.

## Chuẩn hoá Đối tác / Lý do PS, tên hiển thị, Gmail phụ, R1 24h (v0.066, migration 0020)

- **Đối tác / Lý do PS chuẩn** `lib/chuanHoa.ts`: danh mục `dm_chuan` + bí danh `dm_bi_danh` (khoá = chữ thường không dấu, bỏ ký tự
  khác a-z0-9 — `khoa()` phải khớp `scripts/gen_0020_chuan_hoa.py`). Mọi đường ghi `eo_item` (tạo EO, thêm dòng, sửa dòng) gọi
  `chuanHoaDong`: bí danh tự quy đổi (KRF/KAROFI → Karofi), giá trị lạ → 400 `GIA_TRI_KHONG_CHUAN` (FE `loiChuanTxt`). Lý do PS chỉ 4 giá
  trị: Ký gửi · Đặt lần đầu · Kế hoạch tháng · Phát sinh (FE `ChonLyDo`). PATCH dòng: `b.reason` là lý do đổi SL — chỉ chuẩn hoá supplier.
  Dữ liệu cũ chuyển 1 lần bằng `scripts/_data/0020_chuyen_du_lieu.sql` (sinh bởi `scripts/gen_0020_chuan_hoa.py`, chứa giá trị thật — gitignore, repo công khai) (chốt với người dùng 2026-11-08: cảnh báo hết hàng → Phát sinh; lý do lạ → Phát sinh + chép
  "Lý do cũ: …" vào ghi chú; Media/MM → Media Mart; LKDH, NCC, Lọc tổng giữ riêng), bản gốc ở `supplier_goc` / `reason_goc`.
  Admin: Danh mục › "Đối tác & lý do PS" (`GET/PUT /danh-muc/chuan`, `POST /danh-muc/chuan/chuyen` chuyển giá trị chưa chuẩn còn sót).
- **Tên hiển thị** `lib/tenNguoiDung.ts` → `GET /users/ten` (cache version `users`): ưu tiên họ tên ETX (tài khoản liên kết, hoặc Gmail
  chính / Gmail phụ trùng Gmail hiệu lực ETX, hoặc Gmail ETX không có tài khoản); không có → FE `ten()` cắt Gmail. App nạp 1 lần
  trước khi vẽ (`datTenHienThi`).
- **Gmail phụ** `user_alias`: 1 tài khoản đăng nhập nhiều Gmail (`loadUser` + `/auth/callback` quy về email chính). Admin: Người dùng ›
  cột Gmail đăng nhập (`POST/DELETE /users/:email/gmail-phu`); Gmail phụ không được là tài khoản đã duyệt riêng. `relinkUsers` /
  `linkOneUser` khớp ETX theo Gmail chính rồi Gmail phụ.
- **R1 24h**: đối tác nhóm Karofi/KRF, Livotec/LVT, Korihome/KRH (`laNhomR1_24h`) hạn ngày dự kiến 24h làm việc, hãng khác 48h — chỉ dòng bắt
  đầu từ `app_settings.r1_24h_tu` (2026-11-08), dòng cũ giữ 48h (không ghi lỗi hồi tố). `DongTheoDoi.gio_r1`; cache `tl:goc-theo-doi:v5`.

## v0.067 (2026-11-08)

- **"Duyệt cuối" đổi tên "Duyệt mua"** (bước "Duyệt mua trên hệ thống") ở mọi nhãn UI / thông báo; mã nội bộ vẫn `FINAL`, `final_approver_email`.
- **Kho hiển thị rút gọn** `lib/kho.tsx` (`khoGon`, `<Kho t>`): mã kho ở Danh mục › Kho, không có mã giữ tên gốc; dữ liệu / lọc / Excel vẫn tên đầy đủ.
- **Ý nghĩa loại hình** `lib/loaiHinh.ts` = `settings_eo_category.cap2`: dòng nhỏ dưới `TypeBadge`, trong ô chọn + dòng "Ý nghĩa" ở form EO.
  App nạp 1 lần (`dm-kho`, `dm-loaihinh`) như tên người dùng.
- **Lỗi sau khi hàng về bỏ qua** (`lib/theoDoi.ts`): `ngay_ve_dau` = ngày chứng từ AMIS lần về đầu tiên (kể cả về thiếu). Không ghi R1/R3/R4
  có hạn từ ngày đó; `danhGiaQuyTac` tự xoá lỗi R1/R3/R4 ĐANG CHỜ có `han` >= ngày về đầu (cả dòng đã đóng — AMIS nhập muộn), event
  `XOA_LOI_THEO_DOI`. Cache `tl:goc-theo-doi:v6`.
- **File mẫu import EO** có sheet "Huong dan" (4 lý do PS, đối tác chuẩn, loại hình + ý nghĩa). Import gọi `POST /danh-muc/chuan/kiem-tra`
  (bí danh → chuẩn, lý do sai → để trống + nhắc); đối tác chưa có → hỏi "chắc chắn thêm đối tác mới?" → `POST /danh-muc/chuan/doi-tac-moi`
  (người tạo EO, trùng bí danh trả tên sẵn có). Lưu form với đối tác gõ mới cũng hỏi như vậy rồi lưu lại.

## v0.069 (2026-11-08)

- **Quy trình gọn** `QuyTrinh` (`components/TienTrinh.tsx`) ở popup EO + popup đơn hàng: đường ngang 8 mốc (bóng đỏ = số lỗi) + nút
  "▾ Xem chi tiết" (bản đầy đủ `TienTrinh nhung`), thanh **hàng về nhiều đợt** (`gomDotVe`: phiếu AMIS gom theo ngày CT, lũy kế / SL đặt,
  thiếu → giao bù) và **Vấn đề theo bước** (lỗi gắn giai đoạn qua `LOI_GD` + trễ hạn, gom theo AI mắc: tên ETX + vai `ai_ma`; phụ trách
  từng bước truyền `phuTrach`). KPI popup = pill 1 dòng (CSS `.qv-kpi`).
  **Thu gọn = đúng 1 dòng** (v0.071, yêu cầu ~80% popup cho danh sách): nhãn | đường quy trình | tóm tắt ("⚠ n bước có vấn đề", "Về x/y") | nút;
  ô số liệu, cảnh báo, giải thích cấp CEO truyền vào `chiTiet` của QuyTrinh (chỉ hiện khi "Xem chi tiết"). Dòng tiêu đề + dòng thông tin
  popup (`.qv-meta`) không xuống dòng, số Đặt/về/thiếu nằm trên dòng thông tin.
- **Lỗi giai đoạn trước sau khi đơn sang giai đoạn sau** (`danhGiaQuyTac`): R1/R3 đang chờ có hạn >= `lan_dau_co_ndk`, R1/R3/R4 có hạn >=
  `ngay_ve_dau` → tự xoá + event `XOA_LOI_THEO_DOI`.
- **Màn AMIS**: cột chung `pages/amis/cotAmis.tsx` (mã phê duyệt → popup PO qua `po_eo_id`, mã hàng → popup ĐƠN HÀNG (cùng giao diện LK đặt) qua `dong_id` = dòng khớp hoặc dòng cùng PO + cùng mã;
  lọc kiểu Excel); `GET /amis/receipts` thêm `tu/den/kho/khop`, 1.000 dòng.
- **Sửa mã LK / kho / đối tác** `POST /eo/items/:id/sua-thong-tin` (`canSuaThongTinDong`: kế toán, KH cung ứng, NV đặt hàng, người tạo PO, Admin;
  EO DRAFT/ISSUED và PO còn dòng chưa về đủ; bắt buộc lý do; event `SUA_THONG_TIN_DONG` trước/sau; đổi mã/kho → `recomputeMatch`). Khác
  "thay mã tương đương" (không ghi `part_code_goc`). FE `SuaThongTinDongModal`.
- **Kết thúc sớm cả PO** `POST /eo/:id/ket-thuc-som` (`xem` = xem trước từng dòng): về 1 phần → SL đặt = SL đã về; chưa về → SL 0 + CANCELLED_LINE;
  đủ / đã KTS / chờ duyệt → bỏ qua; event `KET_THUC_SOM` từng dòng + `KET_THUC_SOM_PO`. FE `KetThucSomPoModal` (cảnh báo + tick xác nhận).
- **Kết thúc sớm theo mã LK** (v0.076, đối tác báo ngừng sản xuất) `POST /eo/ma-lk/ket-thuc-som` `{ ma, xem?, item_ids?, reason }` — **đăng ký TRƯỚC**
  `/:id/ket-thuc-som` (cùng 2 đoạn). Mọi dòng mở của mã (`part_code` hoặc `part_code_goc`) trên mọi PO ISSUED, cùng quy tắc KTS cả PO; quyền xét
  từng dòng (không quyền → `BO_QUA_QUYEN`), EO chưa BH → `BO_QUA_CHUA_BH`; dòng chưa về bị hủy → `recomputeMatch`. Event `KET_THUC_SOM` metadata
  `pham_vi='MA_LK'`. FE nút đỏ ở tiêu đề popup mã LK → `KetThucSomMaModal` (tick chọn dòng, mặc định tất cả).
- **DONE** = trạng thái TÍNH (không đổi CHECK của `eo.trang_thai`): ISSUED + có dòng sống + mọi dòng sống về >= SL đặt. `GET /eo` trả `xong`,
  chip `done`, lọc cột trạng thái giá trị `DONE`; `STATUS_META.DONE`; popup EO tính `poDone`. Cache `eo:ds-v2`.

## 2 giao diện theo mã linh kiện (v0.072, `components/quickview/QuickView.tsx`)

- `PartLink` → UI CHUNG (popup mã LK: mọi đơn đặt / PO của mã) — dùng ở dòng NHÓM (LK đặt nhóm theo LK), ô tra mã, chứng từ không có dòng.
- `DongLink id ma` → UI LẺ (popup đơn hàng = mã LK trong 1 PO) — dùng ở dòng LẺ (LK đặt, bảng linh kiện popup EO, Vi phạm, KRF, AMIS);
  không có `id` → tự rơi về `PartLink`; Shift/Ctrl + bấm → UI chung.
- Chuyển qua lại: popup đơn hàng có nút "⇄ Tất cả đơn của mã này" (`openPart`); popup mã LK, tab Lịch sử EO / đặt hàng, nút 👁 từng dòng (`openDong`).

## Cache theo từng dòng (v0.073, migration 0021, `lib/dongCache.ts`) — tốc độ LK đặt / popup

- Đo 2026-11-08: D1 nhanh (truy vấn nặng nhất ~215ms), chậm do **giải nén blob cache toàn hệ thống** mỗi lần (`rep:tien-do-01` ~700KB gzip,
  giai đoạn / theo dõi / ds EO ~200KB) kể cả khi chỉ mở 1 PO hay 1 mã LK.
- `dong_cache` (1 dòng LK = 1 bản ghi đã gộp: báo cáo 0.1 + EO + giai đoạn + theo dõi; `sig`, `seq`, `mo`, `ma_lk/ma_goc`, `nguon_now`) +
  `dong_cache_meta` (tag, seq, epoch, sla, khoá). `damBaoDongCache`: tag (version eo/amis/settings/theo_doi + ngày VN) đổi → dựng lại bằng
  `xayDongSdh` (routes/soDonHang, pipeline cũ) và **chỉ ghi dòng có sig khác** (seq mới, ghi theo lô json_each ≤ 45.000 ký tự / câu lệnh — D1 giới hạn
  100KB / câu lệnh KỂ CẢ tham số, local không chặn; ≤ 40 câu / batch vì batch ≤ 30s). Lỗi dựng ghi `dong_cache_meta.loi` / `loi_luc` (0022).
- Phần "bây giờ" (giờ từng giai đoạn, trễ hạn, `tinh_trang` theo dõi) KHÔNG nằm trong sig: dòng `mo = 1` tính lại mỗi request từ `nguon_now`
  (`ketQuaGd` của lib/giaiDoan + `tinhTrangBayGio` của lib/theoDoi — dùng chung với đường cũ).
- `GET /so-don-hang?eo_id=` / `/xem/eo/:id/bo-sung` / `/xem/linh-kien` đọc đúng các dòng cần (`dongCacheTheo`). FE LK đặt + báo cáo giai đoạn:
  `lib/sdhCache.ts` giữ danh sách trong IndexedDB, gọi `?seq=&epoch=` → chỉ nhận dòng đổi + `now` của dòng mở. Cache lỗi → tự rơi về cách cũ.
- Thêm trường vào dòng /so-don-hang: sửa `xayDongSdh`; trường phụ thuộc thời gian: thêm vào `NOW_KEYS` + `phanBayGio`.

## v0.073 khác

- `DongLink po`: không có dòng đặt nhưng biết mã PO (chứng từ chưa khớp) → popup mã LK **lọc theo PO** (`openPart(ma, po)`, badge "trong PO",
  nút ⇄ xem tất cả). Popup mã LK, tab Lịch sử EO / đặt hàng có cột "Mã LK trong PO" (DongLink).
- Popup PO, bảng linh kiện = `DataTable` (lọc / sắp xếp kiểu Excel trên máy), mặc định ẩn dòng hủy / từ chối (tick "Xem cả đơn hủy"),
  dòng còn thiếu lên đầu, thiếu nhiều trước.

## Nhật ký gọn (v0.074, `components/NhatKyGop.tsx` + `gopLienTiep` ở `lib/gopTrung.ts`)

Nhiều nhất trên production (2026-11-08): ADD_ITEM ~7.9k, UPDATE_PLAN ~7.6k, ADD_PLAN ~3.2k — ghi theo loạt (tạo PO / cập nhật kế hoạch hàng loạt).
Hiển thị: mục LIÊN TIẾP cùng loại + cùng người (+ cùng PO ở popup mã LK), cách nhau ≤ 2 giờ → 1 dòng "×n" + khoảng thời gian + tóm tắt
(mã LK), "▾ Xem n mục" mở từng mục. Bình luận không gộp. Dùng ở popup PO (Nhật ký xử lý, tối đa 1.500 mục trước gộp) và popup mã LK.
Dữ liệu event_log không đổi. `gopTrung` (trùng hệt) vẫn chạy trước.

## ETX nhân sự

Danh bạ nhân sự kéo từ ETX (`lib/etxNhanSu.ts`, `routes/etxNhanSu.ts`, tab "ETX nhân sự" ở Cài đặt › Người dùng),
**chỉ bấm tay** (không cron). Liên kết `users` ↔ `etx_nhan_su` theo Gmail hiệu lực = `gmail_gan_tay` (Admin gán;
`''` = chủ động bỏ liên kết) nếu có, ngược lại Gmail ETX. Chỉ đồng bộ **họ tên + chức danh** — `users.vai_tro`
vẫn gán tay. Nghỉ việc (on→off) tự khoá tài khoản liên kết (trừ BOOTSTRAP_ADMIN). Secret `ETX_HR_API_KEY` dùng
chung key với `../../linh-kien-app`.

## Trạng thái

Đã lên production (xem `frontend/src/version.ts`). Phase 1–4 + UAT báo cáo xong; tài liệu hướng dẫn KH cung ứng
ở `../huong-dan/`. Còn mở: gộp chuỗi EO copy (`CPMH-`/`Copy-` → EO gốc, Phase 2b — chỉ ảnh hưởng màn chi tiết EO,
không ảnh hưởng báo cáo); nút "Rút phiếu" thẩm định (backend có, UI chưa có).
`../CHOT_OPEN_QUESTIONS.md` giữ trạng thái các quyết định nghiệp vụ.

Local dev trên Windows: `wrangler dev` mồ côi giữ cổng 8790 / khóa `.wrangler/state` — tìm tiến trình
`node … wrangler … dev` rồi `taskkill /F /T /PID <pid>` (chỉ kill `workerd.exe` thì wrangler sinh lại ngay).
`.wrangler/state` hiện là bộ dữ liệu demo cho ảnh chụp hướng dẫn; bản DB migrate gốc ở `.wrangler/state.bak-*`.

## Nhận việc từ Trợ lý Mây (tự sửa)
- Issue gắn nhãn `may:tu-sua` là việc do Trợ lý Mây chuyển sang, mã `MAY-xxxxx` ở tiêu đề. Sửa ĐÚNG phạm vi mô tả.
- Kiểm tra bắt buộc trước khi mở PR: `npm run build` (eslint chạy trước; đỏ = dừng). Flutter: `flutter analyze && flutter build web`.
- Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG BAO GIỜ: sửa `firestore.rules`/`storage.rules`/hàm `hrLink`/secrets; chạy `firebase deploy` trần; đổi tính năng ngoài issue; xoá dữ liệu.
- Không chắc / cần người quyết: bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
- Deploy do workflow `may-deploy` làm sau khi được duyệt — KHÔNG tự deploy trong lúc sửa.
