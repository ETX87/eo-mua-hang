# CLAUDE.md — hệ EO Mua hàng (Worker `muahang`), bản RÚT GỌN

> File này chỉ giữ luật chính + chỉ đường (giữ **dưới 10 KB** — app chủ trên đám mây đọc mọi kho).
> **Chi tiết đầy đủ** (từng tính năng, quy tắc R1/R4, giai đoạn, vi phạm, điều hành, lịch sử phiên bản): [`CLAUDE-full.md`](CLAUDE-full.md) —
> mở khi cần đụng tới mảng tương ứng (tìm theo từ khóa: tên route, tên bảng, `v0.xxx`).
> **Quy ước ghi**: tính năng / quyết định mới → ghi chi tiết vào `CLAUDE-full.md`; ở đây chỉ thêm khi là LUẬT CHUNG mới.

## Hệ thống là gì

Web nội bộ quản lý **EO mua hàng** (yêu cầu mua linh kiện) của 3T: tạo EO → thẩm định → duyệt cuối → ban hành → theo dõi kế hoạch hàng về
→ đối chiếu AMIS (MISA) → báo cáo; theo dõi linh kiện đặt, vi phạm & giải trình, điều hành cho lãnh đạo. Thay hệ Google Sheets cũ.
Cloudflare Workers (Hono) phục vụ API + frontend tĩnh · D1 · React + Vite + Tailwind · Google OAuth + JWT cookie · không R2 · cron mỗi giờ
(`scheduled()` → `danhGiaQuyTac`). Logic nghiệp vụ đang chạy: [`TONG_HOP_LOGIC.md`](TONG_HOP_LOGIC.md). Tài liệu thiết kế gốc nằm ở thư mục
cha ngoài repo (`../WORKFLOW_SPEC.md`, `../PERMISSION_SPEC.md`, `../REPORT_SPEC.md`, `../CHOT_OPEN_QUESTIONS.md`…) — có thể không có trên đám mây.

## Lệnh

```bash
npm run dev:worker        # wrangler dev, port 8790 (.dev.vars: LOCAL_DEV_BYPASS_AUTH=true)
npm run dev:frontend      # vite, port 5176, proxy /api -> 8790
npm run build             # tsc + vite build
npm run typecheck         # backend + frontend
npm run db:migrate:local  # migration vào D1 local
npm run db:migrate:remote # migration vào D1 THẬT
npm run deploy            # build + wrangler deploy (Worker THẬT)
```

## Luật bắt buộc

1. **Bump `frontend/src/version.ts`** (+0.001, sửa tay chuỗi) trước mỗi lần deploy.
2. **Commit trước, deploy sau** — không deploy khi cây làm việc còn thay đổi chưa commit. Commit xong đẩy `origin` + `etx87`
   (không force-push; có commit tự động → `git fetch` + `git merge`, không rebase).
3. Mỗi lần đổi code, trong CÙNG commit: ghi `nhat_ky_lam_viec.md` (mục mới ở ĐẦU file), sửa đè mục liên quan `TONG_HOP_LOGIC.md`
   (+ `SRS_tong_hop.md` nếu yêu cầu đổi), thêm mục chi tiết vào `CLAUDE-full.md`.
4. Không đẩy bí mật lên repo; secrets đặt bằng `wrangler secret put` (danh sách ở `CLAUDE-full.md` mục wrangler.jsonc). Không ghi khoá / mật khẩu vào tài liệu.
5. `assets.run_worker_first: ["/api/*"]` trong `wrangler.jsonc` là load-bearing — không xoá.
6. Cột & comment DB/code **không dấu**; chuỗi UI có dấu.
7. Thời gian = **giờ Việt Nam** (`nowVN()`, `datetime('now','+7 hours')`), không UTC.
8. **Giờ làm việc**: mọi SLA / hạn dùng `congGioLV` / `demGioLV` (`backend/src/lib/gioLamViec.ts`) — T2–T6 8h, T7 4h, CN nghỉ; không tự viết vòng lặp giờ.
9. `users` khoá chính = `email`; mọi FK người dùng theo email.
10. Thay đổi nghiệp vụ có ý nghĩa audit → 1 dòng `event_log`; thảo luận → `eo_comment`.
11. Không hard-delete `eo_item` / `item_plan` / `eo_approval` / `eo_file` / `amis_receipt`.
12. Mọi đường ghi gọi `bumpVersions(db, [...domains])`.
13. Menu FE `frontend/src/lib/nav.ts` ↔ quyền BE `backend/src/lib/eoAccess.ts` đồng bộ tay.
14. **Luồng duyệt** (`routes/approvals.ts`): mỗi action "giữ chỗ" bằng 1 UPDATE có điều kiện trước mọi ghi khác (`meta.changes = 0` → 409, chống bấm đúp);
    kiểm tra "hết phiếu REVIEW PENDING" nằm TRONG SQL của batch. Chi tiết `CLAUDE-full.md` mục "Luồng duyệt".

## Nguồn định nghĩa duy nhất

| Việc | Nơi |
|---|---|
| Quyền hành động | `backend/src/lib/eoAccess.ts` |
| Khớp AMIS ↔ EO | `backend/src/lib/amisMatch.ts` (`recomputeMatch`) |
| 8 giai đoạn đơn hàng | `backend/src/lib/giaiDoan.ts` (FE nhãn `frontend/src/lib/giaiDoan.tsx`) |
| 3 loại ngày của dòng LK | `frontend/src/lib/ngay.tsx` |
| Thuật ngữ số liệu | `frontend/src/lib/thuatNgu.tsx` |
| Cần giải trình / vi phạm, hạn GT | `backend/src/lib/theoDoi.ts` (`hanGiaiTrinh`) ↔ FE `frontend/src/lib/giaiTrinh.tsx` (phải khớp) |
| Cổng nhiệm vụ eOffice | `backend/src/lib/congNhiemVu.ts` (đổi điều kiện "chờ duyệt" ở `approvals.ts` thì sửa cả `gomViecChoDuyet`) |

## Kết nối hệ khác

Service Binding `DVBH` → Worker `dvbh` (đồng bộ PO); app Đặt linh kiện đọc qua API `DOC_API_KEY` (`/api/partner/theo-id`); ETX nhân sự
(bấm tay, `lib/etxNhanSu.ts`); App Nhiệm vụ eOffice (`TASK_FEED_KEY`, mã app `mua-hang`).

## Mẹo local (Windows)

`wrangler dev` mồ côi giữ cổng 8790 / khoá `.wrangler/state` → tìm tiến trình `node … wrangler … dev`, `taskkill /F /T /PID <pid>`.

## Tài liệu

| File | Nội dung |
|---|---|
| `CLAUDE-full.md` | Toàn bộ chi tiết kỹ thuật + quyết định theo từng tính năng |
| `TONG_HOP_LOGIC.md` | Logic nghiệp vụ đang chạy thật |
| `nhat_ky_lam_viec.md` | Nhật ký từng đợt (mới nhất ở đầu) |
| `SRS_tong_hop.md`, `DEPLOY.md` | Đặc tả yêu cầu, deploy |

## Nhận việc từ Trợ lý Mây

- Nhãn `may:phan-tich` = chỉ ĐỌC mã soạn BRD, không sửa. Nhãn `may:tu-sua` = sửa ĐÚNG phạm vi issue `MAY-xxxxx`
  (BRD đã duyệt lưu vào `docs/yeu-cau/MAY-xxxxx.md`).
- Trước PR: `npm run build` phải xanh. Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt
  (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG: sửa secrets / luật bảo mật, deploy trần, đổi tính năng ngoài issue, xoá dữ liệu. Không chắc → bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
  Deploy do workflow `may-deploy` làm sau khi duyệt — không tự deploy trong lúc sửa.
- Làm trong phiên thường mà giải quyết issue Mây đang mở (`gh issue list --label may:cho-duyet,may:tu-sua`) → ghi mã `MAY-xxxxx` ở dòng đầu commit.
- Ba làn xử lý và luật "máy chạy sai luật = lỗi": xem 2 mục cuối file (workflow Mây tự đồng bộ, không sửa tay).

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
