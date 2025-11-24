"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { issueSequence } from "@/lib/sequenceManager";
import { ACTION_LABELS, MODULE_DEFINITIONS } from "@/lib/permissionMatrix";
import {
  DEPARTMENT_DEFINITIONS,
  ROLE_DEFINITIONS,
  type DepartmentId,
  type PermissionAction,
  type PermissionModule,
  type RoleId,
} from "@/types/auth";
import type { User } from "@/types/master";
import { usePermission } from "@/hooks/usePermission";
import { auth, db } from "@/lib/firebaseClient";
import { useAuth } from "@/contexts/AuthContext";

type RoleFilterValue = "all" | RoleId;
type StatusFilterValue = "all" | "active" | "inactive";
type PersonaDeptValue = "all" | DepartmentId;

const roleOptions = [
  { label: "全部角色", value: "all" as const },
  ...Object.entries(ROLE_DEFINITIONS).map(([key, meta]) => ({
    label: meta.label,
    value: key as RoleId,
  })),
];

const statusOptions = [
  { label: "全部狀態", value: "all" as const },
  { label: "啟用", value: "active" as const },
  { label: "停用", value: "inactive" as const },
];

const roleSelectOptions = roleOptions.filter((option) => option.value !== "all");

const departmentOptions = Object.entries(DEPARTMENT_DEFINITIONS).map(
  ([key, meta]) => ({
    label: meta.label,
    value: key as DepartmentId,
  }),
);

const moduleOverrideTargets: PermissionModule[] = [
  "suppliers",
  "quotes",
  "orders",
  "inventory",
  "production",
  "sequences",
];

const moduleActionPreset: Partial<Record<PermissionModule, PermissionAction[]>> = {
  suppliers: ["view", "create", "update", "disable", "approve"],
  quotes: ["view", "create", "update", "lock", "approve", "cancel"],
  orders: ["view", "create", "update", "lock", "approve", "cancel"],
  inventory: ["view", "create", "update", "lock"],
  production: ["view", "create", "update", "lock", "approve"],
  sequences: ["view", "lock", "sequence-adjust"],
};

const defaultModuleActions: PermissionAction[] = ["view", "create", "update"];
const DEFAULT_PASSWORD = "12345678";

type FilterState = {
  keyword: string;
  role: RoleFilterValue;
  status: StatusFilterValue;
};

type CreateUserForm = {
  name: string;
  email: string;
  primaryRole: RoleId;
  departments: DepartmentId[];
  status: "active" | "inactive";
  moduleOverrides: Partial<Record<PermissionModule, PermissionAction[]>>;
};

const createDefaultForm = (): CreateUserForm => ({
  name: "",
  email: "",
  primaryRole: roleSelectOptions[0]?.value ?? "manager",
  departments: ["management"],
  status: "active",
  moduleOverrides: {},
});

const defaultFilters: FilterState = {
  keyword: "",
  role: "all",
  status: "all",
};

export function UserDirectory() {
  const { user: authUser } = useAuth();

  const [userRecords, setUserRecords] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(() => createDefaultForm());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (showCreatePanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [showCreatePanel]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const loaded: User[] = snapshot.docs.map((userDoc) => {
          const data = userDoc.data() as any;
          const roles = data.roles ?? [];
          const primaryRole: RoleId =
            data.primaryRole ?? roles.find((assignment: any) => assignment.isPrimary)?.role ?? "manager";
          const departments = data.departments ?? [];
          return {
            id: data.id ?? userDoc.id,
            name: data.name ?? "",
            email: data.email ?? "",
            primaryRole,
            roles,
            departments,
            status: (data.status as "active" | "inactive") ?? "active",
            moduleOverrides: data.overrides,
          };
        });

        setUserRecords(loaded);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load users from Firestore", error);
        setLoadError("讀取雲端使用者資料失敗，請稍後再試。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const sessionUser = useMemo(() => {
    const email = authUser?.email?.toLowerCase();
    if (!email) return undefined;
    return userRecords.find((user) => user.email.toLowerCase() === email);
  }, [authUser, userRecords]);

  const personaAssignments = useMemo(
    () => sessionUser?.roles ?? [],
    [sessionUser],
  );

  const [activePersonaRole, setActivePersonaRole] = useState<RoleId | undefined>();
  const [activePersonaDept, setActivePersonaDept] = useState<PersonaDeptValue>("all");

  useEffect(() => {
    if (personaAssignments.length) {
      setActivePersonaRole((prev) => prev ?? personaAssignments[0]?.role);
      setActivePersonaDept("all");
    } else {
      setActivePersonaRole(undefined);
      setActivePersonaDept("all");
    }
  }, [personaAssignments]);

  const personaDeptOptions = useMemo<PersonaDeptValue[]>(() => {
    if (!activePersonaRole || !personaAssignments.length) return ["all"];
    const deptSet = new Set<DepartmentId>();
    personaAssignments
      .filter((assignment) => assignment.role === activePersonaRole)
      .forEach((assignment) =>
        assignment.departments.forEach((dept) => deptSet.add(dept)),
      );
    return ["all", ...Array.from(deptSet)];
  }, [activePersonaRole, personaAssignments]);

  const effectivePersonaDept: PersonaDeptValue = personaDeptOptions.includes(
    activePersonaDept,
  )
    ? activePersonaDept
    : "all";

  const { profile: personaProfile, can: personaCan } = usePermission({
    assignments: personaAssignments,
    roleFilter: activePersonaRole,
    departmentFilter: effectivePersonaDept === "all" ? undefined : effectivePersonaDept,
  });
  const { can: realCan } = usePermission();

  const personaSummary: Array<[PermissionModule, PermissionAction[]]> = useMemo(() => {
    if (!personaProfile) return [];
    return (Object.entries(personaProfile) as Array<[PermissionModule, PermissionAction[]]>).filter(
      ([, actions]) => actions.length > 0,
    );
  }, [personaProfile]);

  const canCreateUsersReal = realCan("users", "create");

  const filteredUsers = useMemo(() => {
    return userRecords.filter((user) => {
      const departmentText = user.departments
        .map((dept) => DEPARTMENT_DEFINITIONS[dept]?.label ?? dept)
        .join(" ");
      const roleText = user.roles
        .map((assignment) => ROLE_DEFINITIONS[assignment.role].label)
        .join(" ");
      const haystack = [user.name, user.id, user.email, departmentText, roleText]
        .join(" ")
        .toLowerCase();

      const keywordMatch = appliedFilters.keyword
        ? haystack.includes(appliedFilters.keyword.toLowerCase())
        : true;

      const roleMatch =
        appliedFilters.role === "all"
          ? true
          : user.roles.some((assignment) => assignment.role === appliedFilters.role);

      const statusMatch =
        appliedFilters.status === "all" ? true : user.status === appliedFilters.status;

      return keywordMatch && roleMatch && statusMatch;
    });
  }, [appliedFilters, userRecords]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(formState);
  };

  const handleReset = () => {
    setFormState(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handleDepartmentToggle = (dept: DepartmentId) => {
    setCreateForm((prev) => {
      const exists = prev.departments.includes(dept);
      return {
        ...prev,
        departments: exists
          ? prev.departments.filter((item) => item !== dept)
          : [...prev.departments, dept],
      };
    });
  };

  const handleModuleActionToggle = (module: PermissionModule, action: PermissionAction) => {
    setCreateForm((prev) => {
      const current = prev.moduleOverrides[module] ?? [];
      const exists = current.includes(action);
      const updated = exists ? current.filter((item) => item !== action) : [...current, action];
      const nextOverrides = { ...prev.moduleOverrides };
      if (updated.length === 0) {
        delete nextOverrides[module];
      } else {
        nextOverrides[module] = updated;
      }
      return {
        ...prev,
        moduleOverrides: nextOverrides,
      };
    });
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isCreating) return;

    if (!sessionUser || !canCreateUsersReal) {
      setCreateError("目前帳號沒有新增使用者權限");
      return;
    }
    if (!createForm.name.trim()) {
      setCreateError("請輸入姓名");
      return;
    }
    if (!createForm.email.trim()) {
      setCreateError("請輸入 Email");
      return;
    }
    if (!createForm.departments.length) {
      setCreateError("至少勾選一個部門");
      return;
    }

    const normalizedEmail = createForm.email.trim().toLowerCase();
    const duplicated = userRecords.some(
      (user) => user.email.toLowerCase() === normalizedEmail,
    );
    if (duplicated) {
      setCreateError("此 Email 已存在，請勿重複建立相同使用者。");
      return;
    }

    setIsCreating(true);
    setCreateSuccess(null);

    let newId = "";
    try {
      const issued = issueSequence("USER");
      newId = issued.value;
    } catch {
      setIsCreating(false);
      setCreateError("取得序號時發生問題，請稍後再試");
      return;
    }

    const overrideEntries = Object.entries(createForm.moduleOverrides).filter(
      ([, actions]) => actions && actions.length > 0,
    );
    const moduleOverrides = overrideEntries.length
      ? (Object.fromEntries(overrideEntries) as Partial<
          Record<PermissionModule, PermissionAction[]>
        >)
      : undefined;

    const newUser: User = {
      id: newId,
      name: createForm.name.trim(),
      primaryRole: createForm.primaryRole,
      roles: [
        {
          role: createForm.primaryRole,
          departments: createForm.departments,
          isPrimary: true,
        },
      ],
      departments: createForm.departments,
      email: createForm.email.trim(),
      status: createForm.status,
      ...(moduleOverrides ? { moduleOverrides } : {}),
    };

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsCreating(false);
      setCreateError("登入狀態失效，請重新登入後再試。");
      return;
    }

    try {
      const requestPayload: Record<string, unknown> = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        primaryRole: newUser.primaryRole,
        status: newUser.status,
        roles: newUser.roles,
        departments: newUser.departments,
      };
      if (moduleOverrides) {
        requestPayload.overrides = moduleOverrides;
      }

      await addDoc(collection(db, "userProvisioning"), {
        requestedBy: currentUser.email?.toLowerCase() ?? "",
        payload: requestPayload,
        state: "pending",
        createdAt: serverTimestamp(),
      });

      setUserRecords((prev) => [...prev, newUser]);
      setShowCreatePanel(false);
      setCreateForm(createDefaultForm());
      setCreateError(null);
      setCreateSuccess(`已送出建立請求，預設密碼為 ${DEFAULT_PASSWORD}，完成後即可登入。`);
      setFormState(defaultFilters);
      setAppliedFilters(defaultFilters);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enqueue managed user", error);
      setCreateError("寫入建立請求時發生錯誤，請稍後再試。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreatePanel(false);
    setCreateForm(createDefaultForm());
    setCreateError(null);
    setCreateSuccess(null);
  };

  return (
    <>
      {showCreatePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Create</p>
                <h2 className="text-xl font-semibold text-slate-900">新增使用者</h2>
              </div>
              <button
                onClick={handleCancelCreate}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">姓名</span>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  系統會自動建立 Authentication 帳號並同步權限，無須手動處理 UID。
                </p>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="text-xs font-semibold text-slate-600">主要角色</span>
                  <select
                    value={createForm.primaryRole}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        primaryRole: event.target.value as RoleId,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {roleSelectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold text-slate-600">狀態</span>
                  <select
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        status: event.target.value as "active" | "inactive",
                      }))
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
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-600">部門授權</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {departmentOptions.map((dept) => {
                    const checked = createForm.departments.includes(dept.value);
                    return (
                      <label
                        key={dept.value}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleDepartmentToggle(dept.value)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span>{dept.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-600">
                  模組權限覆寫（選填）
                </span>
                <p className="text-[11px] text-slate-400">
                  預設沿用角色矩陣，僅在需額外授權時勾選具體動作。
                </p>
                <div className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1">
                  {moduleOverrideTargets.map((module) => {
                    const availableActions =
                      moduleActionPreset[module] ?? defaultModuleActions;
                    const selected = createForm.moduleOverrides[module] ?? [];
                    return (
                      <div
                        key={module}
                        className="rounded-xl border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-slate-900">
                          <span>{MODULE_DEFINITIONS[module].label}</span>
                          {selected.length > 0 && (
                            <span className="text-xs text-teal-600">
                              {selected.length} 項
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableActions.map((action) => {
                            const checked = selected.includes(action);
                            return (
                              <button
                                type="button"
                                key={`${module}-${action}`}
                                onClick={() => handleModuleActionToggle(module, action)}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                  checked
                                    ? "border-teal-500 bg-teal-50 text-teal-700"
                                    : "border-slate-200 text-slate-500"
                                }`}
                              >
                                {ACTION_LABELS[action]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                儲存後系統將透過序號模組自動產生帳號代碼，並寫入審計軌跡。
              </p>
              {createError && (
                <p className="text-sm font-semibold text-red-600">{createError}</p>
              )}
              {createSuccess && (
                <p className="text-sm font-semibold text-emerald-600">{createSuccess}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isCreating ? "建立中…" : "建立使用者"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-teal-600">Users</p>
              <h1 className="text-2xl font-semibold text-slate-900">組織帳號管理</h1>
              <p className="text-sm text-slate-500">
                與 BOM、庫存模組共用權限，確保操作軌跡可追蹤。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                disabled={!canCreateUsersReal}
              >
                匯入 CSV
              </button>
              <button
                onClick={() => {
                  if (!canCreateUsersReal) return;
                  setCreateError(null);
                  setCreateSuccess(null);
                  setShowCreatePanel(true);
                }}
                disabled={!canCreateUsersReal}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
              >
                新增使用者
              </button>
            </div>
          </div>

          {sessionUser && activePersonaRole && (
            <div className="mt-6 grid gap-4 rounded-2xl border border-slate-100 bg-slate-900/5 p-4 text-sm text-slate-700 md:grid-cols-4">
              <label>
                <p className="text-xs font-semibold text-slate-600">
                  操作視角（目前：{sessionUser.name}）
                </p>
                <select
                  value={activePersonaRole}
                  onChange={(event) => {
                    setActivePersonaRole(event.target.value as RoleId);
                    setActivePersonaDept("all");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {personaAssignments.map((assignment) => (
                    <option
                      key={`${assignment.role}-${assignment.departments.join("-")}`}
                      value={assignment.role}
                    >
                      {ROLE_DEFINITIONS[assignment.role].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <p className="text-xs font-semibold text-slate-600">部門範圍</p>
                <select
                  value={effectivePersonaDept}
                  onChange={(event) =>
                    setActivePersonaDept(event.target.value as PersonaDeptValue)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {personaDeptOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept === "all"
                        ? "全部部門"
                        : DEPARTMENT_DEFINITIONS[dept as DepartmentId]?.label ?? dept}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-slate-600">權限摘要</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {personaSummary.length ? (
                    personaSummary.map(([module, actions]) => (
                      <span
                        key={module}
                        className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {MODULE_DEFINITIONS[module].label}：
                        {actions.map((action) => ACTION_LABELS[action]).join("/")}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">尚未為此視角授權</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {!sessionUser && !isLoading && (
            <p className="mt-4 text-xs text-red-600">
              目前登入帳號尚未在「使用者主檔」建立資料，暫時僅能瀏覽，無法操作權限相關功能。
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
                placeholder="姓名 / 部門 / Email / 員工代碼"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label>
              <p className="text-xs font-semibold text-slate-600">角色</p>
              <select
                value={formState.role}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    role: event.target.value as RoleFilterValue,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <p className="text-xs font-semibold text-slate-600">狀態</p>
              <select
                value={formState.status}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    status: event.target.value as StatusFilterValue,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
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
                : `已篩選 ${filteredUsers.length} 位使用者（共 ${userRecords.length} 位）`}
            </p>
            <div className="ml-auto flex gap-2 text-xs font-semibold">
              {roleOptions
                .filter((role) => role.value !== "all")
                .map((role) => (
                  <span
                    key={role.value}
                    className="rounded-full bg-slate-100 px-3 py-1 text-slate-600"
                  >
                    {role.label}
                  </span>
                ))}
            </div>
          </div>

          {loadError && (
            <p className="mt-3 text-xs font-semibold text-red-600">{loadError}</p>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {["姓名", "角色/部門", "Email", "狀態", "最後登入"].map((header) => (
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
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {user.roles.map((assignment) => (
                          <span
                            key={`${user.id}-${assignment.role}-${assignment.departments.join(
                              "-",
                            )}`}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              assignment.isPrimary
                                ? "bg-teal-50 text-teal-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {ROLE_DEFINITIONS[assignment.role].label}
                            {assignment.departments.length
                              ? ` · ${assignment.departments
                                  .map(
                                    (dept) =>
                                      DEPARTMENT_DEFINITIONS[dept]?.label ?? dept,
                                  )
                                  .join("/")}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {user.status === "active" ? "使用中" : "停用"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      2025/11/18 08:30
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
