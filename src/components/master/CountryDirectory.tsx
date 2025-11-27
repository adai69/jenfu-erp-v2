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
import type { Country, CountryRegion } from "@/types/master";
import { countries as seedCountries } from "@/data/masterRecords";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

type FilterState = {
  keyword: string;
  status: "all" | "active" | "inactive";
  region: CountryRegion | "all";
};

type FormState = {
  code: string;
  nameZh: string;
  nameEn: string;
  status: "active" | "inactive";
  region: CountryRegion;
  phoneCode: string;
  currencyCode: string;
  sortOrder: string;
  note: string;
};

const regionOptions: Array<{ label: string; value: CountryRegion }> = [
  { label: "亞洲", value: "asia" },
  { label: "歐洲", value: "europe" },
  { label: "美洲", value: "america" },
  { label: "大洋洲", value: "oceania" },
  { label: "非洲", value: "africa" },
  { label: "中東", value: "middle-east" },
  { label: "其他", value: "other" },
];

const regionLabelMap: Record<CountryRegion, string> = regionOptions.reduce(
  (map, option) => ({ ...map, [option.value]: option.label }),
  {} as Record<CountryRegion, string>,
);

const statusOptions = [
  { label: "全部狀態", value: "all" },
  { label: "使用中", value: "active" },
  { label: "停用", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  status: "all",
  region: "all",
};

const defaultFormState = (): FormState => ({
  code: "",
  nameZh: "",
  nameEn: "",
  status: "active",
  region: "asia",
  phoneCode: "",
  currencyCode: "",
  sortOrder: "",
  note: "",
});

const mapCountryDoc = (data: DocumentData, id: string): Country => ({
  code: (data.code as string) ?? id,
  nameZh: (data.nameZh as string) ?? "",
  nameEn: data.nameEn as string | undefined,
  status: (data.status as "active" | "inactive") ?? "active",
  region: data.region as CountryRegion | undefined,
  phoneCode: data.phoneCode as string | undefined,
  currencyCode: data.currencyCode as string | undefined,
  sortOrder:
    typeof data.sortOrder === "number"
      ? data.sortOrder
      : Number.parseInt((data.sortOrder as string) ?? "0", 10) || undefined,
  note: data.note as string | undefined,
  createdByUserId: data.createdByUserId as string | undefined,
  createdByEmployeeCode: data.createdByEmployeeCode as string | undefined,
  createdByName: data.createdByName as string | undefined,
});

export function CountryDirectory() {
  const [records, setRecords] = useState<Country[]>(seedCountries);
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
  const canView = can("countries", "view");
  const canCreate = can("countries", "create");
  const canUpdate = can("countries", "update");

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const snapshot = await getDocs(collection(db, "countries"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapCountryDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code, item]));
            loaded.forEach((item) => map.set(item.code, item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        console.error("Failed to load countries", error);
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
        ? [
            record.code,
            record.nameZh,
            record.nameEn,
            record.currencyCode,
            record.note,
            record.phoneCode,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const statusMatch =
        appliedFilters.status === "all" ? true : record.status === appliedFilters.status;
      const regionMatch =
        appliedFilters.region === "all" ? true : record.region === appliedFilters.region;
      return keywordMatch && statusMatch && regionMatch;
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
    setFormSuccess(null);
    setFormState(defaultFormState());
    setShowPanel(true);
  };

  const handleOpenEdit = (record: Country) => {
    setEditingCode(record.code);
    setFormError(null);
    setFormSuccess(null);
    setFormState({
      code: record.code,
      nameZh: record.nameZh,
      nameEn: record.nameEn ?? "",
      status: record.status,
      region: record.region ?? "asia",
      phoneCode: record.phoneCode ?? "",
      currencyCode: record.currencyCode ?? "",
      sortOrder: record.sortOrder?.toString() ?? "",
      note: record.note ?? "",
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

    const normalizedCode = editingCode ? editingCode : formState.code.trim().toUpperCase();
    const trimmedNameZh = formState.nameZh.trim();
    const trimmedNameEn = formState.nameEn.trim();
    const trimmedPhone = formState.phoneCode.trim();
    const trimmedCurrency = formState.currencyCode.trim().toUpperCase();
    const trimmedNote = formState.note.trim();
    const sortOrderNumber =
      formState.sortOrder.trim() === "" ? undefined : Number.parseInt(formState.sortOrder, 10);

    if (!normalizedCode) {
      setFormError("請輸入國家代碼（建議使用 ISO 2 碼）");
      return;
    }
    if (!trimmedNameZh) {
      setFormError("請輸入中文名稱");
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
      nameZh: trimmedNameZh,
      nameEn: trimmedNameEn || null,
      status: formState.status,
      region: formState.region,
      phoneCode: trimmedPhone || null,
      currencyCode: trimmedCurrency || null,
      sortOrder: sortOrderNumber ?? null,
      note: trimmedNote || null,
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
      await setDoc(doc(db, "countries", normalizedCode), payload, { merge: true });
      setRecords((prev) => {
        const next = prev.filter((item) => item.code !== normalizedCode);
        const existingRecord = prev.find((item) => item.code === normalizedCode);
        next.push({
          code: normalizedCode,
          nameZh: trimmedNameZh,
          nameEn: trimmedNameEn || undefined,
          status: formState.status,
          region: formState.region,
          phoneCode: trimmedPhone || undefined,
          currencyCode: trimmedCurrency || undefined,
          sortOrder: sortOrderNumber,
          note: trimmedNote || undefined,
          createdByName: editingCode ? existingRecord?.createdByName : creatorName,
          createdByUserId: editingCode ? existingRecord?.createdByUserId : user?.uid ?? undefined,
          createdByEmployeeCode: editingCode ? existingRecord?.createdByEmployeeCode : undefined,
        });
        return next;
      });
      setFormSuccess(editingCode ? `已更新 ${normalizedCode}` : `已新增 ${normalizedCode}`);
      closePanel();
    } catch (error) {
      console.error("Failed to save country", error);
      setFormError("儲存時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderRegionLabel = (value?: CountryRegion) => {
    if (!value) return "—";
    return regionLabelMap[value] ?? "—";
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        目前帳號尚未獲得「國家主檔」權限，請聯絡系統管理員。
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
                  {editingCode ? `編輯國家 ${formState.code}` : "新增國家"}
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
                國家代碼
                <input
                  type="text"
                  value={formState.code}
                  onChange={(event) => handleFormChange("code", event.target.value.toUpperCase())}
                  readOnly={Boolean(editingCode)}
                  maxLength={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="例如：TW / JP / VN"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                中文名稱
                <input
                  type="text"
                  value={formState.nameZh}
                  onChange={(event) => handleFormChange("nameZh", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：越南"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                英文名稱（選填）
                <input
                  type="text"
                  value={formState.nameEn}
                  onChange={(event) => handleFormChange("nameEn", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：Vietnam"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  區域
                  <select
                    value={formState.region}
                    onChange={(event) =>
                      handleFormChange("region", event.target.value as CountryRegion)
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {regionOptions.map((option) => (
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
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  國碼（選填）
                  <input
                    type="text"
                    value={formState.phoneCode}
                    onChange={(event) => handleFormChange("phoneCode", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    placeholder="例如：+84"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  幣別（選填）
                  <input
                    type="text"
                    value={formState.currencyCode}
                    onChange={(event) =>
                      handleFormChange("currencyCode", event.target.value.toUpperCase())
                    }
                    maxLength={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none"
                    placeholder="例如：TWD / USD"
                  />
                </label>
              </div>
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
              <label className="block text-sm font-semibold text-slate-600">
                備註
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="使用情境 / 內部說明"
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
                  {isSaving ? "儲存中…" : editingCode ? "更新資料" : "建立國家"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Country Master</p>
            <h1 className="text-2xl font-semibold text-slate-900">國家主檔</h1>
            <p className="text-sm text-slate-500">
              統一管理國別代碼、幣別與國碼，供品牌、供應商、客戶等模組共用。
            </p>
          </div>
          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增國家
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
              placeholder="代碼 / 中文 / 英文 / 幣別"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">區域</p>
            <select
              value={filters.region}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  region: event.target.value as FilterState["region"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="all">全部區域</option>
              {regionOptions.map((option) => (
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
              : `共有 ${filteredRecords.length} 筆國家資料（總計 ${records.length} 筆）`}
          </p>
          {formSuccess && <p className="text-xs text-emerald-600">{formSuccess}</p>}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["代碼", "國家名稱", "區域 / 幣別", "國碼", "狀態", "備註", "操作"].map(
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
              {filteredRecords.map((record) => (
                <tr key={record.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {record.code}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{record.nameZh}</p>
                    <p className="text-xs text-slate-500">{record.nameEn || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{renderRegionLabel(record.region)}</p>
                    <p className="text-xs text-slate-400">{record.currencyCode || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.phoneCode || "—"}</td>
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
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {record.note?.trim() || "—"}
                  </td>
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
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                    尚無符合條件的國家資料
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


