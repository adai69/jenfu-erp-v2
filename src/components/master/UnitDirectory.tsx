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
import { units } from "@/data/masterRecords";
import type { Unit } from "@/types/master";
import { db } from "@/lib/firebaseClient";

const categoryOptions = [
  { label: "全部類別", value: "all" },
  { label: "重量", value: "weight" },
  { label: "長度", value: "length" },
  { label: "體積", value: "volume" },
  { label: "數量", value: "count" },
  { label: "流量", value: "flow" },
  { label: "溫度", value: "temperature" },
] as const;

const unitCategoryValues: Unit["category"][] = [
  "weight",
  "length",
  "volume",
  "count",
  "flow",
  "temperature",
];

const selectableCategories = categoryOptions.filter((option) => option.value !== "all");

type FilterState = {
  keyword: string;
  category: string;
};

type CreateUnitForm = {
  code: string;
  name: string;
  category: Unit["category"];
  conversion: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  category: "all",
};

const createDefaultForm = (): CreateUnitForm => ({
  code: "",
  name: "",
  category: selectableCategories[0]?.value ?? "count",
  conversion: "",
});

const isValidCategory = (value: unknown): value is Unit["category"] =>
  typeof value === "string" && unitCategoryValues.includes(value as Unit["category"]);

function mapUnitDoc(data: DocumentData, id: string): Unit {
  const category = isValidCategory(data.category) ? data.category : "count";
  return {
    code: data.code ?? id,
    name: data.name ?? "",
    category,
    ...(data.conversion ? { conversion: data.conversion as string } : {}),
  };
}

export function UnitDirectory() {
  const [unitRecords, setUnitRecords] = useState<Unit[]>(units);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUnitForm>(() => createDefaultForm());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const snapshot = await getDocs(collection(db, "units"));
        const loaded: Unit[] = snapshot.docs.map((unitDoc) => {
          const data = unitDoc.data();
          return mapUnitDoc(data, unitDoc.id);
        });
        if (loaded.length) {
          setUnitRecords((prev) => {
            const existingCodes = new Set(prev.map((unit) => unit.code.toUpperCase()));
            const merged = [...prev];
            loaded.forEach((unit) => {
              if (!existingCodes.has(unit.code.toUpperCase())) {
                merged.push(unit);
              }
            });
            return merged;
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load units from Firestore", error);
        setLoadError("讀取雲端計量單位失敗，暫時顯示示範資料。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnits();
  }, []);

  useEffect(() => {
    if (showCreatePanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    return undefined;
  }, [showCreatePanel]);

  const filteredUnits = useMemo(() => {
    return unitRecords.filter((unit) => {
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
  }, [appliedFilters, unitRecords]);
  const handleCreateUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;

    const normalizedCode = createForm.code.trim().toUpperCase();
    const trimmedName = createForm.name.trim();
    const trimmedConversion = createForm.conversion.trim();

    if (!normalizedCode) {
      setCreateError("請輸入單位代碼");
      return;
    }
    if (!trimmedName) {
      setCreateError("請輸入單位名稱");
      return;
    }
    if (!createForm.category) {
      setCreateError("請選擇單位類別");
      return;
    }
    const duplicate = unitRecords.some(
      (unit) => unit.code.toUpperCase() === normalizedCode,
    );
    if (duplicate) {
      setCreateError("此單位代碼已存在，請勿重複建立。");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await setDoc(doc(db, "units", normalizedCode), {
        code: normalizedCode,
        name: trimmedName,
        category: createForm.category,
        ...(trimmedConversion ? { conversion: trimmedConversion } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newUnit: Unit = {
        code: normalizedCode,
        name: trimmedName,
        category: createForm.category,
        ...(trimmedConversion ? { conversion: trimmedConversion } : {}),
      };

      setUnitRecords((prev) => [...prev, newUnit]);
      setShowCreatePanel(false);
      setCreateForm(createDefaultForm());
      setCreateSuccess(`已新增 ${normalizedCode} · ${trimmedName}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create unit", error);
      setCreateError("新增單位時發生錯誤，請稍後再試。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleReset = () => {
    setFormState(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const openCreatePanel = () => {
    setCreateError(null);
    setShowCreatePanel(true);
  };

  const closeCreatePanel = () => {
    setShowCreatePanel(false);
    setCreateForm(createDefaultForm());
    setCreateError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(formState);
  };

  return (
    <div className="space-y-6">
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Create</p>
                <h2 className="text-xl font-semibold text-slate-900">新增計量單位</h2>
              </div>
              <button
                onClick={closeCreatePanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleCreateUnit} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                單位代碼
                <input
                  type="text"
                  value={createForm.code}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  maxLength={8}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm uppercase focus:border-teal-500 focus:outline-none"
                  placeholder="例如：EA / KG / L"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                單位名稱
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：台 / 公斤 / 公升"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                類別
                <select
                  value={createForm.category}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      category: event.target.value as Unit["category"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {selectableCategories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                基準換算（選填）
                <textarea
                  value={createForm.conversion}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, conversion: event.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例：1 kg = 1000 g"
                />
              </label>
              {createError && (
                <p className="text-sm font-semibold text-red-600">{createError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreatePanel}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isCreating ? "建立中…" : "建立單位"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <button
              onClick={openCreatePanel}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增單位
            </button>
          </div>
        </div>

        {createSuccess && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {createSuccess}
          </p>
        )}
        {loadError && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            {loadError}
          </p>
        )}

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
            {isLoading
              ? "載入中…"
              : `已篩選 ${filteredUnits.length} 個單位（共 ${unitRecords.length} 個）`}
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

