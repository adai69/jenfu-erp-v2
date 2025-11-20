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
import { materialCategories } from "@/data/masterRecords";
import type { MaterialCategory } from "@/types/master";

type CategoryFilter = "all" | MaterialCategory["type"];
type StatusFilter = "all" | MaterialCategory["status"];

type FilterState = {
  keyword: string;
  type: CategoryFilter;
  status: StatusFilter;
};

type CategoryFormState = {
  code: string;
  name: string;
  type: MaterialCategory["type"];
  description: string;
  status: MaterialCategory["status"];
  sortOrder: string;
};

const typeOptions: Array<{ label: string; value: CategoryFilter }> = [
  { label: "全部用途", value: "all" },
  { label: "零件", value: "part" },
  { label: "採購料", value: "purchase" },
  { label: "其他", value: "other" },
];

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部狀態", value: "all" },
  { label: "使用中", value: "active" },
  { label: "停用", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  type: "all",
  status: "all",
};

const createDefaultForm = (): CategoryFormState => ({
  code: "",
  name: "",
  type: "part",
  description: "",
  status: "active",
  sortOrder: "",
});

const isValidCategoryType = (value: unknown): value is MaterialCategory["type"] =>
  value === "part" || value === "purchase" || value === "other";

const isValidStatus = (value: unknown): value is MaterialCategory["status"] =>
  value === "active" || value === "inactive";

function mapCategoryDoc(data: DocumentData, id: string): MaterialCategory {
  return {
    code: (data.code as string) ?? id,
    name: (data.name as string) ?? "",
    type: isValidCategoryType(data.type) ? data.type : "part",
    description: data.description as string | undefined,
    status: isValidStatus(data.status) ? data.status : "active",
    sortOrder:
      typeof data.sortOrder === "number"
        ? data.sortOrder
        : Number.parseInt((data.sortOrder as string) ?? "0", 10) || 0,
  };
}

export function MaterialCategoryDirectory() {
  const [categoryRecords, setCategoryRecords] = useState<MaterialCategory[]>(materialCategories);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(() => createDefaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const snapshot = await getDocs(collection(db, "materialCategories"));
        const loaded: MaterialCategory[] = snapshot.docs.map((docSnapshot) =>
          mapCategoryDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setCategoryRecords((prev) => {
            const existing = new Map(prev.map((item) => [item.code.toUpperCase(), item]));
            loaded.forEach((item) => {
              existing.set(item.code.toUpperCase(), item);
            });
            return Array.from(existing.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load material categories", error);
        setLoadError("讀取雲端分類資料失敗，暫時顯示示範資料。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    if (showPanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    return undefined;
  }, [showPanel]);

  const sortedCategories = useMemo(() => {
    return [...categoryRecords].sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.code.localeCompare(b.code);
    });
  }, [categoryRecords]);

  const filteredCategories = useMemo(() => {
    return sortedCategories.filter((category) => {
      const haystack = [category.code, category.name, category.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const keywordMatch = appliedFilters.keyword
        ? haystack.includes(appliedFilters.keyword.toLowerCase())
        : true;
      const typeMatch =
        appliedFilters.type === "all" ? true : category.type === appliedFilters.type;
      const statusMatch =
        appliedFilters.status === "all" ? true : category.status === appliedFilters.status;
      return keywordMatch && typeMatch && statusMatch;
    });
  }, [appliedFilters, sortedCategories]);

  const handleSubmitFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(formState);
  };

  const handleResetFilters = () => {
    setFormState(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handlePanelClose = () => {
    setShowPanel(false);
    setEditingCode(null);
    setCategoryForm(createDefaultForm());
    setFormError(null);
  };

  const handleCreateClick = () => {
    setCategoryForm(createDefaultForm());
    setEditingCode(null);
    setFormError(null);
    setShowPanel(true);
  };

  const handleEditClick = (category: MaterialCategory) => {
    setCategoryForm({
      code: category.code,
      name: category.name,
      type: category.type,
      description: category.description ?? "",
      status: category.status,
      sortOrder: category.sortOrder?.toString() ?? "",
    });
    setEditingCode(category.code);
    setFormError(null);
    setShowPanel(true);
  };

  const handleFormChange = <K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) => {
    setCategoryForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const normalizedCode = editingCode
      ? editingCode.toUpperCase()
      : categoryForm.code.trim().toUpperCase();
    const trimmedName = categoryForm.name.trim();
    const trimmedDescription = categoryForm.description.trim();
    const sortOrderNumber =
      categoryForm.sortOrder.trim() === ""
        ? undefined
        : Number.parseInt(categoryForm.sortOrder, 10);

    if (!normalizedCode) {
      setFormError("請輸入分類代碼");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入分類名稱");
      return;
    }
    if (!isValidCategoryType(categoryForm.type)) {
      setFormError("請選擇分類用途");
      return;
    }
    if (Number.isNaN(sortOrderNumber ?? 0)) {
      setFormError("排序請輸入數字");
      return;
    }

    if (!editingCode) {
      const exists = categoryRecords.some(
        (item) => item.code.toUpperCase() === normalizedCode,
      );
      if (exists) {
        setFormError("此分類代碼已存在，請勿重複建立。");
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const payload = {
        code: normalizedCode,
        name: trimmedName,
        type: categoryForm.type,
        status: categoryForm.status,
        ...(trimmedDescription ? { description: trimmedDescription } : { description: "" }),
        ...(sortOrderNumber !== undefined ? { sortOrder: sortOrderNumber } : {}),
        updatedAt: serverTimestamp(),
        ...(editingCode ? {} : { createdAt: serverTimestamp() }),
      };

      if (editingCode) {
        await setDoc(doc(db, "materialCategories", normalizedCode), payload, { merge: true });
        setCategoryRecords((prev) =>
          prev.map((item) =>
            item.code.toUpperCase() === normalizedCode
              ? {
                  ...item,
                  name: trimmedName,
                  type: categoryForm.type,
                  description: trimmedDescription || undefined,
                  status: categoryForm.status,
                  sortOrder: sortOrderNumber,
                }
              : item,
          ),
        );
        setFormSuccess(`已更新 ${normalizedCode}`);
      } else {
        await setDoc(doc(db, "materialCategories", normalizedCode), payload);
        setCategoryRecords((prev) => [
          ...prev,
          {
            code: normalizedCode,
            name: trimmedName,
            type: categoryForm.type,
            description: trimmedDescription || undefined,
            status: categoryForm.status,
            sortOrder: sortOrderNumber,
          },
        ]);
        setFormSuccess(`已新增 ${normalizedCode}`);
      }

      handlePanelClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save material category", error);
      setFormError("儲存分類時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
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
                  {editingCode ? `編輯分類 ${editingCode}` : "新增物料分類"}
                </h2>
              </div>
              <button
                onClick={handlePanelClose}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                分類代碼
                <input
                  type="text"
                  value={categoryForm.code}
                  onChange={(event) => handleFormChange("code", event.target.value)}
                  disabled={Boolean(editingCode)}
                  maxLength={8}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="如：MECH / ELEC"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                名稱
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：機構零件"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                用途
                <select
                  value={categoryForm.type}
                  onChange={(event) =>
                    handleFormChange("type", event.target.value as MaterialCategory["type"])
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
                  value={categoryForm.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as MaterialCategory["status"])
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
              <label className="block text-sm font-semibold text-slate-600">
                排序
                <input
                  type="number"
                  value={categoryForm.sortOrder}
                  onChange={(event) => handleFormChange("sortOrder", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="數字越小越前面"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                描述（選填）
                <textarea
                  value={categoryForm.description}
                  onChange={(event) => handleFormChange("description", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="用途、備註等描述"
                />
              </label>
              {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePanelClose}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSaving ? "儲存中…" : editingCode ? "更新分類" : "建立分類"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Categories</p>
            <h1 className="text-2xl font-semibold text-slate-900">物料分類主檔</h1>
            <p className="text-sm text-slate-500">
              用於物料主檔、BOM、庫存分析的共用分類字典。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯出設定
            </button>
            <button
              onClick={handleCreateClick}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增分類
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
          onSubmit={handleSubmitFilters}
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
              placeholder="代碼 / 名稱 / 描述"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">用途</p>
            <select
              value={formState.type}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, type: event.target.value as CategoryFilter }))
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
              value={formState.status}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, status: event.target.value as StatusFilter }))
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
              onClick={handleResetFilters}
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
              : `已篩選 ${filteredCategories.length} 組分類（共 ${categoryRecords.length} 組）`}
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
                {["代碼", "名稱", "用途", "描述", "狀態", "排序", "操作"].map((header) => (
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
              {filteredCategories.map((category) => (
                <tr key={category.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {category.code}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{category.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                      {category.type === "part"
                        ? "零件"
                        : category.type === "purchase"
                        ? "採購料"
                        : "其他"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {category.description ? category.description : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        category.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {category.status === "active" ? "使用中" : "停用"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {category.sortOrder ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => handleEditClick(category)}
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

