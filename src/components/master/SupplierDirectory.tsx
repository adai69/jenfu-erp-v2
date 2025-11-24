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
import {
  paymentTerms as seedPaymentTerms,
  suppliers as seedSuppliers,
} from "@/data/masterRecords";
import type { PaymentTerm } from "@/types/master";
import { usePermission } from "@/hooks/usePermission";
import type { Supplier } from "@/types/master";
import { db } from "@/lib/firebaseClient";
import { issueSequence } from "@/lib/sequenceManager";

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

type SupplierFormState = {
  code: string;
  name: string;
  contact: string;
  phone: string;
  level: "A" | "B" | "C";
  leadTimeDays: string;
  status: "active" | "suspended";
  email: string;
  address: string;
  taxId: string;
  paymentTermCode: string;
  note: string;
};

const defaultFormState: SupplierFormState = {
  code: "",
  name: "",
  contact: "",
  phone: "",
  level: "A",
  leadTimeDays: "",
  status: "active",
  email: "",
  address: "",
  taxId: "",
  paymentTermCode: "",
  note: "",
};

const mapSupplierDoc = (data: DocumentData, id: string): Supplier => ({
  code: (data.code as string) ?? id,
  name: (data.name as string) ?? "",
  contact: (data.contact as string) ?? "",
  phone: (data.phone as string) ?? "",
  level: (data.level as Supplier["level"]) ?? "B",
  leadTimeDays: typeof data.leadTimeDays === "number" ? data.leadTimeDays : 0,
  status: (data.status as Supplier["status"]) ?? "active",
  email: data.email as string | undefined,
  address: data.address as string | undefined,
  taxId: data.taxId as string | undefined,
  paymentTermCode: data.paymentTermCode as string | undefined,
  note: data.note as string | undefined,
});

export function SupplierDirectory() {
  const [supplierRecords, setSupplierRecords] = useState<Supplier[]>(seedSuppliers);
  const [paymentTerms, setPaymentTerms] = useState(seedPaymentTerms);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<SupplierFormState>(() => defaultFormState);

  const { can } = usePermission();

  const canCreate = can("suppliers", "create");
  const canUpdate = can("suppliers", "update");

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "suppliers"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapSupplierDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setSupplierRecords((prev) => {
            const map = new Map(prev.map((item) => [item.code.toUpperCase(), item]));
            loaded.forEach((item) => map.set(item.code.toUpperCase(), item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load suppliers", error);
        setLoadError("讀取雲端供應商資料失敗，暫時顯示示範資料。");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const fetchPaymentTerms = async () => {
      try {
        const snapshot = await getDocs(collection(db, "paymentTerms"));
        if (snapshot.docs.length) {
          setPaymentTerms(snapshot.docs.map((docSnapshot) => mapPaymentTerm(docSnapshot.data(), docSnapshot.id)));
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load payment terms", error);
      }
    };
    fetchPaymentTerms();
  }, []);

  const paymentTermMap = useMemo(
    () => new Map(paymentTerms.map((term) => [term.code, term.name])),
    [paymentTerms],
  );

  useEffect(() => {
    if (!showPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showPanel]);

const mapPaymentTerm = (data: DocumentData, id: string): PaymentTerm => ({
  code: id,
  name: (data.name as string) ?? id,
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

const filteredSuppliers = useMemo(() => {
    return supplierRecords.filter((supplier) => {
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
  }, [appliedFilters, supplierRecords]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const closePanel = () => {
    setShowPanel(false);
    setFormState(defaultFormState);
    setFormError(null);
    setEditingCode(null);
  };

  const openCreatePanel = () => {
    setFormSuccess(null);
    setFormError(null);
    setFormState(defaultFormState);
    setEditingCode(null);
    setShowPanel(true);
  };

  const openEditPanel = (supplier: Supplier) => {
    setFormState({
      code: supplier.code,
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      level: supplier.level,
      leadTimeDays: supplier.leadTimeDays.toString(),
      status: supplier.status,
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      taxId: supplier.taxId ?? "",
      paymentTermCode: supplier.paymentTermCode ?? "",
      note: supplier.note ?? "",
    });
    setEditingCode(supplier.code);
    setFormError(null);
    setFormSuccess(null);
    setShowPanel(true);
  };

  const handleFormChange = <K extends keyof SupplierFormState>(
    key: K,
    value: SupplierFormState[K],
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSupplier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const trimmedName = formState.name.trim();
    const trimmedContact = formState.contact.trim();
    const leadTime = formState.leadTimeDays.trim() ? Number(formState.leadTimeDays) : 0;

    if (!trimmedName) {
      setFormError("請輸入供應商名稱");
      return;
    }
    if (!trimmedContact) {
      setFormError("請輸入聯絡人");
      return;
    }
    if (Number.isNaN(leadTime) || leadTime < 0) {
      setFormError("交期天數需為非負整數");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    let supplierCode = formState.code;
    if (!editingCode) {
      try {
        const seq = issueSequence("SUPPLIER");
        supplierCode = seq.value;
      } catch {
        setIsSaving(false);
        setFormError("取得供應商代碼時發生問題，請稍後再試。");
        return;
      }
    }

    const payload = {
      code: supplierCode,
      name: trimmedName,
      contact: trimmedContact,
      phone: formState.phone.trim(),
      level: formState.level,
      leadTimeDays: leadTime,
      status: formState.status,
      email: formState.email.trim(),
      address: formState.address.trim(),
      taxId: formState.taxId.trim(),
      paymentTermCode: formState.paymentTermCode.trim() || null,
      note: formState.note.trim(),
      updatedAt: serverTimestamp(),
      ...(editingCode ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      if (editingCode) {
        await updateDoc(doc(db, "suppliers", supplierCode), payload);
        setSupplierRecords((prev) =>
          prev.map((item) =>
            item.code === supplierCode
              ? {
                  ...item,
                  name: trimmedName,
                  contact: trimmedContact,
                  phone: formState.phone.trim(),
                  level: formState.level,
                  leadTimeDays: leadTime,
                  status: formState.status,
                  email: formState.email.trim() || undefined,
                  address: formState.address.trim() || undefined,
                  taxId: formState.taxId.trim() || undefined,
                  paymentTermCode: formState.paymentTermCode.trim() || undefined,
                  note: formState.note.trim() || undefined,
                }
              : item,
          ),
        );
        setFormSuccess(`已更新 ${supplierCode}`);
      } else {
        await setDoc(doc(db, "suppliers", supplierCode), payload);
        setSupplierRecords((prev) => [
          ...prev,
          {
            code: supplierCode,
            name: trimmedName,
            contact: trimmedContact,
            phone: formState.phone.trim(),
            level: formState.level,
            leadTimeDays: leadTime,
            status: formState.status,
            email: formState.email.trim() || undefined,
            address: formState.address.trim() || undefined,
            taxId: formState.taxId.trim() || undefined,
            paymentTermCode: formState.paymentTermCode.trim() || undefined,
            note: formState.note.trim() || undefined,
          },
        ]);
        setFormSuccess(`已新增 ${supplierCode}`);
      }
      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save supplier", error);
      setFormError("儲存供應商時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
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
                  {editingCode ? `編輯供應商 ${formState.code}` : "新增供應商"}
                </h2>
              </div>
              <button
                onClick={closePanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                供應商代碼
                <input
                  type="text"
                  value={formState.code}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm uppercase focus:outline-none"
                  placeholder="儲存時自動產生"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                供應商名稱
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                聯絡人
                <input
                  type="text"
                  value={formState.contact}
                  onChange={(event) => handleFormChange("contact", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                聯絡電話
                <input
                  type="text"
                  value={formState.phone}
                  onChange={(event) => handleFormChange("phone", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  等級
                  <select
                    value={formState.level}
                    onChange={(event) =>
                      handleFormChange("level", event.target.value as Supplier["level"])
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {["A", "B", "C"].map((level) => (
                      <option key={level} value={level}>
                        Level {level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  交期天數
                  <input
                    type="number"
                    min={0}
                    value={formState.leadTimeDays}
                    onChange={(event) => handleFormChange("leadTimeDays", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    placeholder="例如 12"
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                狀態
                <select
                  value={formState.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as Supplier["status"])
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="active">使用中</option>
                  <option value="suspended">暫停合作</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Email
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => handleFormChange("email", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="contact@supplier.com"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                地址
                <input
                  type="text"
                  value={formState.address}
                  onChange={(event) => handleFormChange("address", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                統一編號
                <input
                  type="text"
                  value={formState.taxId}
                  onChange={(event) => handleFormChange("taxId", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                付款條件
                <select
                  value={formState.paymentTermCode ?? ""}
                  onChange={(event) =>
                    handleFormChange("paymentTermCode", event.target.value || "")
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="">（未指定）</option>
                  {paymentTerms
                    .filter((term) => term.status === "active")
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                    .map((term) => (
                      <option key={term.code} value={term.code}>
                        {term.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                備註
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
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
                  {isSaving ? "儲存中…" : editingCode ? "更新供應商" : "建立供應商"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
              匯入 CSV
            </button>
            <button
              onClick={openCreatePanel}
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
            {isLoading
              ? "載入中…"
              : `已篩選 ${filteredSuppliers.length} 家供應商（共 ${supplierRecords.length} 家）`}
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
                    {supplier.paymentTermCode && (
                      <span className="ml-2 text-xs text-slate-400">
                        {paymentTermMap.get(supplier.paymentTermCode) ?? supplier.paymentTermCode}
                      </span>
                    )}
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
                      onClick={() => openEditPanel(supplier)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
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