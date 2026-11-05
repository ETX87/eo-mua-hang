-- R1 (khong co ngay du kien) doi han 24h -> 48h lam viec (2026-11-05, lib/theoDoi.ts GIO_R1). Ma loi giu KHONG_NDK_24H (khoa du lieu cu).
UPDATE tl_danh_muc SET ten = 'Không cập nhật ngày dự kiến trong 48h' WHERE loai = 'LOI' AND ma = 'KHONG_NDK_24H';
