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
  pages/                     Dashboard, eo/ (List/Detail/Form), Approvals, Plans, amis/, reports/ (4), admin/
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
cách lần trước ≥ 20s, có khóa `running_until`; chỉ gửi dòng có hash khác lần gửi thành công (`dvbh_sync_item`).
Khóa dòng `id_dat_lk` = `legacy_id` (LK-…) hoặc `EOI-<eo_item.id>`. Admin: Cấu hình hệ thống › "Đồng bộ PO sang
app DVBH" (gửi ngay / đồng bộ toàn bộ). DVBH dùng song song với Google Sheet cũ (~1 tháng). Thêm field vào
payload = DVBH nhận nguyên JSON (`po_dat_hang_eo.payload`), map ở `frontend/src/lib/poDatHangEo.ts` bên đó.

## Theo dõi linh kiện đặt (kiểm soát ngày dự kiến)

Quy tắc R1/R3/R4, giải trình (Ai + Lỗi gì + ảnh), cấp CEO, form push chuẩn, API mail: **`../THEO_DOI_LINH_KIEN_DAT.md`**.
`lib/theoDoi.ts`: `layDongTheoDoi` (dựa trên báo cáo 0.1 + item_plan + event_log + tl_loi), `danhGiaQuyTac` (ghi lỗi
idempotent, chạy sau request API tối đa 10 phút/lần — đọc `tl_state` trước, không ghi khóa mỗi request).
`/api/partner/*` (`routes/partner.ts`) mount TRƯỚC session middleware. Domain version `theo_doi` (DVBH tag có).
Số đỏ sau tên menu + khung "Việc cần xử lý" ở Tổng quan: `GET /api/viec-can-lam` (`routes/viecCanLam.ts`, ma trận vai trò ở file
trên mục 4); FE dùng queryKey `inbox-count` (nhiều màn đã invalidate key này).

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
`POST /eo/items/:id/cancel-line` (người quản lý EO / người duyệt cuối, bắt buộc lý do).

## Bảng điều khiển quản lý (đầu trang Tổng quan) — `frontend/src/pages/QuanLyPanel.tsx`

`GET /api/dashboard/quan-ly` gom từ báo cáo 0.1 đã cache (không cache kết quả — mốc tồn "< 1 ngày" tính theo giờ):
tỷ lệ đáp ứng tháng/tuần = Σmin(về, đặt)/Σđặt của dòng ĐẶT trong kỳ; tồn đọng + 8 mốc tồn (`MOC_TON`, khớp
`frontend/src/lib/tonDong.tsx`) dùng CÙNG mốc bỏ qua & ngày đặt với `lib/theoDoi` (dòng trước BH = ngày ban hành, thêm sau BH
= ngày tạo) để số trên Tổng quan = số ở Theo dõi (`/theo-doi?ton=<mốc>`). `GET /api/dashboard/tim-linh-kien?q=` tra mã/tên không dấu.
`DataTable` có ô tìm nhanh mặc định (`timKiem={false}` khi trang tự tìm phía server).

## 8 giai đoạn đơn hàng — `backend/src/lib/giaiDoan.ts` (FE nhãn `frontend/src/lib/giaiDoan.tsx`)

G1 Lập & trình · G2 Thẩm định · G3 Duyệt cuối & BH · G4 Gửi đơn NCC (mail GUI đầu tiên trong `tl_mail`, CC theodoimuahang —
luồng SONG SONG, không chặn giai đoạn hiện tại) · G5 Có ngày dự kiến · G6 Chờ SX & giao (hạn = ngày DK lần đầu) ·
G7 Nhập kho & lên hệ thống (ngày CT AMIS → `amis_receipt.created_at`, chỉ đo) · G8 Giao bù đến đủ. Giờ & hạn = giờ LÀM VIỆC
(bỏ Chủ nhật, như R1); hạn `app_settings.giai_doan_sla` (JSON giờ, mặc định 24/…/G8 168). Chốt 2026-10-29: CHỈ đo + báo cáo
đúng/trễ hạn, chưa sinh lỗi giải trình (bật sau 2–4 tuần). `layGiaiDoan(env)` cache mốc, phần "bây giờ" tính lúc request.
**Sổ đơn hàng** (`/so-don-hang`, thay Báo cáo Tiến độ đơn hàng; đường dẫn cũ vẫn mở màn này): `GET /api/so-don-hang`
= báo cáo 0.1 + EO + giai đoạn; chọn cột / lọc / lưu bộ lọc (localStorage `sdh-cot`, `sdh-loc-luu`) làm ở FE.

## Popup xem nhanh (95% màn hình)

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
- `navConfig.ts` (FE) ↔ `moduleAccess` (BE) đồng bộ tay khi thêm.
- **Luôn commit trước khi deploy.** Không chạy `npm run deploy` khi cây làm việc còn thay đổi
  chưa commit — commit (hoặc stash) hết, rồi mới deploy, để mỗi bản deploy khớp đúng 1 commit.

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
