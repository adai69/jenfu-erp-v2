"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  QueryConstraint,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
} from "firebase/storage";
import type { PermissionModule } from "@/types/auth";
import { MODULE_DEFINITIONS } from "@/lib/permissionMatrix";
import { db, storage } from "@/lib/firebaseClient";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import type { FileRecordWithURL } from "@/types/fileCenter";
import { clearExistingPrimary, uploadFilesForEntity } from "@/lib/fileCenterService";

type FilterState = {
  module: PermissionModule | "all";
  entityId: string;
  keyword: string;
};

type UploadFormState = {
  module: PermissionModule;
  entityId: string;
  title: string;
  description: string;
  tags: string;
  isPrimary: boolean;
};

type EditFormState = {
  title: string;
  description: string;
  tags: string;
  isPrimary: boolean;
};

const TARGET_MODULE_OPTIONS = Object.entries(MODULE_DEFINITIONS)
  .filter(([key]) => key !== "files")
  .map(([key, meta]) => ({
    value: key as PermissionModule,
    label: meta.label,
  }));

const TARGET_MODULE_VALUE_SET = new Set<PermissionModule>(
  TARGET_MODULE_OPTIONS.map((option) => option.value),
);

const MODULE_FILTER_OPTIONS = [
  { value: "all" as const, label: "全部模組" },
  ...TARGET_MODULE_OPTIONS,
];

const DEFAULT_FILTERS: FilterState = {
  module: "all",
  entityId: "",
  keyword: "",
};

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  module: "materials",
  entityId: "",
  title: "",
  description: "",
  tags: "",
  isPrimary: false,
};

const MAX_FETCH_LIMIT = 100;

const formatTimestamp = (value?: { toDate: () => Date }) => {
  if (!value) return "—";
  const date = value.toDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
};

const parseTags = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

export function FileCenter() {
  const { user, claims } = useAuth();
  const { can } = usePermission();
  const canView = can("files", "view");
  const canCreate = can("files", "create");
  const canUpdate = can("files", "update");
  const canDelete = can("files", "disable");
  const isAdminRole = claims?.roles?.includes("admin");

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [files, setFiles] = useState<FileRecordWithURL[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileRecordWithURL | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: "",
    description: "",
    tags: "",
    isPrimary: false,
  });
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(DEFAULT_UPLOAD_FORM);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const moduleParam = searchParams.get("module");
    const entityParam = searchParams.get("entityId");
    const moduleFromQuery =
      moduleParam && TARGET_MODULE_VALUE_SET.has(moduleParam as PermissionModule)
        ? (moduleParam as PermissionModule)
        : null;
    if (!moduleFromQuery && !entityParam) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      module: moduleFromQuery ?? prev.module,
      entityId: entityParam ?? prev.entityId,
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      module: moduleFromQuery ?? prev.module,
      entityId: entityParam ?? prev.entityId,
    }));
  }, [searchParams]);

  useEffect(() => {
    if (!canView) return;

    let isActive = true;
    const currentSelectedId = selectedFile?.id ?? null;

    const fetchFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const constraints: QueryConstraint[] = [];
        if (appliedFilters.module !== "all") {
          constraints.push(where("targetModule", "==", appliedFilters.module));
        }
        if (appliedFilters.entityId.trim()) {
          constraints.push(where("entityId", "==", appliedFilters.entityId.trim()));
        }
        constraints.push(limit(MAX_FETCH_LIMIT));

        const snapshot = await getDocs(query(collection(db, "files"), ...constraints));
        if (!isActive) return;

        const items: FileRecordWithURL[] = [];
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data();
          if (data.deletedAt) {
            continue;
          }
          const record: FileRecordWithURL = {
            id: docSnapshot.id,
            targetModule: (data.targetModule ?? "materials") as PermissionModule,
            entityId: data.entityId ?? "",
            storagePath: data.storagePath ?? "",
            fileName: data.fileName ?? docSnapshot.id,
            mimeType: data.mimeType ?? "application/octet-stream",
            size: typeof data.size === "number" ? data.size : undefined,
            title: data.title ?? undefined,
            description: data.description ?? undefined,
            tags: Array.isArray(data.tags) ? data.tags : [],
            isPrimary: data.isPrimary === true,
            orderIndex: typeof data.orderIndex === "number" ? data.orderIndex : undefined,
            createdAt: data.createdAt,
            createdByUid: data.createdByUid ?? undefined,
            createdByName: data.createdByName ?? undefined,
            deletedAt: undefined,
          };
          if (record.mimeType.startsWith("image/") && record.storagePath) {
            try {
              record.downloadURL = await getDownloadURL(storageRef(storage, record.storagePath));
            } catch (downloadError) {
              // eslint-disable-next-line no-console
              console.warn("Failed to load file preview", downloadError);
            }
          }
          items.push(record);
        }

        const keyword = appliedFilters.keyword.trim().toLowerCase();
        const filtered = keyword
          ? items.filter((file) =>
              [file.fileName, file.title ?? "", file.description ?? "", file.entityId, file.tags?.join(" ") ?? ""]
                .join(" ")
                .toLowerCase()
                .includes(keyword),
            )
          : items;

        filtered.sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          const aOrder = a.orderIndex ?? a.createdAt?.toDate().getTime() ?? 0;
          const bOrder = b.orderIndex ?? b.createdAt?.toDate().getTime() ?? 0;
          return bOrder - aOrder;
        });

        if (!isActive) return;

        setFiles(filtered);
        if (currentSelectedId) {
          const updated = filtered.find((item) => item.id === currentSelectedId) ?? null;
          setSelectedFile(updated);
        }
      } catch (fetchError) {
        if (!isActive) return;
        // eslint-disable-next-line no-console
        console.error("Failed to load files", fetchError);
        setError("讀取檔案中心資料時發生錯誤，請稍後再試。");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchFiles();

    return () => {
      isActive = false;
    };
  }, [appliedFilters, refreshToken, canView, selectedFile?.id]);

  useEffect(() => {
    if (!selectedFile) return;
    setEditForm({
      title: selectedFile.title ?? "",
      description: selectedFile.description ?? "",
      tags: selectedFile.tags?.join(", ") ?? "",
      isPrimary: Boolean(selectedFile.isPrimary),
    });
    setMetaError(null);
  }, [selectedFile]);

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleFilterReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const openUploadDialog = () => {
    const defaultModule =
      filters.module !== "all" ? filters.module : (DEFAULT_UPLOAD_FORM.module as PermissionModule);
    setUploadForm((prev) => ({
      ...prev,
      module: defaultModule,
      entityId: filters.entityId,
    }));
    setUploadFiles(null);
    setUploadError(null);
    setShowUpload(true);
  };

  const triggerRefresh = () => setRefreshToken((prev) => prev + 1);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) {
      setUploadError("請選擇至少一個檔案");
      return;
    }
    if (!uploadForm.entityId.trim()) {
      setUploadError("請輸入關聯的主檔編號");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const normalizedEntityId = uploadForm.entityId.trim();
      const tags = parseTags(uploadForm.tags);

      await uploadFilesForEntity({
        module: uploadForm.module,
        entityId: normalizedEntityId,
        files: Array.from(uploadFiles),
        metadata: {
          title: uploadForm.title,
          description: uploadForm.description,
          tags,
          setPrimary: uploadForm.isPrimary,
        },
        createdBy: {
          uid: user?.uid ?? null,
          name: user?.email ?? user?.displayName ?? "system",
        },
      });

      setShowUpload(false);
      setUploadFiles(null);
      setUploadForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        tags: "",
        isPrimary: false,
      }));
      setActionMessage("已完成檔案上傳");
      triggerRefresh();
    } catch (uploadErr) {
      // eslint-disable-next-line no-console
      console.error("Failed to upload files", uploadErr);
      setUploadError("上傳失敗，請稍後再試");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedFile || !canUpdate) return;
    setMetaSaving(true);
    setMetaError(null);
    try {
      const tags = parseTags(editForm.tags);
      if (editForm.isPrimary) {
        await clearExistingPrimary(selectedFile.targetModule, selectedFile.entityId, selectedFile.id);
      }
      await updateDoc(doc(db, "files", selectedFile.id), {
        title: editForm.title.trim() || null,
        description: editForm.description.trim() || null,
        tags,
        isPrimary: editForm.isPrimary,
        updatedAt: serverTimestamp(),
      });
      setActionMessage("已更新檔案資訊");
      triggerRefresh();
    } catch (updateError) {
      // eslint-disable-next-line no-console
      console.error("Failed to update file metadata", updateError);
      setMetaError("更新檔案資訊失敗，請稍後再試。");
    } finally {
      setMetaSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile || !canDelete) return;
    const confirmed = window.confirm("確定要刪除這個檔案嗎？此動作無法復原。");
    if (!confirmed) return;

    setDeleteInProgress(true);
    setMetaError(null);
    try {
      await deleteDoc(doc(db, "files", selectedFile.id));
      if (selectedFile.storagePath) {
        await deleteObject(storageRef(storage, selectedFile.storagePath));
      }
      setSelectedFile(null);
      setActionMessage("檔案已刪除");
      triggerRefresh();
    } catch (deleteError) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete file", deleteError);
      setMetaError("刪除失敗，請稍後再試。");
    } finally {
      setDeleteInProgress(false);
    }
  };

  const moduleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(MODULE_DEFINITIONS).forEach(([key, meta]) => map.set(key, meta.label));
    return map;
  }, []);

  if (!canView && !isAdminRole) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        目前帳號尚未獲得「檔案中心」權限，請聯絡系統管理員。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">File Center</p>
            <h1 className="text-2xl font-semibold text-slate-900">檔案中心模組</h1>
            <p className="text-sm text-slate-500">集中管理設計圖、圖紙與關聯附件</p>
          </div>
          {canCreate && (
            <button
              onClick={openUploadDialog}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              上傳檔案
            </button>
          )}
        </div>
        <form onSubmit={handleFilterSubmit} className="mt-6 grid gap-4 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-600">
            模組
            <select
              value={filters.module}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, module: event.target.value as FilterState["module"] }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            >
              {MODULE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-600">
            關聯主檔編號
            <input
              type="text"
              value={filters.entityId}
              onChange={(event) => setFilters((prev) => ({ ...prev, entityId: event.target.value }))}
              placeholder="例如：PM-00001-00001"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <label className="md:col-span-2 text-sm font-semibold text-slate-600">
            關鍵字（檔名 / 標題 / 標籤）
            <input
              type="text"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
              placeholder="輸入關鍵字搜尋"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-end justify-end gap-3 md:col-span-4">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              {isLoading
                ? "資料載入中…"
                : `已載入 ${files.length} 筆檔案（僅顯示最近 ${MAX_FETCH_LIMIT} 筆）`}
            </p>
            {actionMessage && <p className="text-xs text-emerald-600">{actionMessage}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          {canCreate && (
            <button
              onClick={openUploadDialog}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              新增檔案
            </button>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  預覽
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  模組 / 關聯
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  檔案資訊
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  標籤
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  建立資訊
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {file.downloadURL && file.mimeType.startsWith("image/") ? (
                      <img
                        src={file.downloadURL}
                        alt={file.fileName}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                        {file.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {moduleLabelMap.get(file.targetModule) ?? file.targetModule}
                    </p>
                    <p className="text-xs text-slate-500">{file.entityId || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{file.title ?? file.fileName}</p>
                    <p className="text-xs text-slate-500">{file.fileName}</p>
                    <p className="text-xs text-slate-400">
                      {file.mimeType} · {file.size ? `${(file.size / 1024).toFixed(1)} KB` : "大小不明"}
                    </p>
                    {file.isPrimary && (
                      <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        主圖
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {file.tags?.length
                        ? file.tags.map((tag) => (
                            <span
                              key={`${file.id}-${tag}`}
                              className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-600"
                            >
                              {tag}
                            </span>
                          ))
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <p>{file.createdByName ?? file.createdByUid ?? "未知"}</p>
                    <p>{formatTimestamp(file.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedFile(file)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      預覽
                    </button>
                  </td>
                </tr>
              ))}
              {!files.length && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    尚無符合條件的檔案紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Upload</p>
                <h2 className="text-xl font-semibold text-slate-900">上傳檔案</h2>
                <p className="text-sm text-slate-500">指定關聯模組與主檔代碼</p>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                關聯模組
                <select
                  value={uploadForm.module}
                  onChange={(event) =>
                    setUploadForm((prev) => ({ ...prev, module: event.target.value as PermissionModule }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  {TARGET_MODULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                主檔編號
                <input
                  type="text"
                  value={uploadForm.entityId}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, entityId: event.target.value }))}
                  placeholder="例如：PM-00001-00001"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                檔案標題（選填，未填則使用檔名）
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                說明（選填）
                <textarea
                  value={uploadForm.description}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="輸入簡短說明，方便搜尋與辨識"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                標籤（以逗號或空白分隔）
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={uploadForm.isPrimary}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, isPrimary: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                設為此主檔的主圖（僅第一個檔案會套用）
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                選擇檔案
                <input
                  type="file"
                  multiple
                  onChange={(event) => setUploadFiles(event.target.files)}
                  className="mt-1 w-full text-sm"
                />
                <p className="text-xs text-slate-400">支援多檔同時上傳，建議單檔不超過 10MB。</p>
              </label>
              {uploadError && <p className="text-sm font-semibold text-red-600">{uploadError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {uploading ? "上傳中…" : "開始上傳"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Preview</p>
                <h2 className="text-xl font-semibold text-slate-900">{selectedFile.title ?? selectedFile.fileName}</h2>
                <p className="text-sm text-slate-500">
                  {moduleLabelMap.get(selectedFile.targetModule) ?? selectedFile.targetModule} ·{" "}
                  {selectedFile.entityId || "未指定"}
                </p>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-100 p-4">
                {selectedFile.downloadURL && selectedFile.mimeType.startsWith("image/") ? (
                  <img
                    src={selectedFile.downloadURL}
                    alt={selectedFile.fileName}
                    className="max-h-[320px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                    無法預覽此檔案，請使用下載連結檢視。
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <a
                    href={selectedFile.downloadURL}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    下載檔案
                  </a>
                  <span>{selectedFile.fileName}</span>
                  <span>{selectedFile.mimeType}</span>
                  <span>{selectedFile.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "大小不明"}</span>
                  <span>{formatTimestamp(selectedFile.createdAt)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">檔案資訊</p>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">關聯主檔編號</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedFile.entityId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">標籤</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {selectedFile.tags?.length
                        ? selectedFile.tags.map((tag) => (
                            <span
                              key={`${selectedFile.id}-${tag}`}
                              className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-600"
                            >
                              {tag}
                            </span>
                          ))
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">建立資訊</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedFile.createdByName ?? selectedFile.createdByUid ?? "未知"} ·{" "}
                      {formatTimestamp(selectedFile.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              {canUpdate && (
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">編輯資訊</p>
                  <div className="mt-3 space-y-3">
                    <label className="block text-sm font-semibold text-slate-600">
                      標題
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-600">
                      說明
                      <textarea
                        value={editForm.description}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                        rows={3}
                        className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-600">
                      標籤
                      <input
                        type="text"
                        value={editForm.tags}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={editForm.isPrimary}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, isPrimary: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      設為此主檔主圖
                    </label>
                    {metaError && <p className="text-sm font-semibold text-red-600">{metaError}</p>}
                    <div className="flex flex-wrap justify-between gap-3 pt-2">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleteInProgress}
                          className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
                        >
                          {deleteInProgress ? "刪除中…" : "刪除檔案"}
                        </button>
                      )}
                      <div className="ml-auto flex gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedFile(null)}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                        >
                          關閉
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveMetadata}
                          disabled={metaSaving}
                          className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                        >
                          {metaSaving ? "儲存中…" : "儲存變更"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

