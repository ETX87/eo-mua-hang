-- 2026-11-06: khoa "dang tinh lai" cho report_cache (lib/reportCache.ts). Khi version doi, nhieu request dong thoi
-- (FE qc.invalidateQueries() tai lai moi man dang mo) cung tinh lai bao cao 0.1 (~279k rows read/lan) -> 1 request giu
-- khoa tinh, cac request khac cho ket qua. NULL = khong ai dang tinh.
ALTER TABLE report_cache ADD COLUMN computing_until TEXT;
