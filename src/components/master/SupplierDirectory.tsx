"use client";

import { useMemo, useState } from "react";
import { suppliers, users } from "@/data/masterRecords";
import { usePermission } from "@/hooks/usePermission";

const levelOptions = [
  { label: "全部等級", value: "all" },
  { label: "Level A", value: "A" },
  { label: "Level B", value: "B" },
  { label: "Level C", value: "C" },
];

const statusOptions = [
  { label: "全部狀態", value: "all" },
  { label: "啟用", value: "active" },
  { label: "暫停", value: "suspended" },
];

type FilterState = {
  keyword: string;
  level: string;
  status: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  level: "all",
  status: "all",
};

export function SupplierDirectory() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);

  const demoUser = users[0];
  const { can } = usePermission({
    assignments: demoUser.roles,
    roleFilter: demoUser.primaryRole,
    departmentFilter: demoUser.departments[0] ?? undefined,
  });

  const canCreate = can("suppliers", "create");
  const canUpdate = can("suppliers", "update");

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const keyword = appliedFilters.keyword.trim().toLowerCase();
      const keywordMatch = keyword
        ? [supplier.name, supplier.code, supplier.contact, supplier.phone]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;

      const levelMatch =
        appliedFilters.level === "all" ? true : supplier.level === appliedFilters.level;

      const statusMatch =
        appliedFilters.status === "all" ? true : supplier.status === appliedFilters.status;

      return keywordMatch && levelMatch && statusMatch;
    });
  }, [appliedFilters]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Suppliers</p>
            <h1 className="text-2xl font-semibold text-slate-900">供應商主檔</h1>
            <p className="text-sm text-slate-500">
              控管交期與等級，供採購與財務共用。僅授權人員可新增或停用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
              disabled={!canCreate}
            >
              匯入 CSV
            </button>
            <button
              disabled={!canCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              新增供應商
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
              value={filters.keyword}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, keyword: event.target.value }))
              }
              placeholder="供應商 / 聯絡人 / 電話"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">等級</p>
            <select
              value={filters.level}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, level: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {levelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">狀態</p>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            已篩選 {filteredSuppliers.length} 家供應商（共 {suppliers.length} 家）
          </p>
          {!canCreate && (
            <span className="text-xs text-amber-600">需同管核准才能新增或匯入</span>
          )}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["名稱", "聯絡人 / 電話", "等級", "交期(天)", "狀態", "動作"].map((header) => (
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
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="font-semibold text-slate-900">{supplier.name}</div>
                    <div className="text-xs text-slate-500">{supplier.code}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {supplier.contact} ｜ {supplier.phone}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    Level {supplier.level}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {supplier.leadTimeDays}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        supplier.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {supplier.status === "active" ? "啟用" : "暫停"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      disabled={!canUpdate}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                    >
                      管理
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}