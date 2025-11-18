"use client";

import { useMemo, useState } from "react";
import { sequences } from "@/data/masterRecords";

const scopeOptions = [
  { label: "全部範圍", value: "all" },
  { label: "報價", value: "報價" },
  { label: "訂單", value: "訂單" },
  { label: "製令", value: "製令" },
  { label: "序號", value: "序號" },
  { label: "帳號", value: "帳號" },
];

type FilterState = {
  keyword: string;
  scope: string;
  minPadding: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  scope: "all",
  minPadding: "",
};

export function SequenceDirectory() {
  const [formState, setFormState] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);

  const filteredSeqs = useMemo(() => {
    return sequences.filter((seq) => {
      const keywordMatch = appliedFilters.keyword
        ? [seq.key, seq.prefix, seq.scope].join(" ").toLowerCase().includes(appliedFilters.keyword.toLowerCase())
        : true;

      const scopeMatch =
        appliedFilters.scope === "all" ? true : seq.scope === appliedFilters.scope;

      const paddingMatch = appliedFilters.minPadding
        ? seq.padding >= Number(appliedFilters.minPadding)
        : true;

      return keywordMatch && scopeMatch && paddingMatch;
    });
  }, [appliedFilters]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(formState);
  };

  const handleReset = () => {
    setFormState(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-teal-600">Sequences</p>
            <h1 className="text-2xl font-semibold text-slate-900">流水號治理</h1>
            <p className="text-sm text-slate-500">
              統一管理報價、訂單、製令與序號格式，避免重碼與跳號。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯出設定
            </button>
            <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              新增序號規則
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 grid gap-4 rounded-2xl bg-slate-50/80 p-4 md:grid-cols-4"
        >
          <label className="md:col-span-2">
            <p className="text-xs font-semibold text-slate-600">搜尋關鍵字</p>
            <input
              type="text"
              value={formState.keyword}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, keyword: event.target.value }))
              }
              placeholder="Key / Prefix / 範圍"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">使用範圍</p>
            <select
              value={formState.scope}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, scope: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {scopeOptions.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">Padding 下限</p>
            <input
              type="number"
              min={1}
              value={formState.minPadding}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, minPadding: event.target.value }))
              }
              placeholder="例如 4"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <div className="flex items-end gap-2 md:col-span-4 md:justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              重置
            </button>
            <button
              type="submit"
              className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm"
            >
              套用搜尋
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-500">
            已篩選 {filteredSeqs.length} 組規則（共 {sequences.length} 組）
          </p>
          <div className="ml-auto flex gap-2 text-xs font-semibold">
            {scopeOptions
              .filter((scope) => scope.value !== "all")
              .map((scope) => (
                <span
                  key={scope.value}
                  className="rounded-full bg-slate-100 px-3 py-1 text-slate-600"
                >
                  {scope.label}
                </span>
              ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Key", "Prefix", "Padding", "Next #", "使用範圍", "操作"].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSeqs.map((seq) => (
                <tr key={seq.key} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {seq.key}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{seq.prefix}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{seq.padding}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-900">
                    {seq.nextNumber.toString().padStart(seq.padding, "0")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{seq.scope}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                        調整編碼
                      </button>
                      <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                        記錄
                      </button>
                      <button className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        鎖定
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <p>支援跨模組流水號統一定義，避免 BOM、新舊系統跳號。</p>
          <button className="rounded-full bg-slate-900 px-4 py-1 text-white">批次同步</button>
        </div>
      </div>
    </div>
  );
}

