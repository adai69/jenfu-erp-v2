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
import type { PurchaseMethod, PurchaseMethodCategory } from "@/types/master";
import { purchaseMethods as seedPurchaseMethods } from "@/data/masterRecords";
import { usePermission } from "@/hooks/usePermission";
import { issueSequence } from "@/lib/sequenceManager";
import { useAuth } from "@/contexts/AuthContext";

type FilterState = {
  keyword: string;
  status: "all" | "active" | "inactive";
  category: "all" | PurchaseMethodCategory;
};

type FormState = {
  code: string;
  name: string;
  category: PurchaseMethodCategory;
  status: "active" | "inactive";
  description: string;
  note: string;
  sortOrder: string;
};

const categoryOptions: Array<{ label: string; value: PurchaseMethodCategory | "all" }> = [
  { label: "全部類別", value: "all" },
  { label: "一般採購", value: "general" },
  { label: "委外加工", value: "outsourcing" },
  { label: "寄售 / Consignment", value: "consignment" },
  { label: "合約 / 長約", value: "contract" },
  { label: "其他", value: "other" },
];

const statusOptions = [
  { label: "全部狀態", value: "all" },
  { label: "使用中", value: "active" },
  { label: "停用", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  status: "all",
  category: "all",
};

const defaultFormState = (): FormState => ({
  code: "",
  name: "",
  category: "general",
  status: "active",
  description: "",
  note: "",
  sortOrder: "",
});

const mapPurchaseMethodDoc = (data: DocumentData, id: string): PurchaseMethod => ({
  code: (data.code as string) ?? id,
  name: (data.name as string) ?? "",
  category: (data.category as PurchaseMethodCategory) ?? "general",
  status: (data.status as "active" | "inactive") ?? "active",
  description: data.description as string | undefined,
  note: data.note as string | undefined,
  sortOrder:
    typeof data.sortOrder === "number"
      ? data.sortOrder
      : Number.parseInt((data.sortOrder as string) ?? "0", 10) || undefined,
  createdByUserId: data.createdByUserId as string | undefined,
  createdByEmployeeCode: data.createdByEmployeeCode as string | undefined,
  createdByName: data.createdByName as string | undefined,
});

export function PurchaseMethodDirectory() {
  const [records, setRecords] = useState<PurchaseMethod[]>(seedPurchaseMethods);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => defaultFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuth();
  const { can } = usePermission();
  const canView = can("purchaseMethods", "view");
  const canCreate = can("purchaseMethods", "create");
  const canUpdate = can("purchaseMethods", "update");

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const snapshot = await getDocs(collection(db, "purchaseMethods"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapPurchaseMethodDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code, item]));
            loaded.forEach((item) => map.set(item.code, item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load purchase methods", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecords();
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
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.code.localeCompare(b.code);
    });
  }, [records]);

  const filteredRecords = useMemo(() => {
    return sortedRecords.filter((record) => {
      const keyword = appliedFilters.keyword.trim().toLowerCase();
      const keywordMatch = keyword
        ? [record.code, record.name, record.description, record.note]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const categoryMatch =
        appliedFilters.category === "all" ? true : record.category === appliedFilters.category;
      const statusMatch =
        appliedFilters.status === "all" ? true : record.status === appliedFilters.status;
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

  const handleGenerateCode = async () => {
    try {
      const seq = await issueSequence("PURCHASE_METHOD");
      setFormState((prev) => ({ ...prev, code: seq.value }));
      setFormError(null);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to issue purchase method sequence", error);
      setFormError("取得採購方式編號失敗，請稍後再試。");
    }
  };

  const handleOpenCreate = async () => {
    setEditingCode(null);
    setFormError(null);
    setFormSuccess(null);
    setFormState(defaultFormState());
    setShowPanel(true);
    await handleGenerateCode();
  };

  const handleOpenEdit = (record: PurchaseMethod) => {
    setEditingCode(record.code);
    setFormError(null);
    setFormSuccess(null);
    setFormState({
      code: record.code,
      name: record.name,
      category: record.category,
      status: record.status,
      description: record.description ?? "",
      note: record.note ?? "",
      sortOrder: record.sortOrder?.toString() ?? "",
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setFormState(defaultFormState());
    setFormError(null);
    setEditingCode(null);
  };

  const handleFormChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const normalizedCode = editingCode ? editingCode : formState.code.trim();
    const trimmedName = formState.name.trim();
    const trimmedDescription = formState.description.trim();
    const trimmedNote = formState.note.trim();
    const sortOrderNumber =
      formState.sortOrder.trim() === "" ? undefined : Number.parseInt(formState.sortOrder, 10);

    if (!normalizedCode) {
      setFormError("請輸入或產生採購方式代碼");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入採購方式名稱");
      return;
    }
    if (sortOrderNumber !== undefined && Number.isNaN(sortOrderNumber)) {
      setFormError("排序必須為數字");
      return;
    }
    if (!editingCode) {
      const exists = records.some((record) => record.code === normalizedCode);
      if (exists) {
        setFormError("此代碼已存在，請勿重複建立。");
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);

    const creatorName = user?.displayName || user?.email || "system";
    const payload = {
      code: normalizedCode,
      name: trimmedName,
      category: formState.category,
      status: formState.status,
      description: trimmedDescription || null,
      note: trimmedNote || null,
      sortOrder: sortOrderNumber ?? null,
      updatedAt: serverTimestamp(),
      ...(editingCode
        ? {}
        : {
            createdAt: serverTimestamp(),
            createdByUserId: user?.uid ?? null,
            createdByName: creatorName,
          }),
    };

    try {
      await setDoc(doc(db, "purchaseMethods", normalizedCode), payload, { merge: true });
      setRecords((prev) => {
        const next = prev.filter((item) => item.code !== normalizedCode);
        next.push({
          code: normalizedCode,
          name: trimmedName,
          category: formState.category,
          status: formState.status,
          description: trimmedDescription || undefined,
          note: trimmedNote || undefined,
          sortOrder: sortOrderNumber,
          createdByName: editingCode
            ? prev.find((item) => item.code === normalizedCode)?.createdByName
            : creatorName,
          createdByUserId: editingCode
            ? prev.find((item) => item.code === normalizedCode)?.createdByUserId
            : user?.uid ?? undefined,
        });
        return next;
      });
      setFormSuccess(editingCode ? `已更新 ${normalizedCode}` : `已新增 ${normalizedCode}`);
      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save purchase method", error);
      setFormError("儲存時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderCategoryLabel = (value: PurchaseMethodCategory) => {
    switch (value) {
      case "general":
        return "一般採購";
      case "outsourcing":
        return "委外加工";
      case "consignment":
        return "寄售 / Consignment";
      case "contract":
        return "合約 / 長約";
      default:
        return "其他";
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        目前帳號尚未獲得「採購方式」權限，請聯絡系統管理員。
      </div>
    );
  }

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
                  {editingCode ? `編輯採購方式 ${formState.code}` : "新增採購方式"}
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
              <div className="flex items-center gap-2">
                <label className="flex-1 text-sm font-semibold text-slate-600">
                  採購方式代碼
                  <input
                    type="text"
                    value={formState.code}
                    onChange={(event) =>
                      handleFormChange("code", event.target.value.toUpperCase())
                    }
                    readOnly={Boolean(editingCode)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                    placeholder="例如：PMT001"
                  />
                </label>
                {!editingCode && (
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    className="mt-6 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-teal-500 hover:text-teal-600"
                  >
                    重新取號
                  </button>
                )}
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                名稱
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：一般採購"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                類別
                <select
                  value={formState.category}
                  onChange={(event) =>
                    handleFormChange("category", event.target.value as PurchaseMethodCategory)
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
              <label className="block text-sm font-semibold text-slate-600">
                狀態
                <select
                  value={formState.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as "active" | "inactive")
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="active">使用中</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                說明
                <textarea
                  value={formState.description}
                  onChange={(event) => handleFormChange("description", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="此採購方式的條件或使用時機"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                備註
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="內部提醒事項"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                排序（選填）
                <input
                  type="number"
                  value={formState.sortOrder}
                  onChange={(event) => handleFormChange("sortOrder", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="數字愈小愈前面"
                />
              </label>
              {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
              {formSuccess && (
                <p className="text-sm font-semibold text-emerald-600">{formSuccess}</p>
              )}
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
                  disabled={
                    isSaving ||
                    (!editingCode && !canCreate) ||
                    (Boolean(editingCode) && !canUpdate)
                  }
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {isSaving ? "儲存中…" : editingCode ? "更新資料" : "建立採購方式"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Purchase Method</p>
            <h1 className="text-2xl font-semibold text-slate-900">採購方式主檔</h1>
            <p className="text-sm text-slate-500">定義一般採購、委外、寄售等流程，並與物料主檔連動。</p>
          </div>
          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增採購方式
            </button>
          )}
        </div>
        <form
          onSubmit={handleFilterSubmit}
          className="mt-6 grid gap-4 rounded-2xl bg-slate-50/80 p-4 md:grid-cols-4"
        >
          <label className="md:col-span-2">
            <p className="text-xs font-semibold text-slate-600">搜尋關鍵字</p>
            <input
              type="text"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
              placeholder="代碼 / 名稱 / 說明"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">類別</p>
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  category: event.target.value as FilterState["category"],
                }))
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
                setFilters((prev) => ({
                  ...prev,
                  status: event.target.value as FilterState["status"],
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
              ? "資料載入中…"
              : `共有 ${filteredRecords.length} 筆採購方式（總計 ${records.length} 筆）`}
          </p>
          {formSuccess && <p className="text-xs text-emerald-600">{formSuccess}</p>}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["代碼", "名稱 / 類別", "狀態", "說明 / 備註", "排序", "操作"].map((header) => (
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
              {filteredRecords.map((record) => (
                <tr key={record.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {record.code}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{record.name}</p>
                    <p className="text-xs text-slate-500">{renderCategoryLabel(record.category)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        record.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {record.status === "active" ? "使用中" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">
                      {record.description?.trim() || "—"}
                    </p>
                    {record.note && (
                      <p className="text-xs text-slate-400">備註：{record.note}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{record.sortOrder ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(record)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        編輯
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    尚無符合條件的採購方式資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


