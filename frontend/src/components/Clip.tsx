import type { ReactNode, CSSProperties } from "react";

/** O cat chu 1 dong: rong toi da `w`, qua dai hien "…"; re chuot thay noi dung day du (title chi gan khi bi cat). */
export function Clip({ w, children, style }: { w?: number | string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="clip"
      style={{ maxWidth: w ?? 240, ...style }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? "";
        else el.removeAttribute("title");
      }}
    >
      {children}
    </div>
  );
}
