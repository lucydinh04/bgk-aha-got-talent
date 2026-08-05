"use client";

import { useActionState } from "react";

import { judgeLogin, type LoginState } from "@/app/actions/auth";

/**
 * Form đăng nhập BGK. Giữ nguyên từng class của bản thiết kế — file này chỉ
 * thêm state lỗi và trạng thái đang gửi, không đụng vào hình thức.
 */
export function LoginForm({ locationSlug }: { locationSlug: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(judgeLogin, {});

  return (
    <form className="mt-6 flex flex-col gap-4" action={action}>
      <input type="hidden" name="location" value={locationSlug} />

      <label className="flex flex-col gap-2">
        <span className="text-silver font-mono text-[0.68rem] tracking-[0.12em] uppercase">
          Email công ty
        </span>
        <input
          type="email"
          name="email"
          required
          defaultValue={state.email}
          inputMode="email"
          autoComplete="email"
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          placeholder="ten@ahamove.com"
          className={`bg-navy-950/80 text-chalk placeholder:text-silver-dim focus:border-brand min-h-[48px] rounded-lg border px-4 text-base outline-none transition ${
            state.error ? "border-danger" : "border-navy-700"
          }`}
        />
      </label>

      {state.error ? (
        <p
          id="login-error"
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
        {pending ? "Đang kiểm tra…" : "Tiếp tục"}
      </button>
    </form>
  );
}
