"use client";

import { useMemo, useState } from "react";
import { units } from "@/data/masterRecords";

const categoryOptions = [
  { label: "全部類別", value: "all" },
  { label: "重量", value: "weight" },
  { label: "長度", value: "length" },
  { label: "體積", value: "volume" },
  { label: "數量", value: "count" },
  { label: "流量", value: "flow" },
  { label: "溫度", value: "temperature" },
];

type FilterState = {
  keyword: string;
  category: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  category: "all",
};

export function UnitDirectory() {
  const [formState, setFormState] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);

  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      const keywordMatch = appliedFilters.keyword
        ? [unit.code, unit.name]
            .join(" ")
            .toLowerCase()
            .includes(appliedFilters.keyword.toLowerCase())
        : true;

      const categoryMatch =
        appliedFilters.category === "all" ? true : unit.category === appliedFilters.category;

      return keywordMatch && categoryMatch;
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
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Units</p>
            <h1 className="text-2xl font-semibold text-slate-900">計量單位資料庫</h1>
            <p className="text-sm text-slate-500">
              與 BOM、庫存、報價共用，確保所有模組的計量一致。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯入單位
            </button>
            <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              新增單位
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
              placeholder="代碼 / 名稱"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">單位類別</p>
            <select
              value={formState.category}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, category: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-1 md:justify-end">
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
            已篩選 {filteredUnits.length} 個單位（共 {units.length} 個）
          </p>
          <div className="ml-auto flex gap-2 text-xs font-semibold">
            {categoryOptions
              .filter((option) => option.value !== "all")
              .map((option) => (
                <span
                  key={option.value}
                  className="rounded-full bg-slate-100 px-3 py-1 text-slate-600"
                >
                  {option.label}
                </span>
              ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["代碼", "名稱", "類別", "基準換算", "描述", "最後維護"].map((header) => (
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
              {filteredUnits.map((unit) => (
                <tr key={unit.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {unit.code}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{unit.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {categoryOptions.find((option) => option.value === unit.category)?.label ??
                      unit.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {unit.conversion ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    用於鉦富 ERP 共同語彙
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    2025/11/18 09:55
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <p>新增單位時需呼叫序號模組記錄動作，避免重複代碼。</p>
          <button className="rounded-full bg-slate-900 px-4 py-1 text-white">批次同步</button>
        </div>
      </div>
    </div>
  );
}

