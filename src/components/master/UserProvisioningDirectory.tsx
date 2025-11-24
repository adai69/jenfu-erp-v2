"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { useAuth } from "@/contexts/AuthContext";

const stateOptions = [
  { label: "全部狀態", value: "all" as const },
  { label: "等待處理", value: "pending" as const },
  { label: "已完成", value: "completed" as const },
  { label: "已拒絕", value: "rejected" as const },
  { label: "失敗", value: "failed" as const },
];

type ProvisionState = (typeof stateOptions)[number]["value"];

type FilterState = {
  keyword: string;
  state: ProvisionState;
};

type ProvisionRecord = {
  id: string;
  code: string;
  name: string;
  email: string;
  primaryRole: string;
  departments: string[];
  status: "active" | "inactive";
  requestedBy: string;
  requestedByUid?: string;
  state: Exclude<ProvisionState, "all">;
  error?: string;
  createdAt?: Date;
  completedAt?: Date;
};

const defaultFilters: FilterState = {
  keyword: "",
  state: "all",
};

const stateChips: Record<
  Exclude<ProvisionState, "all">,
  { label: string; className: string }
> = {
  pending: {
    label: "等待處理",
    className: "bg-slate-100 text-slate-600",
  },
  completed: {
    label: "已建立",
    className: "bg-emerald-50 text-emerald-700",
  },
  rejected: {
    label: "已拒絕",
    className: "bg-red-50 text-red-600",
  },
  failed: {
    label: "失敗",
    className: "bg-amber-50 text-amber-700",
  },
};

const formatDate = (value?: Date) => {
  if (!value) return "—";
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  const hh = String(value.getHours()).padStart(2, "0");
  const min = String(value.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
};

const mapProvisionDoc = (doc: DocumentData, id: string): ProvisionRecord => {
  const payload = doc.payload ?? {};
  const createdAt = doc.createdAt as Timestamp | undefined;
  const completedAt = doc.completedAt as Timestamp | undefined;
  return {
    id,
    code: (payload.id as string) ?? id,
    name: (payload.name as string) ?? "",
    email: (payload.email as string) ?? "",
    primaryRole: (payload.primaryRole as string) ?? "",
    departments: (payload.departments as string[]) ?? [],
    status: (payload.status as "active" | "inactive") ?? "active",
    requestedBy: (doc.requestedBy as string) ?? "未知",
    requestedByUid: doc.requestedByUid as string | undefined,
    state: doc.state as ProvisionRecord["state"],
    error: doc.error as string | undefined,
    createdAt: createdAt?.toDate(),
    completedAt: completedAt?.toDate(),
  };
};

export function UserProvisioningDirectory() {
  const { claims } = useAuth();
  const roles = claims?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const canView = isAdmin;

  const [records, setRecords] = useState<ProvisionRecord[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProvisionRecord | null>(null);

  useEffect(() => {
    if (!canView) return;

    const fetchRecords = async () => {
      setIsLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "userProvisioning"));
        const mapped = snapshot.docs
          .map((docSnapshot) => mapProvisionDoc(docSnapshot.data(), docSnapshot.id))
          .sort((a, b) => {
            const aTime = a.createdAt?.getTime() ?? 0;
            const bTime = b.createdAt?.getTime() ?? 0;
            return bTime - aTime;
          });
        setRecords(mapped);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load user provisioning queue", error);
        setLoadError("讀取帳號佇列資料失敗，請稍後再試。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecords();
  }, [canView]);

  const filteredRecords = useMemo(() => {
    const keyword = appliedFilters.keyword.trim().toLowerCase();
    return records.filter((record) => {
      const keywordMatch = keyword
        ? [
            record.code,
            record.name,
            record.email,
            record.requestedBy,
            record.requestedByUid ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        : true;
      const stateMatch =
        appliedFilters.state === "all" ? true : record.state === appliedFilters.state;
      return keywordMatch && stateMatch;
    });
  }, [appliedFilters, records]);

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        目前帳號沒有檢視帳號佇列的權限。
      </div>
    );
  }

  return (
    <>
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Request</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {selected.name}（{selected.code}）
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-500">新帳號資訊</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selected.name}</p>
                  <p className="text-xs text-slate-500">{selected.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      角色：{selected.primaryRole}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      狀態：{selected.status === "active" ? "啟用" : "停用"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    部門：
                    {selected.departments.length
                      ? selected.departments.join(" / ")
                      : "—"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-500">發起人</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {selected.requestedBy || "未知"}
                  </p>
                  <p className="text-xs text-slate-500">
                    UID：{selected.requestedByUid ?? "—"}
                  </p>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500">建立時間</p>
                    <p className="text-sm text-slate-900">{formatDate(selected.createdAt)}</p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-slate-500">完成時間</p>
                    <p className="text-sm text-slate-900">{formatDate(selected.completedAt)}</p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold text-slate-500">狀態</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      stateChips[selected.state]?.className ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {stateChips[selected.state]?.label ?? selected.state}
                  </span>
                  <span className="text-slate-500">
                    {selected.error ? `原因：${selected.error}` : "無錯誤"}
                  </span>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                USER PROVISIONING
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">帳號建立佇列</h1>
              <p className="text-sm text-slate-500">
                顯示最近送出的帳號建立請求與狀態。
              </p>
            </div>
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
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, keyword: event.target.value }))
                }
                placeholder="帳號代碼 / Email / 發起人"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label>
              <p className="text-xs font-semibold text-slate-600">狀態</p>
              <select
                value={filters.state}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    state: event.target.value as ProvisionState,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {stateOptions.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2 md:justify-end">
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
                : `已篩選 ${filteredRecords.length} 筆請求（共 ${records.length} 筆）`}
            </p>
            {loadError && <p className="text-xs font-semibold text-red-600">{loadError}</p>}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {["帳號代碼", "新帳號資訊", "發起人", "狀態", "錯誤", "建立時間", ""].map(
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
                  <tr key={record.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                      {record.code}
                      <p className="text-xs text-slate-500">{record.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{record.name}</p>
                      <p className="text-xs text-slate-500">{record.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          角色：{record.primaryRole}
                        </span>
                        {record.departments.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                            部門：{record.departments.join(" / ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <p className="font-semibold text-slate-900">
                        {record.requestedBy || "未知"}
                      </p>
                      <p className="text-xs text-slate-500">
                        UID：{record.requestedByUid ?? "—"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          stateChips[record.state]?.className ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {stateChips[record.state]?.label ?? record.state}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {record.error ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {formatDate(record.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(record)}
                        className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                      >
                        檢視
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      沒有符合條件的帳號建立請求。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}


