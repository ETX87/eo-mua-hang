import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui";
import { I } from "../../lib/icons";
import EoListInner from "./EoListInner";

export default function EoList() {
  const nav = useNavigate();
  return (
    <div>
      <PageHeader
        title="Danh sách EO"
        actions={<button className="btn primary" onClick={() => nav("/eo/new")}><I.plus width={15} height={15} /> Tạo EO</button>}
      />
      <div className="card card-pad">
        <EoListInner />
      </div>
    </div>
  );
}
