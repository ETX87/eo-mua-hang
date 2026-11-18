# Nhật ký làm việc — App EO mua hàng

> Mỗi đợt làm việc 1 mục, **mới nhất ở trên**: ngày, phiên bản, yêu cầu, đã làm gì, kiểm thử gì, việc còn dở. Chỉ ghi thêm, không xoá mục cũ.
> Không ghi tài khoản, mật khẩu, khoá hay mô tả lỗ hổng bảo mật vào file này (repo có thể công khai).

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
