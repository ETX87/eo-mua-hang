import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "./theme.css";
import "./index.css";
import App from "./App";
import { napCache, batLuuCache } from "./lib/cacheTrinhDuyet";
import { CuaSoThongTin } from "./components/CuaSoThongTin";

// gcTime 24h: du lieu nap tu cache trinh duyet khong bi don ngay khi chua co man nao dung
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000, gcTime: 24 * 3600_000 } } });

// v0.097: nap cache trinh duyet (lan mo truoc) roi moi ve -> man hien ngay, tai moi o nen
napCache(qc).finally(() => {
  batLuuCache(qc);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <App />
          <CuaSoThongTin />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
