"use client";

import { useState, type FormEvent } from "react";

import { safeNextPath } from "@/lib/access-gate";

export default function LoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.error ?? "접근 키가 맞지 않습니다.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(safeNextPath(next));
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">계획 관리</h1>
          <p className="text-sm text-gray-500">접근 키를 입력하면 이 기기에서 계속 로그인 상태로 유지됩니다.</p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium">접근 키</span>
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-900"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting || key.trim() === ""}
          className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "확인 중…" : "들어가기"}
        </button>
      </form>
    </div>
  );
}
