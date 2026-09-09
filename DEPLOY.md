# DEPLOY — hệ EO Mua hàng (runbook đầy đủ cho người/agent triển khai)

> Repo này **chưa deploy lần nào**. Hướng dẫn viết cho người triển khai trên **một tài khoản
> Cloudflare khác** (không phải tài khoản gốc `dichvu3t`). Làm **đúng thứ tự**. Mọi lệnh chạy từ
> thư mục `eomua/` trừ khi ghi chú khác.

Kiến trúc: **1 Cloudflare Worker** (Hono) phục vụ cả API (`/api/*`) lẫn frontend tĩnh
(`frontend/dist`) — không cron, không R2. DB là **D1** (SQLite). Auth = Google OAuth tự cài trong
Worker + session JWT trong cookie HttpOnly. Chi tiết nghiệp vụ: các file `../*.md`.

---

## 0. Yêu cầu môi trường

- Node ≥ 20, npm ≥ 10.
- `npx wrangler --version` ≥ 4.111 (đã khai trong `devDependencies`, `npx wrangler` là đủ).
- Tài khoản Cloudflare (Workers Paid **không bắt buộc** cho D1 nhỏ, nhưng nên có).
- Quyền tạo OAuth client trên Google Cloud Console.
- 3 file dữ liệu nguồn (giữ NGOÀI repo, người bàn giao cấp riêng):
  - `../Database EO MUA HANG.xlsx` — dữ liệu lịch sử EO (bắt buộc, cho `scripts/migrate.mjs`).
  - `scripts/amis_rows.json` — **đã kèm trong repo**, 9.513 dòng lịch sử AMIS/MISA rút từ sheet
    `2.2. All`. Nếu cần tạo lại: đặt `bc_export.xlsx` cạnh `scripts/extract_amis.py` rồi
    `python scripts/extract_amis.py`.
  - `../Mẫu import misa.xlsx` — chỉ để tham chiếu tên cột khi kế toán import kỳ MISA mới qua UI.

---

## 1. Nhận mã nguồn về máy

```bash
cd eomua
npm install            # cài cả 3 workspace: root, backend, frontend
npm install --prefix scripts   # riêng scripts/ (không phải workspace) — cần "xlsx"
npm run typecheck      # phải PASS trước khi đi tiếp
npm run build          # tsc + vite build -> frontend/dist  (phải PASS)
```

---

## 2. Commit sạch TRƯỚC khi deploy  (bắt buộc)

Repo đã `git init` sẵn (branch `master`), có `.gitignore` đúng (bỏ `node_modules/`, `dist/`,
`.wrangler/`, `.dev.vars`, `scripts/_data/`). **Chưa có commit nào.**

```bash
git config user.name  "<tên bạn>"
git config user.email "<email bạn>"

git add -A
git status               # rà: KHÔNG được thấy .dev.vars, node_modules/, dist/, .wrangler/
git commit -m "chore: initial deployable snapshot (EO Mua hàng)"
```

Quy tắc từ đây về sau (đã ghi trong `CLAUDE.md`): **không bao giờ chạy `npm run deploy` khi
`git status` còn bẩn.** Mỗi lần deploy = đúng 1 commit. Vòng lặp chuẩn:

```bash
# ... sửa code ...
npm run typecheck && npm run build
git add -A && git commit -m "<mô tả>"
# sửa frontend/src/version.ts: +0.001 (sửa tay chuỗi APP_VERSION) rồi commit kèm hoặc commit riêng
npm run deploy
git tag deploy-$(date +%Y%m%d-%H%M) && :   # tuỳ chọn: đánh dấu commit đã lên production
```

---

## 3. Google OAuth client

Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**,
loại **Web application**:

- **Authorized redirect URIs**: `https://<WORKER_URL>/api/auth/callback`
- (không cần Authorized JavaScript origins)

`<WORKER_URL>` = URL Worker sau khi deploy. Với tài khoản mới nó là
`https://eomua.<TÊN-SUBDOMAIN-CỦA-BẠN>.workers.dev` (xem `*.workers.dev` subdomain trong
Cloudflare dash → Workers & Pages → mục Subdomain). Nếu muốn domain riêng thì dùng domain đó.

Lưu lại: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
Trên **OAuth consent screen** thêm email người dùng nội bộ vào Test users (hoặc publish app).

---

## 4. Sửa `wrangler.jsonc` cho tài khoản mới

Các giá trị đang trỏ về tài khoản gốc — **phải đổi**:

| Khoá | Hiện tại (tài khoản gốc) | Đổi thành |
|---|---|---|
| `name` | `eomua` | giữ `eomua`, hoặc tên khác — nó quyết định subdomain URL |
| `d1_databases[0].database_id` | `REPLACE_WITH_REAL_D1_ID` | id thật ở bước 5 |
| `vars.BOOTSTRAP_ADMIN_EMAIL` | `smarttrade.vp@gmail.com` | **email admin đầu tiên của bạn** (Gmail, sẽ tự lên Admin ở lần đăng nhập đầu) |
| `vars.GOOGLE_REDIRECT_URI` | `https://eomua.dichvu3t.workers.dev/api/auth/callback` | `https://<WORKER_URL>/api/auth/callback` (khớp y hệt bước 3) |
| `vars.FRONTEND_URL` | `https://eomua.dichvu3t.workers.dev` | `https://<WORKER_URL>` |

**KHÔNG** thêm `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` vào `vars` —
chúng là **secret** (bước 6). **KHÔNG** thêm `LOCAL_DEV_BYPASS_AUTH` vào `vars` — biến này chỉ
được phép nằm trong `.dev.vars` (local). `assets.run_worker_first: ["/api/*"]` **giữ nguyên** —
thiếu nó thì điều hướng trình duyệt thật bị SPA fallback nuốt trước khi tới Worker.

Commit thay đổi này: `git add wrangler.jsonc && git commit -m "chore: point config at new CF account"`.

---

## 5. Tạo D1

```bash
npx wrangler d1 create eo-mua-hang-db
```

Chép `database_id` in ra vào `wrangler.jsonc → d1_databases[0].database_id`. Commit.

Áp schema lên D1 thật (chạy `migrations/0001_init.sql` → `0003_report_cache.sql` theo thứ tự tên):

```bash
npm run db:migrate:remote        # = wrangler d1 migrations apply DB --remote --config ../wrangler.jsonc
```

Kiểm tra:

```bash
npx wrangler d1 execute eo-mua-hang-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1"
```

Phải thấy `eo`, `eo_item`, `item_plan`, `eo_approval`, `amis_receipt`, `event_log`,
`report_cache`, `users`, `id_counters`, `data_versions`, `settings_*`, `app_settings`, …

---

## 6. Secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID     --config wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.jsonc
npx wrangler secret put SESSION_SECRET       --config wrangler.jsonc   # dán chuỗi ngẫu nhiên dài
```

Sinh `SESSION_SECRET`: `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"` hoặc
`openssl rand -hex 48`.

---

## 7. Deploy lần đầu

```bash
git status            # phải sạch
npm run deploy        # = npm run build && wrangler deploy --config ../wrangler.jsonc
```

Wrangler in ra `https://<WORKER_URL>`. Mở thử:

```bash
curl -s https://<WORKER_URL>/api/health         # {"ok":true,...}
```

Mở `https://<WORKER_URL>` trên trình duyệt → bấm đăng nhập → chọn tài khoản Google =
`BOOTSTRAP_ADMIN_EMAIL`. Lần đăng nhập đầu tiên của đúng email đó sẽ **tự thành Admin & được
duyệt** (xem `middleware/guards.ts`). Các email khác vào trạng thái *chờ duyệt* cho tới khi
Admin duyệt + gán vai trò trong màn **Người dùng**.

> Nếu redirect báo lỗi `redirect_uri_mismatch`: `GOOGLE_REDIRECT_URI` trong `wrangler.jsonc`
> phải **trùng từng ký tự** với Authorized redirect URI ở Google, và với URL Worker thật.

---

## 8. Nạp dữ liệu lịch sử

Có **2 phần**: (8a) lịch sử EO từ Excel, (8b) lịch sử nhập kho AMIS.
Cả hai ghi vào **D1 thật**. Cách an toàn nhất là chạy Worker ở chế độ `dev --remote` (Worker chạy
ở máy bạn nhưng **binding D1 trỏ vào D1 production**), bật cờ bypass auth **chỉ trong `.dev.vars`
local** — deploy production KHÔNG bao giờ có cờ này.

### Chuẩn bị `.dev.vars`

```bash
cp .dev.vars.example .dev.vars
```

Sửa `.dev.vars` (file này đã bị `.gitignore`, không lên repo):

```
SESSION_SECRET=bat-ky-chuoi-nao-cho-local
GOOGLE_CLIENT_ID=unused-local
GOOGLE_CLIENT_SECRET=unused-local
GOOGLE_REDIRECT_URI=http://localhost:8790/api/auth/callback
FRONTEND_URL=http://localhost:8790
BOOTSTRAP_ADMIN_EMAIL=<email admin của bạn>     # cùng email ở wrangler.jsonc
LOCAL_DEV_BYPASS_AUTH=true
```

### 8a. Lịch sử EO (`migrate.mjs`)

```bash
node scripts/migrate.mjs
#  -> scripts/_data/migrate.sql        (~8 MB, đã chia lô INSERT 40 dòng/câu)
#  -> scripts/_data/VALIDATION.md      (đọc để biết số dòng target + việc cần rà Phase 2b)
```

Áp vào D1 thật:

```bash
npx wrangler d1 execute eo-mua-hang-db --remote --file scripts/_data/migrate.sql
```

> File không có `BEGIN/COMMIT/PRAGMA` (D1 từ chối trong `--file`); nó dựa vào thứ tự INSERT.
> Nếu D1 báo statement quá lớn ở một lô nào đó, chia nhỏ file rồi chạy lại — các INSERT là
> idempotent theo id.

Kiểm tra:

```bash
npx wrangler d1 execute eo-mua-hang-db --remote --command "SELECT (SELECT COUNT(*) FROM eo) eo, (SELECT COUNT(*) FROM eo_item) item, (SELECT COUNT(*) FROM item_plan) plan, (SELECT COUNT(*) FROM users) usr"
```

So khớp với bảng "Tổng hợp target" trong `scripts/_data/VALIDATION.md`.

### 8b. Lịch sử AMIS (`import_amis_history.mjs`)

Mở **terminal 1** — Worker nối D1 production, có bypass auth từ `.dev.vars`:

```bash
npx wrangler dev --config wrangler.jsonc --remote --port 8790
```

**terminal 2** — nạp (script tự chia lô 1200, rồi gọi `/api/amis/recompute-match`):

```bash
B=http://localhost:8790/api node scripts/import_amis_history.mjs
# In ra: TỔNG nhập ~9243 · match distribution {MATCHED_EO, CODE_ONLY_NO_LINE, UNMATCHED}
```

Xong thì **Ctrl-C** tắt terminal 1. (`wrangler dev --remote` không deploy gì — Worker production
đang chạy vẫn là bản ở bước 7, không có bypass.)

Kiểm tra qua production:

```bash
curl -s https://<WORKER_URL>/api/health
# đăng nhập trên trình duyệt rồi mở màn Báo cáo -> 4 báo cáo phải ra số thực, không rỗng
```

### 8c. (BỎ QUA khi lên thật) dữ liệu demo

`scripts/seed_demo.mjs` chỉ để dựng ảnh demo (tạo EO tiếng Việt giả). **Không chạy trên
production.**

---

## 9. Sau deploy

- Đăng nhập bằng các email nội bộ còn lại → Admin vào **Người dùng** duyệt + gán vai trò
  (`Admin` / `KH cung ung` / `Ke toan` / `Kho` / `Theo doi tien do` / `View`) và cờ nghiệp vụ
  (`la_nv_dat_hang`, `la_nv_kho`, `la_ke_toan`, …).
- Kế toán import kỳ MISA mới hằng tuần qua UI **Nhập AMIS** (đọc `../Mẫu import misa.xlsx` để
  biết cột). Hệ chỉ lấy dòng có **Mã phê duyệt ≠ rỗng** và **SL Nhập > 0**, kho thuộc
  `settings_warehouse`.
- **Deploy lần sau**: chỉ lặp mục 2 (commit sạch) + mục 7 (`npm run deploy`). Migration mới:
  thêm file `migrations/000N_*.sql`, `npm run db:migrate:remote` **trước** khi `npm run deploy`.
  Bump `frontend/src/version.ts` mỗi lần.

---

## 10. Rollback

```bash
git checkout <commit-tốt> -- .        # hoặc: git revert <commit-xấu>
npm run build && npm run deploy
```

Cloudflare cũng giữ các bản deploy cũ: `npx wrangler deployments list` →
`npx wrangler rollback [deployment-id]` (chỉ đổi code Worker, **không** hoàn tác D1 —
migration D1 phải tự viết migration nghịch nếu cần).

---

## Tóm tắt biến môi trường

| Tên | Nơi đặt | Ghi chú |
|---|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | `wrangler.jsonc` → `vars` | email tự lên Admin lần đăng nhập đầu |
| `GOOGLE_REDIRECT_URI` | `wrangler.jsonc` → `vars` | `https://<WORKER_URL>/api/auth/callback` |
| `FRONTEND_URL` | `wrangler.jsonc` → `vars` | `https://<WORKER_URL>` |
| `GOOGLE_CLIENT_ID` | `wrangler secret put` | từ Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `wrangler secret put` | từ Google Cloud Console |
| `SESSION_SECRET` | `wrangler secret put` | chuỗi ngẫu nhiên dài, ký JWT session |
| `LOCAL_DEV_BYPASS_AUTH` | **chỉ** `.dev.vars` | `true` để bỏ OAuth khi chạy local / `dev --remote` nạp dữ liệu. KHÔNG lên production. |
| `DB` | `wrangler.jsonc` → `d1_databases` binding | id thật sau `wrangler d1 create` |
| `ASSETS` | `wrangler.jsonc` → `assets` binding | phục vụ `frontend/dist` |
