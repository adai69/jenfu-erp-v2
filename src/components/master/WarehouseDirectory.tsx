"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { warehouses as seedWarehouses } from "@/data/masterRecords";
import type { Warehouse } from "@/types/master";

type FilterType = "all" | Warehouse["type"];
type FilterStatus = "all" | Warehouse["status"];

type FilterState = {
  keyword: string;
  type: FilterType;
  status: FilterStatus;
};

type WarehouseFormState = {
  code: string;
  name: string;
  type: Warehouse["type"];
  status: Warehouse["status"];
  isDefaultReceive: boolean;
  isDefaultIssue: boolean;
  sortOrder: string;
  address: string;
  note: string;
};

const typeOptions: Array<{ label: string; value: FilterType }> = [
  { label: "全部類型", value: "all" },
  { label: "原物料倉", value: "raw" },
  { label: "在製品倉", value: "wip" },
  { label: "成品倉", value: "fg" },
  { label: "其他", value: "other" },
];

const statusOptions: Array<{ label: string; value: FilterStatus }> = [
  { label: "全部狀態", value: "all" },
  { label: "使用中", value: "active" },
  { label: "停用", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  type: "all",
  status: "all",
};

const defaultForm = (): WarehouseFormState => ({
  code: "",
  name: "",
  type: "raw",
  status: "active",
  isDefaultReceive: false,
  isDefaultIssue: false,
  sortOrder: "",
  address: "",
  note: "",
});

const isValidWarehouseType = (value: unknown): value is Warehouse["type"] =>
  value === "raw" || value === "wip" || value === "fg" || value === "other";

const isValidWarehouseStatus = (value: unknown): value is Warehouse["status"] =>
  value === "active" || value === "inactive";

function mapWarehouseDoc(data: DocumentData, id: string): Warehouse {
  return {
    code: (data.code as string) ?? id,
    name: (data.name as string) ?? "",
    type: isValidWarehouseType(data.type) ? data.type : "raw",
    status: isValidWarehouseStatus(data.status) ? data.status : "active",
    isDefaultReceive: Boolean(data.isDefaultReceive),
    isDefaultIssue: Boolean(data.isDefaultIssue),
    sortOrder:
      typeof data.sortOrder === "number"
        ? data.sortOrder
        : Number.parseInt((data.sortOrder as string) ?? "0", 10) || 0,
    address: data.address as string | undefined,
    note: data.note as string | undefined,
  };
}

export function WarehouseDirectory() {
  const [warehouseRecords, setWarehouseRecords] = useState<Warehouse[]>(seedWarehouses);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<WarehouseFormState>(() => defaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const snapshot = await getDocs(collection(db, "warehouses"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapWarehouseDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setWarehouseRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code.toUpperCase(), item]));
            loaded.forEach((item) => map.set(item.code.toUpperCase(), item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load warehouses", error);
        setLoadError("讀取雲端倉庫資料失敗，暫時顯示示範資料。");
      } finally {
        setIsLoading(false);
      }
    };
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (!showPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showPanel]);

  const sortedWarehouses = useMemo(() => {
    return [...warehouseRecords].sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.code.localeCompare(b.code);
    });
  }, [warehouseRecords]);

  const filteredWarehouses = useMemo(() => {
    return sortedWarehouses.filter((warehouse) => {
      const haystack = [warehouse.code, warehouse.name, warehouse.address, warehouse.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const keywordMatch = appliedFilters.keyword
        ? haystack.includes(appliedFilters.keyword.toLowerCase())
        : true;
      const typeMatch =
        appliedFilters.type === "all" ? true : warehouse.type === appliedFilters.type;
      const statusMatch =
        appliedFilters.status === "all" ? true : warehouse.status === appliedFilters.status;
      return keywordMatch && typeMatch && statusMatch;
    });
  }, [appliedFilters, sortedWarehouses]);

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleFilterReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditingCode(null);
    setFormState(defaultForm());
    setFormError(null);
  };

  const openCreatePanel = () => {
    setFormState(defaultForm());
    setEditingCode(null);
    setFormError(null);
    setShowPanel(true);
  };

  const openEditPanel = (warehouse: Warehouse) => {
    setFormState({
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      status: warehouse.status,
      isDefaultReceive: Boolean(warehouse.isDefaultReceive),
      isDefaultIssue: Boolean(warehouse.isDefaultIssue),
      sortOrder: warehouse.sortOrder?.toString() ?? "",
      address: warehouse.address ?? "",
      note: warehouse.note ?? "",
    });
    setEditingCode(warehouse.code);
    setFormError(null);
    setShowPanel(true);
  };

  const handleFormChange = <K extends keyof WarehouseFormState>(
    key: K,
    value: WarehouseFormState[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const normalizedCode = editingCode
      ? editingCode.toUpperCase()
      : formState.code.trim().toUpperCase();
    const trimmedName = formState.name.trim();
    const sortOrderNumber =
      formState.sortOrder.trim() === ""
        ? undefined
        : Number.parseInt(formState.sortOrder, 10);

    if (!normalizedCode) {
      setFormError("請輸入倉庫代碼");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入倉庫名稱");
      return;
    }
    if (!isValidWarehouseType(formState.type)) {
      setFormError("請選擇倉庫類型");
      return;
    }
    if (!isValidWarehouseStatus(formState.status)) {
      setFormError("請選擇倉庫狀態");
      return;
    }
    if (Number.isNaN(sortOrderNumber ?? 0)) {
      setFormError("排序請輸入數字");
      return;
    }
    if (!editingCode) {
      const exists = warehouseRecords.some(
        (warehouse) => warehouse.code.toUpperCase() === normalizedCode,
      );
      if (exists) {
        setFormError("此倉庫代碼已存在，請勿重複建立。");
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      code: normalizedCode,
      name: trimmedName,
      type: formState.type,
      status: formState.status,
      isDefaultReceive: formState.isDefaultReceive,
      isDefaultIssue: formState.isDefaultIssue,
      ...(sortOrderNumber !== undefined ? { sortOrder: sortOrderNumber } : {}),
      address: formState.address.trim(),
      note: formState.note.trim(),
      updatedAt: serverTimestamp(),
      ...(editingCode ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      if (editingCode) {
        await updateDoc(doc(db, "warehouses", normalizedCode), payload);
        setWarehouseRecords((prev) =>
          prev.map((warehouse) =>
            warehouse.code.toUpperCase() === normalizedCode
              ? {
                  ...warehouse,
                  name: trimmedName,
                  type: formState.type,
                  status: formState.status,
                  isDefaultReceive: formState.isDefaultReceive,
                  isDefaultIssue: formState.isDefaultIssue,
                  sortOrder: sortOrderNumber,
                  address: formState.address.trim() || undefined,
                  note: formState.note.trim() || undefined,
                }
              : warehouse,
          ),
        );
        setFormSuccess(`已更新 ${normalizedCode}`);
      } else {
        await setDoc(doc(db, "warehouses", normalizedCode), payload);
        setWarehouseRecords((prev) => [
          ...prev,
          {
            code: normalizedCode,
            name: trimmedName,
            type: formState.type,
            status: formState.status,
            isDefaultReceive: formState.isDefaultReceive,
            isDefaultIssue: formState.isDefaultIssue,
            sortOrder: sortOrderNumber,
            address: formState.address.trim() || undefined,
            note: formState.note.trim() || undefined,
          },
        ]);
        setFormSuccess(`已新增 ${normalizedCode}`);
      }
      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save warehouse", error);
      setFormError("儲存倉庫時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderTypeLabel = (type: Warehouse["type"]) => {
    switch (type) {
      case "raw":
        return "原物料";
      case "wip":
        return "在製品";
      case "fg":
        return "成品";
      default:
        return "其他";
    }
  };

  return (
    <div className="space-y-6">
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                  {editingCode ? "Edit" : "Create"}
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingCode ? `編輯倉庫 ${editingCode}` : "新增倉庫"}
                </h2>
              </div>
              <button
                onClick={closePanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                倉庫代碼
                <input
                  type="text"
                  value={formState.code}
                  onChange={(event) => handleFormChange("code", event.target.value)}
                  disabled={Boolean(editingCode)}
                  maxLength={12}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="例如 WH-MAIN"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                倉庫名稱
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如 主倉"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                類型
                <select
                  value={formState.type}
                  onChange={(event) =>
                    handleFormChange("type", event.target.value as Warehouse["type"])
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {typeOptions
                    .filter((option) => option.value !== "all")
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                狀態
                <select
                  value={formState.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as Warehouse["status"])
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {statusOptions
                    .filter((option) => option.value !== "all")
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>
              <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">預設用途</p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={formState.isDefaultReceive}
                    onChange={(event) => handleFormChange("isDefaultReceive", event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  預設收貨倉
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={formState.isDefaultIssue}
                    onChange={(event) => handleFormChange("isDefaultIssue", event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  預設發料倉
                </label>
                <p className="text-xs text-slate-400">
                  若需限定只能有一個預設倉，可在未來庫存模組加入檢核。
                </p>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                排序
                <input
                  type="number"
                  value={formState.sortOrder}
                  onChange={(event) => handleFormChange("sortOrder", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="數字越小越前面"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                地址（選填）
                <input
                  type="text"
                  value={formState.address}
                  onChange={(event) => handleFormChange("address", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="位置 / 地址"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                備註（選填）
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="備註、提醒"
                />
              </label>
              {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSaving ? "儲存中…" : editingCode ? "更新倉庫" : "建立倉庫"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Warehouses</p>
            <h1 className="text-2xl font-semibold text-slate-900">倉庫主檔</h1>
            <p className="text-sm text-slate-500">
              定義原物料、在製品、成品等倉庫位置，供庫存、物料與單據共用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯出設定
            </button>
            <button
              onClick={openCreatePanel}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增倉庫
            </button>
          </div>
        </div>
        {formSuccess && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {formSuccess}
          </p>
        )}
        {loadError && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            {loadError}
          </p>
        )}

        <form
          onSubmit={handleFilterSubmit}
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
              placeholder="代碼 / 名稱 / 地址 / 備註"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">類型</p>
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, type: event.target.value as FilterType }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {typeOptions.map((option) => (
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
                setFilters((prev) => ({
                  ...prev,
                  status: event.target.value as FilterStatus,
                }))
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
              onClick={handleFilterReset}
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
            {isLoading
              ? "載入中…"
              : `已篩選 ${filteredWarehouses.length} 座倉庫（共 ${warehouseRecords.length} 座）`}
          </p>
          <div className="ml-auto flex gap-2 text-xs font-semibold">
            {typeOptions
              .filter((option) => option.value !== "all")
              .map((option) => (
                <span key={option.value} className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {option.label}
                </span>
              ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["代碼", "名稱", "類型", "位址 / 備註", "預設用途", "狀態", "排序", "操作"].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredWarehouses.map((warehouse) => (
                <tr key={warehouse.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {warehouse.code}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{warehouse.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                      {renderTypeLabel(warehouse.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {warehouse.address ? `${warehouse.address} ` : ""}
                    {warehouse.note ? (
                      <span className="text-slate-400">
                        {warehouse.address ? "｜" : ""}
                        {warehouse.note}
                      </span>
                    ) : null}
                    {!warehouse.address && !warehouse.note ? "—" : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {warehouse.isDefaultReceive && (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          預設收貨
                        </span>
                      )}
                      {warehouse.isDefaultIssue && (
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                          預設發料
                        </span>
                      )}
                      {!warehouse.isDefaultReceive && !warehouse.isDefaultIssue && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        warehouse.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {warehouse.status === "active" ? "使用中" : "停用"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {warehouse.sortOrder ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => openEditPanel(warehouse)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-700"
                    >
                      編輯
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

