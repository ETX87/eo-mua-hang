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
- `d1_databases[0].database_id` đang là `REPLACE_WITH_REAL_D1_ID` — điền sau `wrangler d1 create eo-mua-hang-db`.
- Bump `frontend/src/version.ts` (`+0.001`, sửa tay chuỗi) trước mỗi deploy.

## Cấu trúc

```
migrations/0001_init.sql     schema đầy đủ (từ ../TARGET_DATABASE.md)
backend/src/
  index.ts                   Hono app, mount router, middleware chain
  types.ts                   Env + AppUser + AppVariables
  lib/                        vnTime, jwt, idCounter, dataVersions
  middleware/                 session (OAuth/JWT), guards (loadUser/requireApproved/requireWrite/requireAdmin)
  routes/                     auth, users  (eo/items/plans/approvals/amis/reports thêm ở Phase 3+)
frontend/src/                 khung React tối thiểu (App gọi /api/users/me)
scripts/                     script migration từ Database EO MUA HANG.xlsx (Phase 2)
```

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

## Trạng thái

Phase 1 (thiết kế) xong. Phase 2 (migration script) + Phase 3 (backend routes) đang chờ.
`../CHOT_OPEN_QUESTIONS.md` giữ trạng thái các quyết định nghiệp vụ.
