"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import type { PaymentTerm } from "@/types/master";
import { paymentTerms as seedPaymentTerms } from "@/data/masterRecords";

type CategoryFilter = "all" | PaymentTerm["category"];
type StatusFilter = "all" | PaymentTerm["status"];

type FilterState = {
  keyword: string;
  category: CategoryFilter;
  status: StatusFilter;
};

type PaymentTermForm = {
  code: string;
  name: string;
  category: PaymentTerm["category"];
  status: PaymentTerm["status"];
  description: string;
  netDays: string;
  monthlyOffset: string;
  sortOrder: string;
};

const categoryOptions: Array<{ label: string; value: CategoryFilter }> = [
  { label: "全部類型", value: "all" },
  { label: "現金 / COD", value: "cash" },
  { label: "貨到 N 天", value: "net" },
  { label: "月結", value: "monthly" },
  { label: "預付 / 分期", value: "installment" },
];

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部狀態", value: "all" },
  { label: "使用中", value: "active" },
  { label: "停用", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  category: "all",
  status: "all",
};

const defaultFormState = (): PaymentTermForm => ({
  code: "",
  name: "",
  category: "net",
  status: "active",
  description: "",
  netDays: "",
  monthlyOffset: "",
  sortOrder: "",
});

const mapPaymentTermDoc = (data: DocumentData, id: string): PaymentTerm => ({
  code: (data.code as string) ?? id,
  name: (data.name as string) ?? "",
  category: (data.category as PaymentTerm["category"]) ?? "net",
  status: (data.status as PaymentTerm["status"]) ?? "active",
  description: data.description as string | undefined,
  netDays: typeof data.netDays === "number" ? data.netDays : undefined,
  monthlyOffset: typeof data.monthlyOffset === "number" ? data.monthlyOffset : undefined,
  sortOrder:
    typeof data.sortOrder === "number"
      ? data.sortOrder
      : Number.parseInt((data.sortOrder as string) ?? "0", 10) || 0,
});

export function PaymentTermDirectory() {
  const [records, setRecords] = useState<PaymentTerm[]>(seedPaymentTerms);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<PaymentTermForm>(() => defaultFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const snapshot = await getDocs(collection(db, "paymentTerms"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapPaymentTermDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code.toUpperCase(), item]));
            loaded.forEach((item) => map.set(item.code.toUpperCase(), item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load payment terms", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTerms();
  }, []);

  useEffect(() => {
    if (!showPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showPanel]);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const sortA = a.sortOrder ?? 0;
      const sortB = b.sortOrder ?? 0;
      if (sortA !== sortB) return sortA - sortB;
      return a.code.localeCompare(b.code);
    });
  }, [records]);

  const filteredRecords = useMemo(() => {
    return sortedRecords.filter((term) => {
      const keyword = appliedFilters.keyword.toLowerCase();
      const keywordMatch = keyword
        ? [term.code, term.name, term.description].filter(Boolean).join(" ").toLowerCase().includes(keyword)
        : true;
      const categoryMatch =
        appliedFilters.category === "all" ? true : term.category === appliedFilters.category;
      const statusMatch =
        appliedFilters.status === "all" ? true : term.status === appliedFilters.status;
      return keywordMatch && categoryMatch && statusMatch;
    });
  }, [appliedFilters, sortedRecords]);

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleFilterReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handleOpenCreate = () => {
    setEditingCode(null);
    setFormError(null);
    setFormState(defaultFormState());
    setShowPanel(true);
  };

  const handleOpenEdit = (term: PaymentTerm) => {
    setEditingCode(term.code);
    setFormError(null);
    setFormState({
      code: term.code,
      name: term.name,
      category: term.category,
      status: term.status,
      description: term.description ?? "",
      netDays: term.netDays?.toString() ?? "",
      monthlyOffset: term.monthlyOffset?.toString() ?? "",
      sortOrder: term.sortOrder?.toString() ?? "",
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setFormState(defaultFormState());
    setFormError(null);
    setEditingCode(null);
  };

  const handleFormChange = <K extends keyof PaymentTermForm>(key: K, value: PaymentTermForm[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const normalizedCode = editingCode
      ? editingCode.toUpperCase()
      : formState.code.trim().toUpperCase();
    const trimmedName = formState.name.trim();
    const trimmedDescription = formState.description.trim();
    const sortOrderNumber =
      formState.sortOrder.trim() === ""
        ? undefined
        : Number.parseInt(formState.sortOrder, 10);
    const netDaysNumber =
      formState.netDays.trim() === "" ? undefined : Number.parseInt(formState.netDays, 10);
    const monthlyOffsetNumber =
      formState.monthlyOffset.trim() === ""
        ? undefined
        : Number.parseInt(formState.monthlyOffset, 10);

    if (!normalizedCode) {
      setFormError("請輸入付款條件代碼");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入付款條件名稱");
      return;
    }
    if (Number.isNaN(sortOrderNumber ?? 0)) {
      setFormError("排序請輸入數字");
      return;
    }
    if (formState.category === "net" && (netDaysNumber === undefined || Number.isNaN(netDaysNumber))) {
      setFormError("貨到 N 天的條件，需要輸入天數");
      return;
    }
    if (
      formState.category === "monthly" &&
      (monthlyOffsetNumber === undefined || Number.isNaN(monthlyOffsetNumber))
    ) {
      setFormError("月結條件需要輸入付款天數，如 30");
      return;
    }
    if (!editingCode) {
      const exists = records.some((item) => item.code.toUpperCase() === normalizedCode);
      if (exists) {
        setFormError("此代碼已存在，請勿重複建立。");
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      code: normalizedCode,
      name: trimmedName,
      category: formState.category,
      status: formState.status,
      description: trimmedDescription,
      ...(netDaysNumber !== undefined ? { netDays: netDaysNumber } : { netDays: null }),
      ...(monthlyOffsetNumber !== undefined
        ? { monthlyOffset: monthlyOffsetNumber }
        : { monthlyOffset: null }),
      ...(sortOrderNumber !== undefined ? { sortOrder: sortOrderNumber } : { sortOrder: null }),
      updatedAt: serverTimestamp(),
      ...(editingCode ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      await setDoc(doc(db, "paymentTerms", normalizedCode), payload, { merge: true });
      setRecords((prev) => {
        const next = prev.filter((item) => item.code.toUpperCase() !== normalizedCode);
        next.push({
          code: normalizedCode,
          name: trimmedName,
          category: formState.category,
          status: formState.status,
          description: trimmedDescription || undefined,
          netDays: netDaysNumber,
          monthlyOffset: monthlyOffsetNumber,
          sortOrder: sortOrderNumber,
        });
        return next;
      });
      setFormSuccess(editingCode ? `已更新 ${normalizedCode}` : `已新增 ${normalizedCode}`);
      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save payment term", error);
      setFormError("儲存付款條件時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderCategoryLabel = (category: PaymentTerm["category"]) => {
    switch (category) {
      case "cash":
        return "現金 / COD";
      case "net":
        return "貨到 N 天";
      case "monthly":
        return "月結";
      case "installment":
        return "預付 / 分期";
      default:
        return "其他";
    }
  };

  return (
    <div className="space-y-6">
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                  {editingCode ? "Edit" : "Create"}
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingCode ? `編輯付款條件 ${formState.code}` : "新增付款條件"}
                </h2>
              </div>
              <button
                onClick={closePanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                分類代碼
                <input
                  type="text"
                  value={formState.code}
                  onChange={(event) => handleFormChange("code", event.target.value.toUpperCase())}
                  readOnly={Boolean(editingCode)}
                  maxLength={12}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="例：NET30"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                名稱
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例：月結 30 天"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                類別
                <select
                  value={formState.category}
                  onChange={(event) =>
                    handleFormChange("category", event.target.value as PaymentTerm["category"])
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {categoryOptions
                    .filter((option) => option.value !== "all")
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>
              {formState.category === "net" && (
                <label className="block text-sm font-semibold text-slate-600">
                  天數（例：30）
                  <input
                    type="number"
                    min={0}
                    value={formState.netDays}
                    onChange={(event) => handleFormChange("netDays", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
              )}
              {formState.category === "monthly" && (
                <label className="block text-sm font-semibold text-slate-600">
                  付款天數（例：30 = 次月 30 日）
                  <input
                    type="number"
                    min={0}
                    value={formState.monthlyOffset}
                    onChange={(event) => handleFormChange("monthlyOffset", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
              )}
              <label className="block text-sm font-semibold text-slate-600">
                狀態
                <select
                  value={formState.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as PaymentTerm["status"])
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="active">使用中</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                排序
                <input
                  type="number"
                  value={formState.sortOrder}
                  onChange={(event) => handleFormChange("sortOrder", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                描述（選填）
                <textarea
                  value={formState.description}
                  onChange={(event) => handleFormChange("description", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="補充說明：結帳週期、預付比例、核准流程…"
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
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {isSaving ? "儲存中…" : editingCode ? "更新條件" : "建立條件"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Payment Terms</p>
            <h1 className="text-2xl font-semibold text-slate-900">付款條件主檔</h1>
            <p className="text-sm text-slate-500">統一管理供應商與單據使用的付款條件文字與邏輯。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯出設定
            </button>
            <button
              onClick={handleOpenCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增付款條件
            </button>
          </div>
        </div>
        {formSuccess && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {formSuccess}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form
          onSubmit={handleFilterSubmit}
          className="grid gap-4 rounded-2xl bg-slate-50/80 p-4 md:grid-cols-4"
        >
          <label className="md:col-span-2">
            <p className="text-xs font-semibold text-slate-600">搜尋關鍵字</p>
            <input
              type="text"
              value={filters.keyword}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, keyword: event.target.value }))
              }
              placeholder="代碼 / 名稱 / 描述"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">類型</p>
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, category: event.target.value as CategoryFilter }))
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
          <label>
            <p className="text-xs font-semibold text-slate-600">狀態</p>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value as StatusFilter }))
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
              : `已篩選 ${filteredRecords.length} 筆條件（共 ${records.length} 筆）`}
          </p>
          <div className="ml-auto flex gap-2 text-xs font-semibold">
            {categoryOptions
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
                {["代碼", "名稱", "類型", "描述", "狀態", "排序", "操作"].map((header) => (
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
              {filteredRecords.map((term) => (
                <tr key={term.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {term.code}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{term.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                      {renderCategoryLabel(term.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {term.description ? term.description : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        term.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {term.status === "active" ? "使用中" : "停用"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {term.sortOrder ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => handleOpenEdit(term)}
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

