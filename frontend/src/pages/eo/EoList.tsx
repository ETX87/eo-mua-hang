import { useNavigate } from "react-router-dom";
import { I } from "../../lib/icons";
import EoListInner from "./EoListInner";

/** Tieu de trang da co o thanh tren cung (AppShell) -> khong lap PageHeader; nut "Tao EO" nam cuoi thanh loc. */
export default function EoList() {
  const nav = useNavigate();
  return (
    <div className="card card-pad">
      <EoListInner actions={<button className="btn sm primary" onClick={() => nav("/eo/new")}><I.plus width={14} height={14} /> Tạo EO</button>} />
    </div>
  );
}
