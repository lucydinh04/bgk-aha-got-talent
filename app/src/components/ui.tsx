import type { ReactNode } from "react";

export type JudgeState = "todo" | "draft" | "submitted" | "locked" | "error";

const STATE_LABEL: Record<JudgeState, string> = {
  todo: "Chưa chấm",
  draft: "Đang chấm",
  submitted: "Đã gửi",
  locked: "Đã khóa",
  error: "Lỗi / thiếu",
};

/** Màu KHÔNG phải kênh duy nhất — mỗi pill luôn có nhãn chữ. */
const STATE_TONE: Record<JudgeState, string> = {
  todo: "text-silver border-silver/35",
  draft: "text-warn border-warn/45",
  submitted: "text-ok border-ok/45",
  locked: "text-locked border-locked/45",
  error: "text-danger border-danger/45",
};

export function StatusPill({ state }: { state: JudgeState }) {
  return (
    <span
      className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.12em] whitespace-nowrap uppercase ${STATE_TONE[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

/** Panel kính mờ cho mọi card dữ liệu — không đặt KV trực tiếp sau bảng số. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-xl p-4 sm:p-5 ${className}`}>
      {title || action ? (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-silver font-mono text-[0.66rem] tracking-[0.16em] uppercase">
              {title}
            </h2>
          ) : null}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "text-chalk",
  suffix,
}: {
  label: string;
  value: string | number;
  tone?: string;
  suffix?: string;
}) {
  return (
    <div className="border-navy-800 bg-navy-950/50 rounded-lg border p-3">
      <p className="text-silver-dim font-mono text-[0.6rem] tracking-[0.12em] uppercase">
        {label}
      </p>
      <p className={`display tnum mt-1 text-2xl ${tone}`}>
        {value}
        {suffix ? (
          <span className="text-silver-dim ml-1 text-xs">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "from-electric to-cyan",
  label,
}: {
  value: number;
  tone?: string;
  label?: string;
}) {
  return (
    <div
      className="bg-navy-800 h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Tiến độ"}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ── Thêm cho các màn hình Admin ───────────────────────────────────────────*/

/** Ô trạng thái trong ma trận BGK × tiết mục. Màu + ký hiệu, không chỉ màu. */
const CELL_TONE: Record<JudgeState, string> = {
  todo: "border-navy-600 text-silver-dim",
  draft: "border-warn/50 text-warn bg-warn/8",
  submitted: "border-ok/50 text-ok bg-ok/8",
  locked: "border-locked/50 text-locked bg-locked/8",
  error: "border-danger/55 text-danger bg-danger/10",
};
const CELL_GLYPH: Record<JudgeState, string> = {
  todo: "–",
  draft: "◐",
  submitted: "✓",
  locked: "🔒",
  error: "!",
};

export function MatrixCell({ state, label }: { state: JudgeState; label: string }) {
  return (
    <span
      title={label}
      className={`grid size-8 place-items-center rounded border font-mono text-[0.7rem] ${CELL_TONE[state]}`}
    >
      <span aria-hidden>{CELL_GLYPH[state]}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageHeader({
  location,
  title,
  subtitle,
  action,
}: {
  location?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const accent = location === "SGN" ? "text-brand" : "text-cyan";
  return (
    <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-baseline gap-3">
        {location ? (
          <span className={`display text-2xl ${accent}`}>{location}</span>
        ) : null}
        <h1 className="display text-chalk text-xl">{title}</h1>
        {subtitle ? (
          <span className="text-silver text-xs">{subtitle}</span>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** Bảng dữ liệu: luôn cuộn ngang trong khung riêng, thân trang không tràn. */
export function DataTable({
  head,
  children,
  minWidth = 640,
}: {
  head: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    // `relative` là bắt buộc: nhãn sr-only trong ô ma trận dùng position:absolute,
    // nếu container cuộn ở position:static thì chúng thoát ra ngoài vùng clip và
    // kéo dài chiều ngang cả trang trên mobile.
    <div className="relative overflow-x-auto">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth }}
      >
        <thead>
          <tr className="border-navy-800 border-b">
            {head.map((h) => (
              <th
                key={h}
                className="text-silver-dim px-3 py-2 text-left font-mono text-[0.6rem] tracking-[0.12em] whitespace-nowrap uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="border-navy-800/70 border-b last:border-0">{children}</tr>
  );
}

export function Cell({
  children,
  tone = "text-silver",
  mono = false,
  className = "",
}: {
  children: ReactNode;
  tone?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 align-top ${tone} ${mono ? "tnum font-mono text-xs" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Banner({
  tone = "warn",
  label,
  children,
}: {
  tone?: "warn" | "danger" | "ok" | "info";
  label: string;
  children?: ReactNode;
}) {
  const map = {
    warn: "border-warn/50 bg-warn/8 text-warn",
    danger: "border-danger/50 bg-danger/8 text-danger",
    ok: "border-ok/50 bg-ok/8 text-ok",
    info: "border-cyan/50 bg-cyan/8 text-cyan",
  } as const;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${map[tone]}`}
    >
      <span className="font-mono text-[0.64rem] tracking-[0.16em] uppercase">
        {label}
      </span>
      {children ? (
        <span className="text-silver text-xs">{children}</span>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-navy-700 flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="display text-silver text-lg">{title}</p>
      {children ? (
        <p className="text-silver-dim max-w-sm text-xs leading-relaxed">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** Nút dùng chung — không phải component form, chỉ là lớp trình bày. */
export function Btn({
  variant = "ghost",
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "brand" | "electric" | "ghost" | "danger";
}) {
  const map = {
    brand: "bg-brand hover:bg-brand-deep text-[#1a0c02]",
    electric: "bg-electric hover:bg-electric-dim text-white",
    ghost: "border border-navy-600 text-silver hover:text-chalk",
    danger: "border-2 border-danger text-danger hover:bg-danger/10",
  } as const;
  return (
    <button
      {...rest}
      className={`min-h-[44px] rounded-lg px-4 text-sm transition disabled:opacity-40 ${map[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
