"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import { issueSequence } from "@/lib/sequenceManager";
import { usePermission } from "@/hooks/usePermission";
import {
  DEPARTMENT_DEFINITIONS,
  type DepartmentId,
} from "@/types/auth";
import type { Employee, EmployeeStatus } from "@/types/master";
import type { FileRecordWithURL } from "@/types/fileCenter";
import { uploadFilesForEntity } from "@/lib/fileCenterService";

type FilterState = {
  keyword: string;
  department: "all" | DepartmentId;
  status: "all" | EmployeeStatus;
};

type EmployeeForm = {
  code: string;
  name: string;
  departments: DepartmentId[];
  title: string;
  status: EmployeeStatus;
  email: string;
  phone: string;
  hireDate: string;
  leaveDate: string;
  note: string;
};

const departmentOptions = Object.entries(DEPARTMENT_DEFINITIONS).map(
  ([key, meta]) => ({
    label: meta.label,
    value: key as DepartmentId,
  }),
);

const statusOptions: Array<{ label: string; value: EmployeeStatus }> = [
  { label: "在職", value: "active" },
  { label: "留停", value: "on-leave" },
  { label: "離職", value: "inactive" },
];

const defaultFilters: FilterState = {
  keyword: "",
  department: "all",
  status: "all",
};

const defaultFormState = (): EmployeeForm => ({
  code: "",
  name: "",
  departments: [],
  title: "",
  status: "active",
  email: "",
  phone: "",
  hireDate: "",
  leaveDate: "",
  note: "",
});

const formatDisplayDate = (value?: string) => {
  if (!value) return "—";
  return value.replace(/-/g, "/");
};

const mapTimestampToInput = (value?: Timestamp | null) => {
  if (!value?.toDate) return "";
  const date = value.toDate();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getInitials = (value: string) => {
  if (!value) return "EMP";
  const cleaned = value.replace(/\s+/g, "");
  return cleaned.slice(0, 2).toUpperCase();
};

export function EmployeeDirectory() {
  const { can } = usePermission();
  const canView = can("employees", "view");
  const canCreate = can("employees", "create");
  const canUpdate = can("employees", "update");
  const canViewFiles = can("files", "view");
  const canCreateFiles = can("files", "create");
  const canUpdateFiles = can("files", "update");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showPanel, setShowPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<EmployeeForm>(() => defaultFormState());
  const [useManualCode, setUseManualCode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<FileRecordWithURL | null>(null);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [editAvatar, setEditAvatar] = useState<FileRecordWithURL | null>(null);
  const [filesRefreshToken, setFilesRefreshToken] = useState(0);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarForm, setAvatarForm] = useState({
    title: "",
    isPrimary: true,
  });
  const [avatarFiles, setAvatarFiles] = useState<FileList | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRecordWithURL | null>(null);

  const loadAvatarForCode = useCallback(async (code: string) => {
    const snapshot = await getDocs(
      query(
        collection(db, "files"),
        where("targetModule", "==", "employees"),
        where("entityId", "==", code),
      ),
    );
    const items: FileRecordWithURL[] = [];
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      if (data.deletedAt) continue;
      const mimeType =
        typeof data.mimeType === "string" ? data.mimeType : "application/octet-stream";
      if (!mimeType.startsWith("image/")) continue;
      const record: FileRecordWithURL = {
        id: docSnapshot.id,
        targetModule: "employees",
        entityId: data.entityId ?? code,
        storagePath: data.storagePath ?? "",
        fileName: data.fileName ?? docSnapshot.id,
        mimeType,
        size: typeof data.size === "number" ? data.size : undefined,
        title: data.title ?? undefined,
        description: data.description ?? undefined,
        tags: Array.isArray(data.tags) ? data.tags : [],
        isPrimary: data.isPrimary === true,
        orderIndex: typeof data.orderIndex === "number" ? data.orderIndex : undefined,
        createdAt: data.createdAt,
        createdByUid: data.createdByUid ?? undefined,
        createdByName: data.createdByName ?? undefined,
        deletedAt: data.deletedAt,
      };
      if (record.storagePath) {
        try {
          record.downloadURL = await getDownloadURL(storageRef(storage, record.storagePath));
        } catch {
          // ignore download failure, keep record without URL
        }
      }
      items.push(record);
    }

    items.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const aOrder = a.orderIndex ?? a.createdAt?.toDate().getTime() ?? 0;
      const bOrder = b.orderIndex ?? b.createdAt?.toDate().getTime() ?? 0;
      return bOrder - aOrder;
    });

    return items[0] ?? null;
  }, []);

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!canView) return;
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const loaded: Employee[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            code: data.code ?? docSnapshot.id,
            name: data.name ?? "",
            departments: Array.isArray(data.departments) ? data.departments : [],
            title: data.title ?? "",
            status: (data.status as EmployeeStatus) ?? "active",
            email: data.email ?? "",
            phone: data.phone ?? "",
            note: data.note ?? "",
            hireDate: mapTimestampToInput(data.hireDate),
            leaveDate: mapTimestampToInput(data.leaveDate),
          };
        });
        setEmployees(loaded);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load employees", error);
        setLoadError("讀取員工資料失敗，請稍後再試。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, [canView]);

  useEffect(() => {
    if (showPanel || viewingEmployee) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    return undefined;
  }, [showPanel, viewingEmployee]);

  useEffect(() => {
    if (!viewingEmployee) {
      setAvatarPreview(null);
      return;
    }
    let isMounted = true;
    setIsAvatarLoading(true);
    loadAvatarForCode(viewingEmployee.code)
      .then((record) => {
        if (isMounted) {
          setAvatarPreview(record);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAvatarLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [viewingEmployee, loadAvatarForCode, filesRefreshToken]);

  useEffect(() => {
    if (!showPanel || !editingCode) {
      setEditAvatar(null);
      return;
    }
    let isMounted = true;
    loadAvatarForCode(editingCode)
      .then((record) => {
        if (isMounted) {
          setEditAvatar(record);
        }
      })
      // ignore errors silently
      .finally(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [showPanel, editingCode, loadAvatarForCode, filesRefreshToken]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const haystack = [employee.code, employee.name, employee.title, employee.email, employee.phone]
        .join(" ")
        .toLowerCase();
      const keywordMatch = appliedFilters.keyword
        ? haystack.includes(appliedFilters.keyword.toLowerCase())
        : true;

      const departmentMatch =
        appliedFilters.department === "all"
          ? true
          : employee.departments.includes(appliedFilters.department);

      const statusMatch =
        appliedFilters.status === "all" ? true : employee.status === appliedFilters.status;

      return keywordMatch && departmentMatch && statusMatch;
    });
  }, [appliedFilters, employees]);

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleFilterReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handleFormChange = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleManualCode = async (checked: boolean) => {
    setUseManualCode(checked);
    setFormState((prev) => ({
      ...prev,
      code: checked ? "JFS0000" : "",
    }));
  };

  const handleOpenCreate = () => {
    setEditingCode(null);
    setUseManualCode(false);
    setFormState(defaultFormState());
    setFormError(null);
    setShowPanel(true);
  };

  const handleOpenEdit = (employee: Employee) => {
    setEditingCode(employee.code);
    setUseManualCode(true);
    setFormState({
      code: employee.code,
      name: employee.name,
      departments: employee.departments,
      title: employee.title ?? "",
      status: employee.status,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      hireDate: employee.hireDate ?? "",
      leaveDate: employee.leaveDate ?? "",
      note: employee.note ?? "",
    });
    setFormError(null);
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditingCode(null);
    setFormState(defaultFormState());
    setFormError(null);
    setUseManualCode(false);
  };

  const handleOpenView = (employee: Employee) => {
    setViewingEmployee(employee);
  };

  const closeViewPanel = () => {
    setViewingEmployee(null);
  };

  const handleDepartmentToggle = (dept: DepartmentId) => {
    setFormState((prev) => {
      const exists = prev.departments.includes(dept);
      return {
        ...prev,
        departments: exists
          ? prev.departments.filter((item) => item !== dept)
          : [...prev.departments, dept],
      };
    });
  };

  const handleOpenAvatarModal = () => {
    if (!editingCode) return;
    setAvatarForm({
      title: formState.name ? `${formState.name} 大頭照` : `${editingCode} 大頭照`,
      isPrimary: true,
    });
    setAvatarFiles(null);
    setAvatarError(null);
    setAvatarSuccess(null);
    setShowAvatarModal(true);
  };

  const handleCloseAvatarModal = () => {
    setShowAvatarModal(false);
    setAvatarFiles(null);
    setAvatarError(null);
    setAvatarSuccess(null);
  };

  const handleAvatarUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCode) return;

    const selected = avatarFiles ? Array.from(avatarFiles).slice(0, 1) : [];
    if (selected.length === 0) {
      setAvatarError("請選擇一張圖片");
      return;
    }

    setIsAvatarUploading(true);
    setAvatarError(null);
    setAvatarSuccess(null);
    try {
      await uploadFilesForEntity({
        module: "employees",
        entityId: editingCode,
        files: selected,
        metadata: {
          title: avatarForm.title.trim() || undefined,
          tags: ["avatar"],
          setPrimary: avatarForm.isPrimary,
        },
        createdBy: {
          uid: auth.currentUser?.uid ?? null,
          name: auth.currentUser?.email ?? auth.currentUser?.displayName ?? "system",
        },
      });
      setAvatarSuccess("已上傳照片");
      setAvatarFiles(null);
      setFilesRefreshToken((prev) => prev + 1);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to upload avatar", error);
      setAvatarError("上傳失敗，請稍後再試。");
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate && !canUpdate) return;
    if (isSaving) return;

    const autoGenerateCode = !editingCode && !useManualCode;
    let trimmedCode = formState.code.trim().toUpperCase();
    const trimmedName = formState.name.trim();

    if (!trimmedName) {
      setFormError("請輸入姓名");
      return;
    }
    if (!formState.departments.length) {
      setFormError("至少勾選一個部門");
      return;
    }

    if (autoGenerateCode) {
      try {
        const seq = await issueSequence("EMPLOYEE");
        trimmedCode = seq.value;
        setFormState((prev) => ({ ...prev, code: seq.value }));
      } catch {
        setFormError("取得員工編號時發生問題，請稍後再試。");
        return;
      }
    }

    if (!trimmedCode) {
      setFormError("請輸入員工編號");
      return;
    }

    const hireDateValue = formState.hireDate ? Timestamp.fromDate(new Date(formState.hireDate)) : null;
    const leaveDateValue = formState.leaveDate ? Timestamp.fromDate(new Date(formState.leaveDate)) : null;

    setIsSaving(true);
    setFormError(null);
    try {
      await setDoc(
        doc(db, "employees", trimmedCode),
        {
          code: trimmedCode,
          name: trimmedName,
          departments: formState.departments,
          title: formState.title.trim() || null,
          status: formState.status,
          email: formState.email.trim() || null,
          phone: formState.phone.trim() || null,
          note: formState.note.trim() || null,
          hireDate: hireDateValue,
          leaveDate: leaveDateValue,
          updatedAt: serverTimestamp(),
          ...(editingCode ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
      );

      setEmployees((prev) => {
        const next = prev.filter((employee) => employee.code !== trimmedCode);
        next.push({
          code: trimmedCode,
          name: trimmedName,
          departments: formState.departments,
          title: formState.title.trim() || undefined,
          status: formState.status,
          email: formState.email.trim() || undefined,
          phone: formState.phone.trim() || undefined,
          note: formState.note.trim() || undefined,
          hireDate: formState.hireDate || undefined,
          leaveDate: formState.leaveDate || undefined,
        });
        return next;
      });

      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save employee", error);
      setFormError("儲存員工資料時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        目前帳號尚未獲得「員工主檔」權限，請聯絡系統管理員。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                  {editingCode ? "Edit" : "Create"}
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingCode ? `編輯員工 ${formState.code}` : "新增員工"}
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
                員工編號
                <input
                  type="text"
                  value={formState.code}
                  readOnly={Boolean(editingCode) || !useManualCode}
                  onChange={(event) => handleFormChange("code", event.target.value.toUpperCase())}
                  className={`mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none ${
                    editingCode || !useManualCode ? "bg-slate-100" : ""
                  }`}
                />
              </label>
              {!editingCode && (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={useManualCode}
                    onChange={(event) => handleToggleManualCode(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  手動輸入既有編號
                </label>
              )}
              <label className="block text-sm font-semibold text-slate-600">
                姓名
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                職稱
                <input
                  type="text"
                  value={formState.title}
                  onChange={(event) => handleFormChange("title", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  Email
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(event) => handleFormChange("email", event.target.value)}
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
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  入職日期
                  <input
                    type="date"
                    value={formState.hireDate}
                    onChange={(event) => handleFormChange("hireDate", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  離職日期（選填）
                  <input
                    type="date"
                    value={formState.leaveDate}
                    onChange={(event) => handleFormChange("leaveDate", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                狀態
                <select
                  value={formState.status}
                  onChange={(event) =>
                    handleFormChange("status", event.target.value as EmployeeStatus)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-xs font-semibold text-slate-600">部門</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {departmentOptions.map((dept) => {
                    const checked = formState.departments.includes(dept.value);
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
              {editingCode ? (
                <section className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        照片 / 檔案
                      </p>
                      <p className="text-xs text-slate-500">檔案儲存在檔案中心 · 員工模組</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canCreateFiles && (
                        <button
                          type="button"
                          onClick={handleOpenAvatarModal}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-600"
                        >
                          上傳大頭照
                        </button>
                      )}
                      {canViewFiles && (
                        <Link
                          href={`/master/files?module=employees&entityId=${encodeURIComponent(editingCode)}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-600"
                        >
                          開啟檔案中心
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (editAvatar?.downloadURL) {
                          setPreviewFile(editAvatar);
                        }
                      }}
                      className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      {editAvatar?.downloadURL ? (
                        <img
                          src={editAvatar.downloadURL}
                          alt={editAvatar.fileName}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">
                          {getInitials(formState.name || editingCode)}
                        </div>
                      )}
                    </button>
                    <div className="text-xs text-slate-500">
                      {editAvatar ? (
                        <>
                          <p className="font-semibold text-slate-700">
                            {editAvatar.title ?? editAvatar.fileName}
                          </p>
                          <p>{editAvatar.mimeType}</p>
                        </>
                      ) : (
                        <p>尚未上傳大頭照</p>
                      )}
                    </div>
                  </div>
                  {!canCreateFiles && (
                    <p className="mt-3 text-xs text-slate-400">目前帳號沒有檔案上傳權限。</p>
                  )}
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                  儲存後即可上傳照片（需先建立員工編號）
                </section>
              )}
              <label className="block text-sm font-semibold text-slate-600">
                備註
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="證照、備註或特殊資格"
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
                  {isSaving ? "儲存中…" : editingCode ? "更新資料" : "建立員工"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingEmployee && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Profile</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {viewingEmployee.name} · {viewingEmployee.code}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (avatarPreview?.downloadURL) {
                        setPreviewFile(avatarPreview);
                      }
                    }}
                    className="group relative h-24 w-24 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50"
                  >
                    {isAvatarLoading ? (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        載入中…
                      </div>
                    ) : avatarPreview?.downloadURL ? (
                      <img
                        src={avatarPreview.downloadURL}
                        alt={avatarPreview.fileName}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">
                        {getInitials(viewingEmployee.name || viewingEmployee.code)}
                      </div>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    {avatarPreview ? avatarPreview.title ?? avatarPreview.fileName : "尚未上傳照片"}
                  </p>
                </div>
                <button
                  onClick={closeViewPanel}
                  className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
                >
                  關閉
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  基本資料
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">職稱</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingEmployee.title || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">狀態</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        viewingEmployee.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : viewingEmployee.status === "on-leave"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {
                        statusOptions.find((item) => item.value === viewingEmployee.status)?.label ??
                        viewingEmployee.status
                      }
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">部門</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingEmployee.departments
                        .map((dept) => DEPARTMENT_DEFINITIONS[dept]?.label ?? dept)
                        .join(" / ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">入職日期</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDisplayDate(viewingEmployee.hireDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">離職日期</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDisplayDate(viewingEmployee.leaveDate)}
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  聯絡資訊
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Email</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingEmployee.email || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">電話</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {viewingEmployee.phone || "—"}
                    </p>
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  備註
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {viewingEmployee.note?.trim() || "—"}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Preview</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {previewFile.title ?? previewFile.fileName}
                </h2>
                <p className="text-xs text-slate-500">{previewFile.mimeType}</p>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              {previewFile.downloadURL ? (
                <img
                  src={previewFile.downloadURL}
                  alt={previewFile.fileName}
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  無法預覽此檔案
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAvatarModal && editingCode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Upload</p>
                <h2 className="text-xl font-semibold text-slate-900">上傳大頭照</h2>
                <p className="text-sm text-slate-500">完成後會自動儲存到檔案中心 · 員工模組</p>
              </div>
              <button
                onClick={handleCloseAvatarModal}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleAvatarUploadSubmit} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                主檔編號
                <input
                  type="text"
                  value={editingCode}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                照片標題
                <input
                  type="text"
                  value={avatarForm.title}
                  onChange={(event) =>
                    setAvatarForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={avatarForm.isPrimary}
                  onChange={(event) =>
                    setAvatarForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                設為主照片
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                選擇圖片
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setAvatarFiles(event.target.files)}
                  className="mt-1 w-full text-sm"
                />
                <p className="text-xs text-slate-400">建議 2MB 以下、JPG / PNG</p>
              </label>
              {avatarError && <p className="text-sm font-semibold text-red-600">{avatarError}</p>}
              {avatarSuccess && (
                <p className="text-sm font-semibold text-emerald-600">{avatarSuccess}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseAvatarModal}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isAvatarUploading}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {isAvatarUploading ? "上傳中…" : "開始上傳"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Employees</p>
            <h1 className="text-2xl font-semibold text-slate-900">員工主檔</h1>
            <p className="text-sm text-slate-500">統一的人事編號與部門資料，支援後續工時與排班模組。</p>
          </div>
          {canCreate && (
            <button
              onClick={handleOpenCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              新增員工
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
              placeholder="姓名 / 編號 / 職稱 / Email"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label>
            <p className="text-xs font-semibold text-slate-600">部門</p>
            <select
              value={filters.department}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  department: event.target.value as FilterState["department"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="all">全部部門</option>
              {departmentOptions.map((dept) => (
                <option key={dept.value} value={dept.value}>
                  {dept.label}
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
              : `已篩選 ${filteredEmployees.length} 位員工（共 ${employees.length} 位）`}
          </p>
        </div>
        {loadError && <p className="mt-3 text-xs font-semibold text-red-600">{loadError}</p>}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["編號", "姓名 / 職稱", "部門", "狀態", "入職日", "操作"].map((header) => (
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
              {filteredEmployees.map((employee) => (
                <tr key={employee.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {employee.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{employee.name}</div>
                    <div className="text-xs text-slate-500">{employee.title || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {employee.departments
                      .map((dept) => DEPARTMENT_DEFINITIONS[dept]?.label ?? dept)
                      .join(" / ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        employee.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : employee.status === "on-leave"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {
                        statusOptions.find((status) => status.value === employee.status)?.label ??
                        employee.status
                      }
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDisplayDate(employee.hireDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenView(employee)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        檢視
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(employee)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          編輯
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredEmployees.length && !isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    尚無符合條件的員工資料
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


