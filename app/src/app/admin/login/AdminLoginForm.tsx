"use client";

import { useActionState } from "react";

import { adminLogin, type LoginState } from "@/app/actions/auth";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(adminLogin, {});

  return (
    <form className="mt-6 flex flex-col gap-4" action={action}>
      <label className="flex flex-col gap-2">
        <span className="text-silver font-mono text-[0.68rem] tracking-[0.12em] uppercase">
          Email Ban Tổ chức
        </span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          defaultValue={state.email}
          inputMode="email"
          autoComplete="email"
          aria-invalid={state.error ? true : undefined}
          placeholder="admin.sgn@ahamove.com"
          className={`bg-navy-950/80 text-chalk placeholder:text-silver-dim focus:border-brand min-h-[48px] rounded-lg border px-4 text-base outline-none transition ${
            state.error ? "border-danger" : "border-navy-700"
          }`}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="border-danger/40 text-danger rounded-lg border px-3 py-2 text-xs leading-relaxed"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-deep display min-h-[48px] rounded-lg text-base text-[#1a0c02] transition disabled:opacity-60"
      >
        {pending ? "Đang kiểm tra…" : "Vào bảng điều khiển"}
      </button>
    </form>
  );
}
