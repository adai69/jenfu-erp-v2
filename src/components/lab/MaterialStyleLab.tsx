"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  materialCategories as seedCategories,
  materials as seedMaterials,
  suppliers as seedSuppliers,
  units as seedUnits,
  warehouses as seedWarehouses,
} from "@/data/masterRecords";
import type {
  Material,
  MaterialCategory,
  Supplier,
  Unit,
  Warehouse,
} from "@/types/master";
import { usePermission } from "@/hooks/usePermission";

type MaterialFilter = {
  keyword: string;
  type: "all" | "PS" | "PM" | "PO";
  category: "all" | string;
  status: "all" | "active" | "inactive";
};

const defaultFilters: MaterialFilter = {
  keyword: "",
  type: "all",
  category: "all",
  status: "all",
};

const variantOptions = [
  { label: "桌面微調", value: "table-tuned" },
  { label: "卡片版（手機）", value: "cards" },
  { label: "精簡表格", value: "scroll-table" },
  { label: "查詢優先", value: "search-first" },
] as const;

type Variant = (typeof variantOptions)[number]["value"];

const mapMaterialDoc = (data: DocumentData, id: string): Material => ({
  code: data.code ?? id,
  name: data.name ?? "",
  spec: data.spec,
  type: data.type ?? "PS",
  categoryCode: data.categoryCode ?? "",
  unitCode: data.unitCode ?? "",
  defaultWarehouseCode: data.defaultWarehouseCode,
  preferredSupplierCode: data.preferredSupplierCode,
  purchaseLeadTimeDays: data.purchaseLeadTimeDays,
  stdCost: data.stdCost,
  currency: data.currency,
  status: data.status ?? "active",
  isStocked: Boolean(data.isStocked),
  note: data.note,
  baseCode: data.baseCode,
  variantNo: data.variantNo,
  isVariant:
    data.isVariant === true ||
    Boolean(data.variantNo) ||
    (typeof data.baseCode === "string" && data.baseCode !== (data.code ?? id)),
});

const typeLabelMap: Record<Material["type"], string> = {
  PS: "標準 (PS)",
  PM: "訂製 (PM)",
  PO: "其他 (PO)",
};

const variantDescriptions: Record<Variant, string> = {
  "table-tuned": "維持表格但調整行距／按鈕尺寸，強化手機可讀性。",
  cards: "把每筆資料改成卡片堆疊，針對手機瀏覽優化。",
  "scroll-table": "保留表格心智，改以橫向捲動 + 精簡欄位展示。",
  "search-first": "首屏聚焦搜尋流程，進階篩選以摺疊方式呈現。",
};

export function MaterialStyleLab() {
  const [materials, setMaterials] = useState<Material[]>(seedMaterials);
  const [categories, setCategories] = useState<MaterialCategory[]>(seedCategories);
  const [units, setUnits] = useState<Unit[]>(seedUnits);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(seedWarehouses);
  const [suppliers, setSuppliers] = useState<Supplier[]>(seedSuppliers);
  const [filters, setFilters] = useState<MaterialFilter>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<MaterialFilter>(defaultFilters);
  const [variant, setVariant] = useState<Variant>("table-tuned");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null);
  const [showViewPanel, setShowViewPanel] = useState(false);

  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [categorySnap, unitSnap, warehouseSnap, supplierSnap] = await Promise.all([
          getDocs(collection(db, "materialCategories")),
          getDocs(collection(db, "units")),
          getDocs(collection(db, "warehouses")),
          getDocs(collection(db, "suppliers")),
        ]);

        if (categorySnap.docs.length > 0) {
          setCategories(
            categorySnap.docs.map((docSnapshot) => ({
              ...(docSnapshot.data() as MaterialCategory),
              code: docSnapshot.data().code ?? docSnapshot.id,
            })),
          );
        }
        if (unitSnap.docs.length > 0) {
          setUnits(unitSnap.docs.map((docSnapshot) => docSnapshot.data() as Unit));
        }
        if (warehouseSnap.docs.length > 0) {
          setWarehouses(
            warehouseSnap.docs.map((docSnapshot) => docSnapshot.data() as Warehouse),
          );
        }
        if (supplierSnap.docs.length > 0) {
          setSuppliers(
            supplierSnap.docs.map((docSnapshot) => docSnapshot.data() as Supplier),
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("MaterialStyleLab: failed to load reference data", error);
      }
    };
    fetchReferenceData();
  }, []);

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const snapshot = await getDocs(collection(db, "materials"));
        if (snapshot.docs.length > 0) {
          const loaded = snapshot.docs.map((docSnapshot) =>
            mapMaterialDoc(docSnapshot.data() as Material, docSnapshot.id),
          );
          setMaterials(loaded);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("MaterialStyleLab: failed to load materials", error);
      }
    };
    fetchMaterials();
  }, []);

  useEffect(() => {
    if (!showViewPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showViewPanel]);

  const { can } = usePermission();
  const canRead = can("materials", "view");

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      const keyword = appliedFilters.keyword.trim().toLowerCase();
      const keywordMatch = keyword
        ? [material.code, material.name, material.spec ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const typeMatch =
        appliedFilters.type === "all" ? true : material.type === appliedFilters.type;
      const categoryMatch =
        appliedFilters.category === "all"
          ? true
          : material.categoryCode === appliedFilters.category;
      const statusMatch =
        appliedFilters.status === "all" ? true : material.status === appliedFilters.status;
      return keywordMatch && typeMatch && categoryMatch && statusMatch;
    });
  }, [appliedFilters, materials]);

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleFilterReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const openViewPanel = (material: Material) => {
    setViewingMaterial(material);
    setShowViewPanel(true);
  };

  const closeViewPanel = () => {
    setShowViewPanel(false);
    setViewingMaterial(null);
  };

  const getCategoryName = (code: string) =>
    categories.find((category) => category.code === code)?.name ?? code;
  const getUnitName = (code: string) => units.find((unit) => unit.code === code)?.name ?? code;
  const getWarehouseName = (code?: string) =>
    code ? warehouses.find((warehouse) => warehouse.code === code)?.name ?? code : "—";
  const getSupplierName = (code?: string) =>
    code ? suppliers.find((supplier) => supplier.code === code)?.name ?? code : "—";

  const renderCard = (material: Material) => (
    <div
      key={material.code}
      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          {material.code}
        </p>
        <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
          {material.type}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            material.status === "active"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {material.status === "active" ? "使用中" : "停用"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{material.name}</p>
          <p className="text-xs text-slate-500">{material.spec || "—"}</p>
        </div>
        <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-700">分類：</span>
            {getCategoryName(material.categoryCode)}
          </p>
          <p>
            <span className="font-semibold text-slate-700">單位：</span>
            {getUnitName(material.unitCode)}
          </p>
          <p>
            <span className="font-semibold text-slate-700">預設倉庫：</span>
            {getWarehouseName(material.defaultWarehouseCode)}
          </p>
          <p>
            <span className="font-semibold text-slate-700">供應商：</span>
            {getSupplierName(material.preferredSupplierCode)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => openViewPanel(material)}
        disabled={!canRead}
        className="mt-4 w-full rounded-full bg-slate-900 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
      >
        檢視
      </button>
    </div>
  );

  const renderTableTuned = () => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          已篩選 {filteredMaterials.length} / {materials.length} 筆
        </p>
        <p className="text-xs text-slate-400">行距與按鈕在手機上會放大易讀</p>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm md:text-base">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["料號", "品名 / 規格", "型態", "分類", "單位", "預設倉庫", "狀態", "操作"].map(
                (header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {filteredMaterials.map((material) => (
              <tr key={material.code} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                  {material.code}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{material.name}</p>
                  <p className="text-xs text-slate-500">{material.spec || "—"}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                    {material.type}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {getCategoryName(material.categoryCode)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {getUnitName(material.unitCode)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {getWarehouseName(material.defaultWarehouseCode)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      material.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {material.status === "active" ? "使用中" : "停用"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openViewPanel(material)}
                    disabled={!canRead}
                    className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white disabled:bg-slate-400"
                  >
                    檢視
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderScrollTable = () => (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">精簡欄位表格</p>
          <p className="text-xs text-slate-500">只留關鍵欄位，手機以橫向捲動檢視</p>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="min-w-[640px] divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {["料號", "品名 / 規格", "型態", "狀態", "操作"].map((header) => (
                <th key={header} className="px-4 py-3 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredMaterials.map((material) => (
              <tr key={material.code}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                  {material.code}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{material.name}</p>
                  <p className="text-xs text-slate-500">{material.spec || "—"}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                    {typeLabelMap[material.type]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      material.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {material.status === "active" ? "使用中" : "停用"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openViewPanel(material)}
                    disabled={!canRead}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
                  >
                    檢視
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCards = () => (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
      <p className="text-sm text-slate-500">改成卡片式堆疊，適合手機垂直瀏覽</p>
      <div className="grid gap-4 lg:grid-cols-2">{filteredMaterials.map(renderCard)}</div>
    </div>
  );

  const renderSearchFirst = () => (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <form onSubmit={handleFilterSubmit} className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-600">搜尋關鍵字</p>
            <input
              type="text"
              value={filters.keyword}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, keyword: event.target.value }))
              }
              placeholder="先輸入料號或品名再搜尋"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base focus:border-teal-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm"
          >
            查詢物料
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            className="w-full rounded-full border border-slate-300 py-2 text-sm font-semibold text-slate-600"
          >
            {showAdvancedFilters ? "收合進階篩選" : "顯示進階篩選"}
          </button>
          {showAdvancedFilters && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                物料型態
                <select
                  value={filters.type}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      type: event.target.value as MaterialFilter["type"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">全部型態</option>
                  <option value="PS">標準 (PS)</option>
                  <option value="PM">訂製 (PM)</option>
                  <option value="PO">其他 (PO)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                分類
                <select
                  value={filters.category}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      category: event.target.value as MaterialFilter["category"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">全部分類</option>
                  {categories.map((category) => (
                    <option key={category.code} value={category.code}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                狀態
                <select
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: event.target.value as MaterialFilter["status"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">全部狀態</option>
                  <option value="active">使用中</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleFilterReset}
                  className="w-full rounded-full border border-slate-300 py-2 text-sm font-semibold text-slate-600"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          搜尋結果 {filteredMaterials.length} 筆（只顯示前 20 筆）
        </p>
        <div className="space-y-3">
          {filteredMaterials.slice(0, 20).map((material) => (
            <div
              key={material.code}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    {material.code}
                  </p>
                  <p className="text-base font-semibold text-slate-900">{material.name}</p>
                  <p className="text-xs text-slate-500">{material.spec || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openViewPanel(material)}
                  disabled={!canRead}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
                >
                  檢視
                </button>
              </div>
            </div>
          ))}
          {filteredMaterials.length === 0 && (
            <p className="text-center text-sm text-slate-500">目前沒有符合條件的物料</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderVariantContent = () => {
    switch (variant) {
      case "table-tuned":
        return renderTableTuned();
      case "cards":
        return renderCards();
      case "scroll-table":
        return renderScrollTable();
      case "search-first":
        return renderSearchFirst();
      default:
        return null;
    }
  };

  const renderFilters = () => {
    if (variant === "search-first") {
      return null;
    }
    return (
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
              placeholder="料號 / 品名 / 規格"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">物料型態</p>
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  type: event.target.value as MaterialFilter["type"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="all">全部型態</option>
              <option value="PS">標準 (PS)</option>
              <option value="PM">訂製 (PM)</option>
              <option value="PO">其他 (PO)</option>
            </select>
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">分類</p>
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  category: event.target.value as MaterialFilter["category"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="all">全部分類</option>
              {categories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.name}
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
                  status: event.target.value as MaterialFilter["status"],
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
              套用篩選
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {showViewPanel && viewingMaterial && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">View</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  檢視物料 {viewingMaterial.code}
                </h2>
              </div>
              <button
                onClick={closeViewPanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <div className="mt-6 space-y-6">
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  基本資料
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">料號</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.code}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">物料型態</p>
                    <p className="mt-1 inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700">
                      {typeLabelMap[viewingMaterial.type]}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">品名</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {viewingMaterial.name}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">規格</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {viewingMaterial.spec?.trim() || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">狀態</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        viewingMaterial.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {viewingMaterial.status === "active" ? "使用中" : "停用"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">庫存管控</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.isStocked ? "納入" : "不納入"}
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  分類與供應
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">分類</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {getCategoryName(viewingMaterial.categoryCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">計量單位</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {getUnitName(viewingMaterial.unitCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">預設倉庫</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {getWarehouseName(viewingMaterial.defaultWarehouseCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">首選供應商</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {getSupplierName(viewingMaterial.preferredSupplierCode)}
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  採購資訊
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">採購前置天數</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.purchaseLeadTimeDays ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">參考成本</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.stdCost !== undefined
                        ? `${viewingMaterial.currency ?? "TWD"} ${viewingMaterial.stdCost}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">備註</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {viewingMaterial.note?.trim() || "—"}
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  子料資訊
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">是否為子料</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.isVariant ? "是" : "否"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">母料號</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.baseCode ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">子料編號</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingMaterial.variantNo ?? "—"}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-teal-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Lab</p>
            <h1 className="text-2xl font-semibold text-slate-900">Material Style Lab</h1>
            <p className="text-sm text-slate-500">
              以現有物料主檔資料為基礎，快速切換不同行動版設計提案。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {variantOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setVariant(option.value)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  variant === option.value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 text-slate-600"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{variantDescriptions[variant]}</p>
      </div>

      {variant === "search-first" ? (
        <div>{renderSearchFirst()}</div>
      ) : (
        <>
          {renderFilters()}
          {renderVariantContent()}
        </>
      )}
    </div>
  );
}

