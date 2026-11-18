// Mail from the tracking inbox can identify individual lines or a reminder by its push code.
export const MAIL_DONG_BO_THEO_DONG = `
  SELECT eo_item_id, substr(thoi_gian, 1, 10) d FROM tl_mail
  WHERE eo_item_id IS NOT NULL AND thoi_gian IS NOT NULL
  UNION
  SELECT pi.eo_item_id, substr(m.thoi_gian, 1, 10) d
  FROM tl_push_item pi JOIN tl_push p ON p.id = pi.push_id JOIN tl_mail m ON m.ma_push = p.ma_push
  WHERE m.thoi_gian IS NOT NULL
`;
