import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { I } from "../../lib/icons";
import { useQuickView } from "../../components/quickview/QuickView";
import EoListInner from "./EoListInner";

/**
 * Man "Quan ly EO" (/eo). Chi tiet EO = popup (EoQuickView) - /eo/:id (link thong bao, link da gui, sau khi luu form)
 * mo man nay + tu bat popup EO do, roi doi URL ve /eo. Tieu de trang o thanh tren (AppShell); nut "Tao EO" cuoi thanh loc.
 */
export default function EoList() {
  const nav = useNavigate();
  const { id } = useParams();
  const qv = useQuickView();
  useEffect(() => {
    if (!id || !Number(id)) return;
    qv.openEo(Number(id));
    nav("/eo", { replace: true });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card card-pad">
      <EoListInner actions={<button className="btn sm primary" onClick={() => nav("/eo/new")}><I.plus width={14} height={14} /> Tạo EO</button>} />
    </div>
  );
}
