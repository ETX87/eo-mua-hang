-- Tu choi dong them sau ban hanh (nguoi duyet cuoi / Admin). CHECK cua post_issue_status chi cho PENDING|APPROVED
-- (doi CHECK phai dung lai bang) -> ghi nhan tu choi bang 3 cot rieng; dong bi tu choi: post_issue_status = NULL,
-- line_status = 'CANCELLED_LINE', current_qty = 0 (giong huy dong), ke hoach cua dong bi xoa mem.
ALTER TABLE eo_item ADD COLUMN post_issue_rejected_by TEXT;
ALTER TABLE eo_item ADD COLUMN post_issue_rejected_at TEXT;
ALTER TABLE eo_item ADD COLUMN post_issue_reject_reason TEXT;
