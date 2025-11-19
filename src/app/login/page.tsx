"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function LoginContent() {
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") ?? "/master";

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [user, loading, router, nextPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError("登入失敗，請確認帳號密碼。");
      // eslint-disable-next-line no-console
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-600">LOGIN</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">鉦富 ERP 登入</h1>
          <p className="text-sm text-slate-500">請輸入授權帳號與密碼</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              required
              autoComplete="email"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-600">
            密碼
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-teal-600 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? "登入中…" : "登入系統"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center text-sm text-slate-500">
          載入登入頁…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}



