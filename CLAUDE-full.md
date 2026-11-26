# CLAUDE-full.md — hệ EO Mua hàng (bản CHI TIẾT ĐẦY ĐỦ)

> Bản rút gọn (luật chính, < 10 KB, app chủ trên đám mây đọc) nằm ở [`CLAUDE.md`](CLAUDE.md). File này KHÔNG tự nạp vào phiên — mở khi cần chi tiết.
> Từ 24/11/2026 mọi tính năng / quyết định mới ghi chi tiết TẠI ĐÂY; CLAUDE.md chỉ giữ luật chung.

Ứng dụng web nội bộ quản lý **EO mua hàng** (yêu cầu mua linh kiện) của 3T: tạo EO → thẩm định →
duyệt cuối → ban hành → theo dõi kế hoạch hàng về → đối chiếu với AMIS (MISA) → 4 báo cáo.
Thay cho hệ no-code trên Google Sheets. Chuỗi tài liệu thiết kế ở thư mục cha
(`../TARGET_ARCHITECTURE.md`, `../TARGET_DATABASE.md`, `../WORKFLOW_SPEC.md`, `../PERMISSION_SPEC.md`,
`../REPORT_SPEC.md`, `../MIGRATION_PLAN.md`, `../CHOT_OPEN_QUESTIONS.md`, `../REPORT_LOGIC_EXTRACT.md`).

## Stack

Cloudflare Workers (Hono) phục vụ cả API lẫn frontend tĩnh từ 1 Worker · D1 (SQLite) · React + Vite +
Tailwind. Google OAuth tự cài trong Worker, session JWT cookie. **Không R2.** Từ v0.105 có **1 cron mỗi giờ** (`scheduled()` ở `index.ts` → `danhGiaQuyTac`); phần còn lại vẫn chạy sau request API. Quy ước kỹ
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
- Secrets (`wrangler secret put`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ETX_HR_API_KEY`, `DVBH_API_KEY`, `DOC_API_KEY` (API đọc v0.091, chưa đặt),
  `THEODOI_MUAHANG_API_KEY` (chưa đặt — khi app theo-doi-mua-hang sẵn sàng), `TASK_FEED_KEY` (v0.116 Cổng nhiệm vụ eOffice, mã app `mua-hang`;
  khoá ở skill `qlbh3t-cf-integrations` Phần 4 — nạp bằng pipe, không in).
- **Cổng nhiệm vụ (v0.116)** `lib/congNhiemVu.ts` + `routes/congNhiemVu.ts` + FE `pages/eo/NutCongNhiemVu.tsx`: ảnh chụp đủ PO chờ duyệt (cùng điều kiện
  `approvals /count`) → `taskFeedNhan` `toanBo:true`. Gọi từ middleware `/api/*` (version eo/users đổi + hash hàng chờ đổi), cron mỗi giờ (force), nút Đơn PO.
  Đổi điều kiện "chờ duyệt" ở `approvals.ts` thì sửa cả `gomViecChoDuyet`. Đăng nhập nhận `?next=/đường-dẫn` (cookie 10 phút) để link từ App Nhiệm vụ mở đúng PO.
- Service Binding `DVBH` → Worker `dvbh` (app DVBH, repo `../../cloudflare smarttrade base`).
- Bump `frontend/src/version.ts` (`+0.001`, sửa tay chuỗi) trước mỗi deploy.

## Cấu trúc

```
migrations/                  0001 schema · 0002 don_gia · 0003 report_cache · 0004 google_drive_oauth
                             · 0005 notifications · 0006 etx_nhan_su · 0007 thay mã + kế hoạch tuần
                             · 0008 hủy / đồng bộ lại AMIS · 0009 khóa chống trùng AMIS
                             · 0010 đồng bộ PO sang DVBH · 0011 xóa mềm file đính kèm
                             · 0012 theo dõi linh kiện đặt (lỗi / giải trình / push / mail) · 0013 mốc bỏ qua đơn cũ
                             · 0014 từ chối dòng sau BH · 0015 chỉ mục hiệu năng · 0016 vi phạm (nhắc nhở, giải trình PO) · 0017 R1 48h · 0018 kết thúc sớm · 0019 khoá tính báo cáo · 0020 chuẩn hoá đối tác/lý do + Gmail phụ + R1 24h · 0021 cache theo dòng · 0022 ghi lỗi dựng cache · 0023 nhắc đối tác không qua mail · 0024 lý do hết hàng · 0025 nhắc hết hạn + push · 0026 chờ NCC báo ngày + bỏ vi phạm cũ
backend/src/
  index.ts                   Hono app, mount router, middleware chain
  middleware/                session (OAuth/JWT), guards (loadUser/requireApproved/requireWrite/requireAdmin)
  lib/                       eoAccess (quyền hành động), amisMatch (khớp AMIS↔EO), reportCache + dataVersions,
                             audit (event_log), notify, googleDrive + secretBox, etxNhanSu, week, vnTime, jwt
  routes/                    auth, users, eo, approvals, plans, amis, reports (4 BC), dashboard, dieuHanh, danhMuc
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
thứ 2/4 chỉ cần giải trình 1 lần; FE hiện 1 dòng "× n lần". R3 dùng mail `tl_mail` đã đồng bộ qua hộp thư theo dõi, khớp mã push hoặc dòng, và `tl_lien_he` trong kỳ (sau ngày kiểm tra trước đến hết thứ 2/4). `danhGiaQuyTac` tự xoá lỗi R3 đang chờ nếu mail hoặc liên hệ về muộn đúng kỳ (event `XOA_LOI_THEO_DOI`). Tạo đợt / tải Excel / mở bản nháp chưa tính. Domain version `theo_doi` (DVBH tag có).
**Tạo mail nhắc**: một đợt và một Excel cho toàn bộ lựa chọn, hiển thị To/CC từng đối tác trong popup. Lưu theo tài khoản và đối tác bằng `localStorage`, mặc định To từ `tl_mail.den`, luôn CC `theodoimuahang@gmail.com`. Xác nhận tạo `.eml` có sẵn file đính kèm để mở Outlook. Tự mở tùy cài đặt trình duyệt và ứng dụng mặc định của Windows. Người dùng tự bấm gửi. Luồng xác nhận và cấu hình được mô tả trong `../THEO_DOI_LINH_KIEN_DAT.md` mục 2.

### Bàn giao Tạo mail nhắc (18/11/2026)

- **v0.088: TẠM TẮT nút "Tạo mail nhắc"** theo yêu cầu chủ hệ thống (ẩn ở Đơn hàng, popup PO, popup LK qua cờ `BAT_TAO_MAIL_NHAC = false` trong `frontend/src/pages/theodoi/shared.tsx`). Người dùng tự gửi mail thủ công. Phân tích hướng mở lại ở `nhat_ky_lam_viec.md` mục v0.088. Các ghi chú dưới đây là trạng thái code khi tắt.

- **Chưa đạt yêu cầu mở Outlook từ một cú bấm.** Ở Đơn hàng, nút **Tạo mail nhắc** tạo đợt và mở popup để sửa To/CC theo từng đối tác. Nút **Xác nhận và mở Outlook** hiện chỉ lưu To/CC theo tài khoản và đối tác trong `localStorage`, sau đó tạo và tải bản nháp `.eml` bằng liên kết download. Mã dùng chung nằm trong `frontend/src/pages/theodoi/shared.tsx` (`PushKetQua`).
- **Kết quả kiểm thử:** Bấm trực tiếp trên Chrome với Worker và D1 cục bộ. Chọn hai dòng, xác nhận, Chrome tải một `.eml` có đúng To/CC và một Excel chứa đủ hai dòng. Outlook không tự mở trong lần thử. Mở tệp thử thủ công bằng **Open with → Outlook (classic)** thì hiện cửa sổ soạn thư có nút Send, đúng To/CC, tiêu đề, nội dung và tệp đính kèm. Chưa triển khai production, chưa gửi thư thật.
- **Yêu cầu cần triển khai tiếp:** Sau khi sửa To/CC và bấm xác nhận trên web, Outlook mở ngay cửa sổ soạn thư có To/CC, tiêu đề, nội dung và một Excel đính kèm, không cần người dùng tìm hoặc mở tệp tải xuống. Người dùng tự bấm Gửi. Kiểm thử từ nút trên web đến cửa sổ soạn thư Outlook thực tế. Mở thủ công tệp `.eml` chưa đạt tiêu chí này.
- **Xác nhận đã nhắc:** Luôn CC `theodoimuahang@gmail.com`. Đợt vẫn **Chưa gửi** khi tạo bản nháp hoặc mở Outlook. Luồng hộp thư theo dõi xác nhận khi mail đồng bộ qua `POST /api/partner/mail-events` khớp mã nhắc hoặc dòng. Đã thử thành công với dữ liệu mail mô phỏng gửi vào API cục bộ. Kiểm thử Outlook có thể dừng ở cửa sổ soạn thư.

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

## Nhắc giải trình: cron mỗi giờ + Web Push + popup (v0.105, migration 0025)

Yêu cầu (19/11/2026, làm tương tự app linh kiện): *"Hệ thống tự quét mỗi giờ. Ca quá hạn sẽ báo đích danh người phải giải trình, và nhắc lại khi còn
6 giờ là hết hạn giải trình. đẩy qua thông báo, khi mở sẽ hiện popup nhắc nhở."*
- Cron `0 * * * *` (`wrangler.jsonc` `triggers`) → `danhGiaQuyTac(env)` (vẫn giới hạn 10 phút / lần như khi chạy sau request).
- `nhacSapHetHan` (cuối `danhGiaQuyTac`, `lib/theoDoi.ts`): lỗi `CHO_GIAI_TRINH` (trừ `TAY`) còn ≤ `GIO_NHAC_HET_HAN` = 6 giờ LV tới `congGioLV(han, GIO_TU_DONG)`
  → `tl_loi.nhac_het_han_luc` (1 lần / lỗi) + `tl_nhac_nho` + `notification` (gộp người × EO) + Web Push. Người nhận = `COALESCE(ai_email, eo.created_by)`.
  Lỗi mới cũng đẩy push (`dayPushLoi`, gộp 1 tin / người). Push url `/?nhac_giai_trinh=1` → popup mở lại.
- Web Push = bản sao linh-kien-app: `lib/webPush.ts` (`@block65/webcrypto-web-push`), `routes/push.ts` (`/api/push`), `frontend/public/sw.js`,
  `hooks/usePushNotifications.ts`, bảng `push_subscriptions`. Cặp khoá VAPID RIÊNG của app này: public ở `vars.VAPID_SERVER_PUBLIC_KEY`, private qua
  `wrangler secret put VAPID_SERVER_PRIVATE_KEY` (thiếu → không gửi, không lỗi). Nút "🔔 Bật đẩy / 🔕 Tắt đẩy" ở đầu popup chuông (`NutThongBaoDay`).
- Popup `components/NhacGiaiTrinhPopup.tsx` (mount ở `App.tsx`) ← `GET /api/vi-pham/nhac-cua-toi` (lỗi chờ của tôi — CÙNG điều kiện số "Vi phạm của bạn chờ
  giải trình" ở `viecCanLam`; gộp theo dòng LK, `han`, `con_gio`, `sap_het`). "Để sau" = sessionStorage, khoá = tập dòng + số lỗi + cờ sắp hết.

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
R1 = **16h làm việc** (`GIO_R1` ở `lib/theoDoi.ts`; v0.103 quy đổi từ 48h); `danhGiaQuyTac` đồng bộ lỗi R1 đang chờ với mốc hiện tại (hết vi phạm → xóa + event
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

**Bộ lọc chọn NHIỀU (v0.090, nguyên tắc chủ hệ thống 2026-11-18)**: mọi bộ lọc theo danh sách giá trị dùng `components/ChonNhieu.tsx`
(checkbox, tìm không dấu, Chọn tất cả / Bỏ chọn, số đếm, × xoá) — KHÔNG dùng `<select>` 1 giá trị cho bộ lọc. Cùng bộ lọc = HOẶC, khác bộ lọc = VÀ.
Gửi server: nối "|" (`noiDs` / `tachDs` FE, `dsThamSo` ở `backend/src/lib/thamSo.ts`; SQL dùng `IN (SELECT value FROM json_each(?))`).
Đang dùng: Đơn PO › Lọc khác (kho / đối tác / lý do — `GET /eo?kho=A|B`), LK đặt (nhóm nhanh = hợp các nhóm, giai đoạn), Điều hành (người / NCC / kho),
Vi phạm (mức / loại lỗi / người / kho / đối tác), Nhập AMIS (kho, trạng thái khớp — `GET /amis/receipts?kho=&khop=`), Báo cáo giai đoạn.
Giữ chọn 1: ô chế độ (Xem, khoảng ngày theo…, sắp theo), bộ lọc 2 giá trị (đúng/trễ, chờ/đã giải trình, đang làm/nghỉ), ô nhập trong form.

## 8 giai đoạn đơn hàng — `backend/src/lib/giaiDoan.ts` (FE nhãn `frontend/src/lib/giaiDoan.tsx`)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & BH · G4 Gửi đơn NCC (mail GUI đầu tiên trong `tl_mail`, CC theodoimuahang —
luồng SONG SONG, không chặn giai đoạn hiện tại) · G5 Có ngày dự kiến · G6 Chờ SX & giao (hạn = ngày DK lần đầu) ·
G7 Nhập kho & lên hệ thống (ngày CT AMIS → `amis_receipt.created_at`, chỉ đo) · G8 Giao bù đến đủ. Giờ & hạn = giờ LÀM VIỆC
(lịch chung `lib/gioLamViec.ts`); hạn `app_settings.giai_doan_sla` (JSON giờ LÀM VIỆC, mặc định 8/…/G8 56). Chốt 2026-10-29: CHỈ đo + báo cáo
đúng/trễ hạn, chưa sinh lỗi giải trình (bật sau 2–4 tuần). `layGiaiDoan(env)` cache mốc, phần "bây giờ" tính lúc request.
Báo cáo giai đoạn = tab Báo cáo của Quản lý đơn hàng (`/don-hang?tab=bao-cao&bc=giai-doan`).
**v0.089**: giai đoạn hiện tại = bước MỚI NHẤT đang mở (`ketQuaGd`); EO qua nháp thì G1 luôn đóng (PO cũ không có `eo_submission`). Đổi cách tính
giai đoạn / theo dõi → đổi khoá `rep:giai-doan:vN` VÀ hậu tố tag ở `lib/dongCache.ts` (`|gdN`), nếu không `dong_cache` giữ kết quả cũ tới hết ngày.

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
  `chuanHoaDong`: bí danh tự quy đổi (KRF/KAROFI → Karofi), giá trị lạ → 400 `GIA_TRI_KHONG_CHUAN` (FE `loiChuanTxt`). Lý do PS chỉ 5 giá
  trị: Ký gửi · Đặt lần đầu · Kế hoạch tháng · Phát sinh · Hết hàng (v0.082, migration 0024; FE `ChonLyDo`). PATCH dòng: `b.reason` là lý do đổi SL — chỉ chuẩn hoá supplier.
  Dữ liệu cũ chuyển 1 lần bằng `scripts/_data/0020_chuyen_du_lieu.sql` (sinh bởi `scripts/gen_0020_chuan_hoa.py`, chứa giá trị thật — gitignore, repo công khai) (chốt với người dùng 2026-11-08: cảnh báo hết hàng → Phát sinh; lý do lạ → Phát sinh + chép
  "Lý do cũ: …" vào ghi chú; Media/MM → Media Mart; LKDH, NCC, Lọc tổng giữ riêng), bản gốc ở `supplier_goc` / `reason_goc`.
  Gợi ý ô chọn `GET /danh-muc/goi-y-dong` cache `dm:goi-y-dong:v3` theo version eo/amis/settings — thêm / sửa `dm_chuan` bằng **migration** (không bump
  version) thì phải đổi hậu tố khoá, nếu không ô chọn vẫn danh sách cũ (v0.083: "Hết hàng" của 0024 không hiện).
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
- **Nhắc đối tác không qua mail** (v0.080, migration 0023 `tl_lien_he`): `POST /theo-doi/lien-he` `{ eo_item_ids, kenh, ngay, gio?, nguoi_lien_he?, ket_qua, hinh_anh? }`
  (quyền `canEditPlan` từng dòng, ngày ≤ hôm nay và ≥ 7 ngày trước, kết quả bắt buộc). R3 coi như mail trong kỳ (`danhGiaQuyTac` gộp vào `mailBy`);
  ghi muộn → xoá lỗi R3 ĐANG CHỜ có kỳ `(kyR3Tu(X), X]` chứa ngày liên hệ (event `XOA_LOI_THEO_DOI`). Event `LIEN_HE_DOI_TAC`. FE nút "📞 Đã nhắc đối tác"
  (LK đặt khi tick, popup PO / mã LK khi tick, popup đơn hàng) → `LienHeDoiTacModal` (`pages/theodoi/shared.tsx`); lịch sử dòng có mục riêng.
- **Số lần lùi ngày DK** (v0.080): `/so-don-hang` dòng có `lui_ds` (chỉ khi có lùi); popup đơn hàng: ô "Số lần lùi ngày DK" + bảng từng lần (Xem chi tiết),
  dòng thông tin "lùi n lần · NM …"; popup PO / mã LK: "lùi n lần" dưới cột 3 ngày. Chỉ đếm cho PO ban hành từ `theo_doi_ap_dung_tu`.
  **Cách đếm lùi theo TỪNG ĐỢT** (v0.081, `demLui` ở `lib/theoDoi.ts`): sửa 1 đợt sang ngày muộn hơn · xoá đợt rồi thêm đợt ngày muộn hơn ≤ 30 phút cùng người ·
  import thay thế có ngày muộn nhất muộn hơn. Thêm đợt giao bù / import thêm / cắt KH (metadata `ly_do`) KHÔNG tính. Cache `tl:goc-theo-doi:v7`.
- **Hủy / kết thúc sớm luôn bắt buộc lý do** (v0.077): hủy EO `POST /eo/:id/cancel` → 400 `REASON_REQUIRED` (trước đây tuỳ chọn); hộp sửa SL đặt = 0
  (hủy dòng) bắt buộc lý do cả khi EO nháp (chỉ ở FE — form sửa EO nháp xoá dòng vẫn gửi SL 0 không lý do). Thêm đường hủy mới thì cũng bắt buộc.
- **DONE** = trạng thái TÍNH (không đổi CHECK của `eo.trang_thai`): ISSUED + có dòng sống + mọi dòng sống về >= SL đặt. `GET /eo` trả `xong`,
  chip `done`, lọc cột trạng thái giá trị `DONE`; `STATUS_META.DONE`; popup EO tính `poDone`. Cache `eo:ds-v2`.

## Cần giải trình ≠ vi phạm (v0.109 hiển thị, v0.110 đếm + hạn 16h) — `frontend/src/lib/giaiTrinh.tsx`

Hiển thị lỗi theo trạng thái CAN_GT (còn hạn) / DA_GT / KHAC_PHUC / VI_PHAM (AUTO:QUA_HAN hoặc quá hạn chưa chốt) / TAY; hạn GT = `congGioLV(COALESCE(han, created_at), 56)`
— v0.110: hạn = `hanGiaiTrinh(moc)` (`lib/theoDoi.ts`): 16h LV nếu mốc ≥ `HAN_GT_16_TU` (2026-11-24), lỗi cũ 56h; FE `gioHanGt` PHẢI khớp. Dùng ở `LichSuDong`,
`BangLoiTheoBuoc`, bảng giai đoạn `DongQuickView`. Cấp CEO tự tính như cũ (≥ 3 lỗi vẫn đếm mọi lỗi), không có hạn GT.
**Vi phạm = hết hạn không giải trình** (v0.110): `dsLoiDayDu` trả `vi_pham`, `han_gt`, `con_gio_gt`, `so_lan_xau`; `trangThaiViPham` xét `TU_QUA_HAN` trước `DA_GT`;
`VpPo.vi_pham` + tt `VI_PHAM`; Điều hành `loi30.vp` (cache `dh:goc:v3`). FE ViPham: `vp(l)`, `cho(l)` = chờ & chưa quá hạn.
**v0.113** (migration 0026): `VP_CU_TRUOC` = 2026-11-01 (`lib/theoDoi.ts`, FE `lib/giaiTrinh.tsx`) — lỗi mốc trước đó = `AUTO:CU`, không tính vi phạm (`tu_dong` "CU",
FE "Bỏ qua · lỗi cũ"). `tl_lien_he` dựng lại (CHECK kênh thêm `MAIL`, cột `hen_lai`) — "Chờ NCC báo ngày": `danhGiaQuyTac` `dangChoNcc` bỏ R1 lặp / R3 trong [ngày liên hệ, hen_lai];
`viecCuaToi` nhóm `cho_ncc` + loại khỏi ndk / ngay_moi / push; `viecCanLam` không đếm. `MoiBatDay` (NhacGiaiTrinhPopup.tsx, mount App.tsx) mời bật push.
**v0.128** (chủ hệ thống 2026-11-26: "Bỏ toàn bộ vi phạm bị chốt từ trước 20/11 => tính là bỏ qua trước thời điểm đào tạo 20/11"): migration `0028` đổi
`tl_giai_trinh` AUTO `AUTO:QUA_HAN` có `created_at < 2026-11-20` → `AUTO:CU` (dùng lại nhóm "bỏ qua" của v0.113 để mọi chỗ đếm vi phạm tự loại; nhãn FE nêu cả 2 lý do).
Rà soát kèm: vai trò KH cung ứng thấy + giải trình được; 311 vi phạm của 1 NV bị chốt cùng lúc 18/11 14:38 (luật tự chốt v0.092 áp hồi tố) dù đã nhận 59 thông báo + 335 nhắc.

**v0.127** (chủ hệ thống 2026-11-26: "UI mở lên lại bị hiện phía sau UI cũ"): `lib/lop.ts` — lớp hiển thị theo thứ tự mở: `Modal` (components/ui) và mỗi lớp popup xem nhanh
(`LopXemNhanh` trong QuickView.tsx) lấy z = 200 + (số lớp đang mở + 1) × 10 lúc mở (`useLop`); Esc chỉ đóng lớp trên cùng (`laTrenCung`), không đóng khi đang mở bộ lọc cột
`.hop-loc` / ô chọn nhiều `[data-modal=""]`. Ô nổi `.hop-loc` và `MenuXo` z 2000 (trên mọi lớp). Trước: Modal cố định 200, popup 80+i → mở popup từ trong Modal bị nằm dưới.
**v0.125** (chủ hệ thống 2026-11-26 "Có, làm luôn" — ghi lỗi giải trình cho người duyệt khi duyệt trễ): migration 0027 dựng lại `tl_loi` (CHECK thêm `R5`) cùng 2 bảng con
`tl_giai_trinh` / `tl_nhac_nho` (DROP thẳng bảng cha đang bị tham chiếu → bộ đếm FK trễ không về 0, D1 rollback; `legacy_alter_table` không có tác dụng trên D1).
`danhGiaQuyTac` khối R5 (`R5_TU`, khoá `R5:A:<eo_approval.id>` neo dòng MIN(id) của PO | `R5:S:<item>`, ai_email = người duyệt); `tuGiaiTrinh` KHAC_PHUC R5 + gt_cung R5 chỉ cùng ai_email.
`lib/maLoi`: ER.MH-005, `AI_MAC_DINH.R5 = NGUOI_DUYET`, `khoaViPham` / `VP_SQL` nhánh R5 (PO|R5|email|ngày) — PHẢI khớp. `lib/eoAccess` `duocGiaiTrinh` (R5: ai_email hoặc Admin) dùng ở
`/theo-doi/giai-trinh` + `/vi-pham/giai-trinh-nhieu`; cập nhật lỗi giữ `ai_email` của R5; `/giai-trinh-po|dong` + `/vi-pham/po/:id` bỏ R5; `nhac-cua-toi` / viecCanLam vi_pham: người đặt
không nhận R5. `dsLoiDayDu` hiện R5 cả khi dòng chưa vào theo dõi. FE: nhãn R5 ở các bảng QT, `AI_MAC_DINH`, ViPham ẩn "Giải trình cả PO" với R5.
**v0.124** (chủ hệ thống 2026-11-26: "1. đơn đã kết thúc, bỏ việc duyệt hoặc từ chối 2. hiện quá nhiều thao tác, rút gọn lại 1 nút xổ xuống hoặc click vào để mở UI
đơn chi tiết 3. Các đơn bị quá hạn do người duyệt không duyệt này có hiện trong danh sách cần giải trình không?"): `lib/choDuyetSauBh.ts` `CHO_DUYET_SAU_BH_SQL(a)`
(PENDING + ACTIVE + chưa KTS + lũy kế AMIS < SL đặt) thay `post_issue_status = 'PENDING'` ở approvals /count + /post-issue, viecCanLam, routes/dieuHanh, dashboard,
eo list `so_dong_cho_duyet`, xemNhanh, congNhiemVu `gomViecChoDuyet` (giữ đồng bộ). FE `components/MenuXo.tsx` (nút ⋯, menu position fixed) thay cột Thao tác
EoQuickView; bấm dòng = `qv.openDong`; `dongKetThuc` ẩn Duyệt / Từ chối; `NhanSauBH` nhãn "Đã về đủ · bỏ duyệt". Sửa lỗi máy: `tinhGocTheoDoi` dòng sau BH
PENDING → `bat_dau` null (trước lấy created_at → ghi R1 khi chưa được đặt; 7 lỗi R1 PO 3TDO-000858 ngày 24/11, đã được NV giải trình — giữ nguyên); cache `tl:goc-theo-doi:v9`.
**v0.123** (chủ hệ thống 2026-11-26: "thiết kế hơn khó nhìn … Tại sao tổng lại không bằng PO lỗi lẻ cộng lại ví dụ 26 + 12 tổng lại là 30?"): `BangTrachNhiem` vẽ lại —
mảng `COT` (nhom / v / tc / xau / phu / r), tiêu đề 2 tầng `nhomCot`, ô `O` tô nền đỏ theo `v / maxCot` (chỉ hàng con), CSS `.bt-tbl` trong `<style>` của component;
ghi chú `poCa2` / `caCa2` (PO, ca lỗi ở cả 2 bên). Trả lời: PO / ca lỗi là đếm KHÁC NHAU (distinct) nên không cộng dồn được.
**v0.122** (chủ hệ thống 2026-11-26: "tạo 1 bảng table danh sách lỗi NCC, lỗi nội bộ rồi các tính số ca PO, số đơn đặt, số linh kiện tồn, tỷ lệ %, số đơn tồn trên 7 ngày,
14 ngày, 21 ngày, trên 30 ngày, tỷ lệ đã giải trình, số ca còn chưa giải trình … có thể click vào để xem danh sách chi tiết"): `DongDh.g4` / `ben` / `vb` (lib/dieuHanh.ts,
cache `dh:goc:v5`, `hd.vb` = GROUP_CONCAT `VP_SQL~N|B~C|V|G|T`). FE `pages/dieuhanh/BangTrachNhiem.tsx` (`BangTrachNhiem`, `DanhSachDong`, `DanhSachDuyet`) dùng ở
DieuHanh tab `bang` (mặc định) và Dashboard `TrachNhiemLanhDao` (vai trò Admin / KH cung ung / Theo doi tien do / View, query `["dieu-hanh"]` dùng chung).
**v0.121** (chủ hệ thống 2026-11-26: "Giải trình sẽ thêm mục lựa chọn do ai, thêm bằng chứng không bắt buộc. các giai đoạn sẽ đều có người chịu trách nhiệm…
từ khi gửi mail yc đến khi hàng về chậm thì là do nhà cc"): `GIAI_DOAN[].ben` (lib/giaiDoan.ts, FE `components/TienTrinh.tsx` GD_8 đồng bộ tay) — G5/G6/G8 `NCC`, còn lại `NOI_BO`;
`chiuTrachNhiem` G5 = NCC. `lib/maLoi.ts`: `AI_MAC_DINH` (R1/R4 DOI_TAC, R3 NGUOI_DAT — FE `lib/giaiTrinh.tsx` khớp), `benCuaAi`, `BEN_SQL` (bên của lỗi: giải trình thật → ai_ma, còn lại theo quy tắc).
`danhGiaQuyTac` ghi `ai_ma` = AI_MAC_DINH (ai_email vẫn người đặt). `kiemBangChung` chỉ báo khi tick dung_mail mà thiếu thư (bỏ `CAN_HINH_ANH`). Điều hành `loi30.ben` (cache `dh:goc:v4`),
`giai_doan[].ben`; FE DieuHanh `TrachNhiem` (3 khối Nội bộ / NCC / Không giải trình). FE `ChonDoAi` + `aiGoiY` (lib/giaiTrinh.tsx) dùng ở 4 form (shared GiaiTrinhModal,
GiaiTrinhPo Po/Nhieu/Dong): chưa chọn → `aiDung` = gợi ý; `AnhBangChung` bỏ prop `batBuoc`.
**v0.120**: `R4_TON_CU_TU` = 2026-11-27 08:00 (lib/theoDoi.ts) — `danhGiaQuyTac` vòng riêng cho dòng `!ap_dung` (PO trước `theo_doi_ap_dung_tu`, đã lọc ≥ `theo_doi_bo_qua_truoc`)
còn mở + quá ngày DK: `han_cap_nhat_lai` < mốc → R4 khoá `…:TON` mốc R4_TON_CU_TU, sau mốc → R4 thường; bỏ nếu `daVe`. Chỉ R4. `viecCuaToi` (giai_trinh) và
`viecCanLam` (loiCho) lấy dòng có lỗi chờ KHÔNG lọc `ap_dung`; các mục khác vẫn lọc `ap_dung`. Yêu cầu: "tại sao ca này chậm ngày dự kiến lâu như vậy rồi mà chưa bị tính lỗi?" → "Có, làm luôn".
**v0.115**: `R4_TON_TU` (lib/theoDoi.ts) — dòng quá ngày DK từ trước `VP_CU_TRUOC` vẫn tồn → thêm 1 lỗi R4 khoá `…:TON` mốc 24/11 08:00 (bỏ lỗi cũ, không bỏ theo dõi).
**v0.114**: `kiemBangChung` (lib/theoDoi.ts) — mọi API giải trình nhận `dung_mail` thay ảnh R1/R4, kiểm thư / liên hệ từng dòng (`THIEU_THU`). Việc của tôi ④ `BangGiaiTrinh`
(pages/ViecCuaToi.tsx, localStorage `vct-gt-xem`) nhóm PO / mã LK + tick → `GiaiTrinhDongModal`.
`DataTable` (v0.117): ô chọn số dòng / trang `SO_DONG` ở `SimplePager` (mọi bảng có `pageSize`), prop `luuSoDong` = khoá localStorage nhớ lựa chọn,
prop `thanhTren` = thanh cuộn ngang trên đầu bảng không cần `khungCao`; LK đặt `TRANG` = 8, `sdh-so-dong`.
`DataTable` prop `q` = ô tìm chung bên ngoài (ẩn ô tìm riêng) — popup PO / đơn hàng dùng `O_TIM` (`components/quickview/QuickView.tsx`) trên thanh tab,
truyền `tim` xuống mọi tab (BangLoiTheoBuoc, LuongTraoDoiNcc, TabKeHoach, TabTaiLieu). `DataTable` prop `khungCao` = cuộn trong khung (tiêu đề dính, thanh ngang trên đầu) — popup PO tab Linh kiện.

## Việc của tôi + cột Vi phạm Đơn PO (v0.104)

- `/viec-cua-toi` (menu đầu tiên): `routes/viecCuaToi.ts` (dòng `layDongTheoDoi('dang_mo')` lọc của tôi như viecCanLam; 4 nhóm ndk / push / ngay_moi /
  giai_trinh kèm `han` + `con_gio` giờ LV) + `pages/ViecCuaToi.tsx` (dùng lại NgayHangVeModal / GiaiTrinhModal / LienHeDoiTacModal). Mail push = link Gmail
  `mail.google.com/mail/?view=cm` (CC hộp theo dõi, tiêu đề có mã 3TDO, thân có mã LK) — người dùng tự gửi. viecCanLam `theo_doi.to` = `/viec-cua-toi`.
- Cột Vi phạm Đơn PO: `viPhamTheoPo` (lib/dieuHanh) — PHẢI cùng cách đếm với màn Vi phạm (dsLoiDayDu + vp_khoa + trangThaiViPham).

## Giờ làm việc (v0.103) — `backend/src/lib/gioLamViec.ts`

MỌI SLA / hạn (R1, R4, 8 giai đoạn, hạn giải trình tự đóng, mức độ vi phạm, Điều hành lỗi chờ, ca CEO) dùng `congGioLV` / `demGioLV`:
T2–T6 8:00–12:00 + 13:00–17:00 (8h) · T7 8:00–12:00 (4h) · CN nghỉ; 24h cũ = 8h LV. Không tự viết vòng lặp giờ / chia 24 — dùng 2 hàm này (FE `gioTxt`: 1 ngày LV = 8 giờ).
`GIO_LV_TU` = mốc đổi: khối đồng bộ lỗi R1 đang chờ (`danhGiaQuyTac`) chỉ xét lỗi ghi từ mốc này (lỗi cũ giữ hạn cũ). Hạn giải trình `GIO_TU_DONG` = 56.
Chỉ số hoạt động (im lặng, thúc NCC 7 ngày), R3 thứ 2/4, R1 lặp thứ 3/6, mốc tồn vẫn theo ngày lịch. Ngày lễ chưa trừ.

## Điều hành cho lãnh đạo (v0.084, `../QUAN_TRI_DIEU_HANH.md`) — menu "Điều hành" ngay dưới Tổng quan

- `lib/dieuHanh.ts` `layDongDieuHanh`: dòng LK đang mở (`layDongTheoDoi('dang_mo')`) + hoạt động theo dòng (cache `dh:goc:v1`, version eo/amis/theo_doi
  + ngày: kế hoạch, push, `tl_mail` GUI/NHAN, `tl_lien_he`, giải trình, lỗi, nhắc; lỗi 30 ngày theo người / NCC; giải trình theo Ai × Lỗi; lịch sử)
  → mức `DO/VANG/XANH` + `ly_do` + `diem`. Ngưỡng `IM_LANG_DO` 7 / `IM_LANG_VANG` 3 / `LOI_CHO_DO` 7 ngày. Truy vấn dùng cột "trần" SQLite (MAX + cột
  không gộp = dòng của MAX) để lấy người / nội dung lần cuối. Đổi định dạng → đổi hậu tố khoá cache.
- `GET /api/dieu-hanh` 1 payload cho FE `pages/DieuHanh.tsx` (FE tự gom theo người / NCC / kho). `POST /dieu-hanh/nhac-nguoi` (quyền `xemToanBoTheoDoi`)
  dùng `ghiNhacNho` (export từ `routes/viPham.ts`, chung với `/vi-pham/nhac-nho`).
- Đơn PO: `routes/eo.ts` `dsEoDh` gắn `dh` (`tomTatTheoPo`, ghi nhớ trong isolate ≤ 5 phút theo version tag — KHÔNG nằm trong cache `eo:ds-v2`);
  chip `po_do/po_im_lang/po_loi_cho`, `COT_EO` `canh_bao/loi_cho/thuc/im_lang`. FE sắp thứ tự cột bằng `THU_TU_COT` (cảnh báo sát mã PO).
- v0.086: `tomTatTheoPo` trả `{ dh, gd }` — `gd` = số dòng đang ở từng giai đoạn theo PO → cột **Tiến trình** (`components/TienTrinhPo.tsx`, key cột vẫn
  `trang_thai`). Bộ lọc cá nhân Đơn PO: localStorage `eo-loc-luu` / `eo-loc-mac-dinh`.
- **Hướng dẫn HTML** `frontend/public/huong-dan/*.html` (tĩnh, `hd.css` + `hd.js` dựng thanh trên / mục lục / phóng ảnh), ảnh `img/*.jpg` chụp từ local
  dữ liệu DEMO bằng `../huong-dan/_build/shots-v086.mjs` — đổi giao diện thì chụp lại (`node shots-v086.mjs [ten-anh]`, cần dev server 5176 + worker 8790).
- **v0.091 mã lỗi ER.MH** `lib/maLoi.ts` (`layBangMaLoi`, `maCuaLoi`, `ganMaLoi`; TAY theo danh mục LOI, mã mới cấp 106+ theo thứ tự) + `lib/baoCaoLoi.ts`
  (`dsLoiDayDu` = danh sách lỗi của màn Vi phạm, đã tách khỏi `routes/viPham`; `tongHopTheoMa`; `dsCaCeo`). Dùng ở `/vi-pham` (+ `/vi-pham/ma-loi`, `/bang-ma`),
  `/ca-ceo` (`routes/caCeo.ts`), `/theo-doi/dong/:id`, `/xem/eo/:id/bo-sung`, API đọc `routes/partner.ts` (secret `DOC_API_KEY`, middleware `docKey`).
- **v0.126** `POST /api/partner/theo-id` { ids[], po_lk[] } (≤1000 mỗi loại, cùng lõi `traTheoId` với GET ≤50): app Linh kiện `lib/dongBoNgayEo.ts` gọi mỗi giờ, lấy dòng EO
  ISSUED + chưa kết thúc + có `ngay_du_kien` (sớm nhất) rồi GHI ĐÈ ngày + mã PO lên ticket THB / TLK đang mở (chốt 26/11/2026 "EO ghi đè luôn" — bug LK 3004022213 /
  THB-000147: ngày nhập EO 20/11 không sang app Linh kiện). Đổi dạng trả của theo-id thì sửa cả bên đó.
- **v0.108** `GET /api/partner/theo-id` cho app linh kiện (`../../linh-kien-app` `lib/muaHangClient.ts`, Service Binding `MUAHANG_SERVICE`, secret `MUAHANG_DOC_API_KEY` = `DOC_API_KEY` bên này):
  chỉ mục mã (tách từng mã trong ô `crm_id` / `order_id`) giữ trong bộ nhớ isolate theo version `eo`, chi tiết dòng đọc `dong_cache` theo `item_id` (~30 dòng D1 / lượt).
  Đo SQL từng API trên fixture demo: `node scripts/do-sql-api.mjs <năm> <đường dẫn…>` (Git Bash cần `MSYS_NO_PATHCONV=1`; fixture chung `scripts/demo-d1-seed.mjs`).
  FE: `components/BangLoiTheoBuoc.tsx` (tab Mã lỗi & giải trình ở 2 popup), `components/LuongTraoDoiNcc.tsx` (tab Trao đổi NCC), `pages/CaCeo.tsx`.
- **v0.099** cache trình duyệt gắn `APP_VERSION` (đổi cấu trúc dữ liệu API → PHẢI tăng phiên bản để bỏ cache cũ); `KhungLoi` bọc mọi màn (App.tsx).
- **v0.097/v0.098** Ca CEO độ hot `lib/caCeo.ts` (`dsCaCeoXuLy`, `demTheoMuc`; RAT_HOT / GIAM_HOT / DA_XONG, gồm dòng đã đóng tính lại 3 ngưỡng) — dùng chung route `/ca-ceo` + partner. Hiệu năng: `lib/cacheTrinhDuyet.ts`
  (React Query dehydrate/hydrate ↔ IndexedDB `eomua-cache`/`rq-v1`, danh sách key `LUU` — thêm query đọc mới muốn mở nhanh thì thêm vào), `main.tsx` nạp trước khi
  render; `App.tsx` route `React.lazy`; `cachedReport` nhớ JSON trong isolate (`NHO`, ≤ 48MB) + `opts.tagThem`; `/dashboard/quan-ly` cache theo giờ. Nút `NutTaiLai` (AppShell).
- **v0.100** ca CEO gộp = PO + mã CEO: `gomCaCeo` (backend `lib/caCeo.ts`) ↔ `gomCa` (FE `lib/caCeo.ts`, dùng ở `pages/CaCeo.tsx` + ô Ca CEO `pages/ViPham.tsx` — v0.101) PHẢI cùng quy tắc; viPham `dem_ceo` + viecCanLam đếm theo ca.
- **v0.095** R1 lặp thứ 3/6: vòng lặp sau `add(R1)` trong `danhGiaQuyTac`, khoá `R1:<item>:<ngày>`, mốc `app_settings.r1_lap_tu` (`R1_LAP_TU_MAC_DINH`); khối đồng bộ R1
  "theo mốc hiện tại" CHỈ lấy `khoa = 'R1:' || eo_item_id` (không sửa hạn lỗi lặp). `khoaViPham` R1 có ngày → `eo|R1|ngày`. Đơn PO `doi_tac_po` (cache `eo:ds-v3`),
  Giải trình hàng loạt `pages/eo/GiaiTrinhHangLoat.tsx`. Tên G5 "Chờ ngày DK", G6 "Chờ giao hàng".
- **v0.094 Ngày đặt hàng** = ngày PO duyệt mua (`issued_at`) / dòng sau BH = `post_issue_approved_at`: `/so-don-hang` trường `ngay_dat_hang` (hậu tố cache dòng `|gd3`),
  Excel popup PO (`xuatDongEo`) + LK đặt (luôn kèm cột). Khác `ngayDatCua` FE (mốc tính tồn: dòng sau BH = ngày tạo dòng).
- **v0.093 vi phạm gộp** `khoaViPham` (JS) / `VP_SQL` (SQL) ở `lib/maLoi.ts` — PHẢI khớp nhau: R1 `eo|R1`, R3/R4 `eo|qt|ngay_tham_chieu`, TAY `eo|TAY|loi_ma|ngày`.
  Mọi số đếm lỗi hiển thị dùng khoá này (baoCaoLoi `vp_khoa`/`gomViPham`, dieuHanh `vp_cho` + loi30 + độ phủ, FE ViPham `gomLoi`/`soVp`, `BangLoiTheoBuoc`).
- **v0.092 tự giải trình** `tuGiaiTrinh` (cuối `danhGiaQuyTac`, `lib/theoDoi.ts`): `tl_giai_trinh.pham_vi = 'AUTO'`, `nhom` `AUTO:KHAC_PHUC` | `AUTO:QUA_HAN`
  (`SO_NGAY_TU_DONG` = 7), người ghi `BOOTSTRAP_ADMIN_EMAIL`, event `AUTO_GIAI_TRINH`. MỌI truy vấn "giải trình thật" phải loại `pham_vi = 'AUTO'`
  (dieuHanh hoạt động cuối / xu hướng / nguyên nhân / độ phủ, baoCaoLoi `tu_dong`). Bảng mã lỗi: `pages/BangMaLoi.tsx` (`/ma-loi`).
- **v0.118** tab Theo PO: `gomPo` / `BangPo` (`pages/DieuHanh.tsx`, gom ở FE từ `dong` như Theo NCC), lọc Điểm nóng theo PO = state `poChon`.
- `nhomLyDo` (gom lý do đỏ) có 2 bản: backend `lib/dieuHanh.ts` + FE `pages/DieuHanh.tsx` — sửa cả hai.

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

<!-- may-ba-lan -->
## Ba làn xử lý của Trợ lý Mây (Giám đốc chốt 18/11/2026 — áp dụng VĨNH VIỄN cho app này)
Mỗi việc Mây giao thuộc MỘT trong ba làn. Khi viết ý tưởng / BRD, dòng đầu ghi `**Làn:** nhanh | thường | đầy đủ — <lý do 1 câu>`.
Mây xếp sai thì app ghi đúng làn: app ghi **nhanh** → Mây chuyển ngay sang làn nhanh (không đợi duyệt).
- **Làn nhanh** — xử lý trọn, KHÔNG qua duyệt, vài phút là xong (như Giám đốc chat trực tiếp với phiên này):
  lệnh của Giám đốc · cấp / sửa / thu hồi quyền cho người cụ thể · dữ liệu sai / trùng / kẹt (huỷ mềm, mở lại, đẩy lại, sửa trường có bằng chứng) ·
  thêm / sửa danh mục, cấu hình · lỗi rõ ràng sửa nhỏ không đổi luật · hỏi cách dùng (app đã làm được → hướng dẫn Cách 1 / Cách 2) · lấy số liệu.
  Cách làm: tra dữ liệu thật → ghi dữ liệu qua khối `may-thao-tac` (Mây tự ghi, lưu trước/sau) → sửa luôn nguyên nhân nếu là lỗi mã →
  kiểm → `## BÁO CÁO KẾT QUẢ` (Đã làm · Vì sao bị · Đã sửa · Không đụng tới). Cấp quyền: khai `cap_quyen` { nguoi, vai, vai_cao }.
- **Làn thường** — cải tiến nhỏ (thêm cột / bộ lọc / nút, đổi hiển thị, sắp xếp): ý tưởng + cách làm MỘT bản cụ thể, Giám đốc duyệt 1 lần là làm luôn.
- **Làn đầy đủ** — đổi luật / cách tính, tính năng lớn, đụng tiền / lương / thưởng / công nợ, phân quyền cả nhóm / chức danh, xoá thật,
  hồ sơ nhân sự, Upload Lada: đủ các bước ý tưởng → BRD → thẩm định → Giám đốc duyệt.
Phân vân giữa hai làn → chọn làn CAO hơn (an toàn hơn).

<!-- may-loi-du-lieu -->
## Máy chạy sai luật đã chốt = LỖI, sửa luôn (Giám đốc chốt 22/11/2026 — áp dụng VĨNH VIỄN)
- Dữ liệu / kết quả máy tạo ra sai so với luật Giám đốc đã chốt (đếm sai, chia sai người, lọc sai nhóm…) là **lỗi** → **làn nhanh**:
  sửa cho đúng luật đã chốt, chạy lại hoặc đếm số bản ghi bị sai, báo NGẮN (lỗi gì · vì sao · đã sửa · bao nhiêu bản ghi). Không đụng dữ liệu
  đã đẩy sang hệ thống ngoài (Lada…) — chỉ liệt kê để người điều phối xử lý.
- KHÔNG biến lỗi thành đề xuất đổi luật, KHÔNG hỏi lại Giám đốc điều luật đã chốt, KHÔNG viết dài theo khuôn làn đầy đủ.
- Người báo hỏi thêm việc khác trong cùng báo cáo → ghi 1 dòng "Tách việc riêng: …", không gộp vào bản sửa lỗi.
