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
import type { Brand, Country } from "@/types/master";
import { brands as seedBrands, countries as seedCountries } from "@/data/masterRecords";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

type FilterState = {
  keyword: string;
  status: "all" | "active" | "inactive";
  country: "all" | string;
};

type FormState = {
  code: string;
  name: string;
  countryCode: string;
  status: "active" | "inactive";
  website: string;
  description: string;
  note: string;
  sortOrder: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  status: "all",
  country: "all",
};

const defaultFormState = (): FormState => ({
  code: "",
  name: "",
  countryCode: "",
  status: "active",
  website: "",
  description: "",
  note: "",
  sortOrder: "",
});

const mapBrandDoc = (data: DocumentData, id: string): Brand => ({
  code: (data.code as string) ?? id,
  name: (data.name as string) ?? "",
  countryCode: data.countryCode as string | undefined,
  status: (data.status as "active" | "inactive") ?? "active",
  website: data.website as string | undefined,
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

export function BrandDirectory() {
  const [records, setRecords] = useState<Brand[]>(seedBrands);
  const [countries, setCountries] = useState<Country[]>(seedCountries);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [showViewPanel, setShowViewPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [viewingBrand, setViewingBrand] = useState<Brand | null>(null);
  const [formState, setFormState] = useState<FormState>(() => defaultFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuth();
  const { can } = usePermission();
  const canView = can("brands", "view");
  const canCreate = can("brands", "create");
  const canUpdate = can("brands", "update");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [brandSnap, countrySnap] = await Promise.all([
          getDocs(collection(db, "brands")),
          getDocs(collection(db, "countries")),
        ]);

        if (brandSnap.docs.length) {
          const loadedBrands = brandSnap.docs.map((docSnapshot) =>
            mapBrandDoc(docSnapshot.data(), docSnapshot.id),
          );
          setRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code, item]));
            loadedBrands.forEach((brand) => map.set(brand.code, brand));
            return Array.from(map.values());
          });
        }

        if (countrySnap.docs.length) {
          const loadedCountries = countrySnap.docs.map((docSnapshot) => {
            const data = docSnapshot.data() as Country;
            return {
              ...data,
              code: data.code ?? docSnapshot.id,
              status: data.status ?? "active",
            };
          });
          setCountries(loadedCountries);
        }
      } catch (error) {
        console.error("Failed to load brands reference data", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!showPanel && !showViewPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showPanel, showViewPanel]);

  const countryMap = useMemo(() => new Map(countries.map((country) => [country.code, country])), [
    countries,
  ]);

  const filteredRecords = useMemo(() => {
    return records
      .slice()
      .sort((a, b) => {
        const orderA = a.sortOrder ?? 0;
        const orderB = b.sortOrder ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.code.localeCompare(b.code);
      })
      .filter((record) => {
        const keyword = appliedFilters.keyword.trim().toLowerCase();
        const keywordMatch = keyword
          ? [record.code, record.name, record.website ?? "", record.description ?? "", record.note ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(keyword)
          : true;
        const statusMatch =
          appliedFilters.status === "all" ? true : record.status === appliedFilters.status;
        const countryMatch =
          appliedFilters.country === "all"
            ? true
            : record.countryCode === appliedFilters.country;
        return keywordMatch && statusMatch && countryMatch;
      });
  }, [appliedFilters, records]);

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

  const handleOpenEdit = (record: Brand) => {
    setEditingCode(record.code);
    setFormError(null);
    setFormSuccess(null);
    setFormState({
      code: record.code,
      name: record.name,
      countryCode: record.countryCode ?? "",
      status: record.status,
      website: record.website ?? "",
      description: record.description ?? "",
      note: record.note ?? "",
      sortOrder: record.sortOrder?.toString() ?? "",
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setFormState(defaultFormState());
    setEditingCode(null);
    setFormError(null);
  };

  const handleOpenView = (record: Brand) => {
    setViewingBrand(record);
    setShowViewPanel(true);
  };

  const closeViewPanel = () => {
    setViewingBrand(null);
    setShowViewPanel(false);
  };

  const handleFormChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const normalizedCode = editingCode ? editingCode : formState.code.trim().toUpperCase();
    const trimmedName = formState.name.trim();
    const trimmedCountry = formState.countryCode.trim();
    const trimmedWebsite = formState.website.trim();
    const trimmedDescription = formState.description.trim();
    const trimmedNote = formState.note.trim();
    const sortOrderNumber =
      formState.sortOrder.trim() === "" ? undefined : Number.parseInt(formState.sortOrder, 10);

    if (!normalizedCode) {
      setFormError("請輸入品牌代碼");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入品牌名稱");
      return;
    }
    if (sortOrderNumber !== undefined && Number.isNaN(sortOrderNumber)) {
      setFormError("排序必須為數字");
      return;
    }
    if (!editingCode && records.some((record) => record.code === normalizedCode)) {
      setFormError("此品牌代碼已存在，請勿重複建立。");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const creatorName = user?.displayName || user?.email || "system";
    const payload = {
      code: normalizedCode,
      name: trimmedName,
      countryCode: trimmedCountry || null,
      status: formState.status,
      website: trimmedWebsite || null,
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
      await setDoc(doc(db, "brands", normalizedCode), payload, { merge: true });
      setRecords((prev) => {
        const next = prev.filter((item) => item.code !== normalizedCode);
        const existingRecord = prev.find((item) => item.code === normalizedCode);
        next.push({
          code: normalizedCode,
          name: trimmedName,
          countryCode: trimmedCountry || undefined,
          status: formState.status,
          website: trimmedWebsite || undefined,
          description: trimmedDescription || undefined,
          note: trimmedNote || undefined,
          sortOrder: sortOrderNumber,
          createdByName: editingCode ? existingRecord?.createdByName : creatorName,
          createdByUserId: editingCode ? existingRecord?.createdByUserId : user?.uid ?? undefined,
          createdByEmployeeCode: editingCode ? existingRecord?.createdByEmployeeCode : undefined,
        });
        return next;
      });
      setFormSuccess(editingCode ? `已更新 ${normalizedCode}` : `已新增 ${normalizedCode}`);
      closePanel();
    } catch (error) {
      console.error("Failed to save brand", error);
      setFormError("儲存品牌時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        目前帳號尚未獲得「品牌主檔」權限，請聯絡系統管理員。
      </div>
    );
  }

  const renderCountryLabel = (code?: string) => {
    if (!code) return "—";
    const country = countryMap.get(code);
    return country ? `${country.nameZh} (${country.code})` : code;
  };

  return (
    <div className="space-y-6">
      {showViewPanel && viewingBrand && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">View</p>
                <h2 className="text-xl font-semibold text-slate-900">檢視品牌 {viewingBrand.code}</h2>
              </div>
              <button
                onClick={closeViewPanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  基本資料
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">品牌代碼</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{viewingBrand.code}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">狀態</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        viewingBrand.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {viewingBrand.status === "active" ? "使用中" : "停用"}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">品牌名稱</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">{viewingBrand.name}</p>
                    <p className="text-xs text-slate-500">{viewingBrand.description || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">國別</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {renderCountryLabel(viewingBrand.countryCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">官方網站</p>
                    {viewingBrand.website ? (
                      <a
                        href={viewingBrand.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-sm font-semibold text-teal-600 underline"
                      >
                        {viewingBrand.website}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">—</p>
                    )}
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  備註與建碼資訊
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">備註</p>
                    <p className="mt-1 text-sm text-slate-700">{viewingBrand.note || "—"}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">建碼人</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {viewingBrand.createdByName ?? "未記錄"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">排序</p>
                      <p className="mt-1 text-sm text-slate-700">{viewingBrand.sortOrder ?? "—"}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                  {editingCode ? "Edit" : "Create"}
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingCode ? `編輯品牌 ${formState.code}` : "新增品牌"}
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
                品牌代碼
                <input
                  type="text"
                  value={formState.code}
                  onChange={(event) => handleFormChange("code", event.target.value.toUpperCase())}
                  readOnly={Boolean(editingCode)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="例如：BR-JENFU"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                品牌名稱
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：鉦富機械"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  所屬國家
                  <select
                    value={formState.countryCode}
                    onChange={(event) => handleFormChange("countryCode", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">（未指定）</option>
                    {countries
                      .filter((country) => country.status !== "inactive")
                      .map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.nameZh} ({country.code})
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
              <label className="block text-sm font-semibold text-slate-600">
                官方網站（選填）
                <input
                  type="url"
                  value={formState.website}
                  onChange={(event) => handleFormChange("website", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="https://example.com"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                品牌說明（選填）
                <textarea
                  value={formState.description}
                  onChange={(event) => handleFormChange("description", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="可註記產品線、代理範圍等資訊"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                備註（選填）
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="內部提醒"
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
                  {isSaving ? "儲存中…" : editingCode ? "更新資料" : "建立品牌"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Brand Master</p>
            <h1 className="text-2xl font-semibold text-slate-900">品牌主檔</h1>
            <p className="text-sm text-slate-500">
              統一管理品牌代碼與國別，供物料主檔、供應商與採購流程共用。
            </p>
          </div>
          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增品牌
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
              placeholder="代碼 / 名稱 / 網站"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">國家</p>
            <select
              value={filters.country}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, country: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="all">全部國家</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.nameZh}
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
              <option value="all">全部狀態</option>
              <option value="active">使用中</option>
              <option value="inactive">停用</option>
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
              : `共有 ${filteredRecords.length} 筆品牌資料（總計 ${records.length} 筆）`}
          </p>
          {formSuccess && <p className="text-xs text-emerald-600">{formSuccess}</p>}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["代碼", "品牌名稱", "國別 / 網站", "狀態", "排序", "操作"].map((header) => (
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
                    <p className="text-xs text-slate-500">{record.description ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{renderCountryLabel(record.countryCode)}</p>
                    <p className="text-xs text-slate-400">{record.website ?? "—"}</p>
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
                  <td className="px-4 py-3 text-xs text-slate-500">{record.sortOrder ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenView(record)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        檢視
                      </button>
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(record)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        編輯
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    尚無符合條件的品牌資料
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


