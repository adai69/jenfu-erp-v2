"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebaseClient";
import { uploadFilesForEntity } from "@/lib/fileCenterService";
import {
  materialCategories as seedCategories,
  materials as seedMaterials,
  suppliers as seedSuppliers,
  units as seedUnits,
  warehouses as seedWarehouses,
} from "@/data/masterRecords";
import type { Material, MaterialCategory, Supplier, Unit, Warehouse } from "@/types/master";
import type { FileRecordWithURL } from "@/types/fileCenter";
import { issueSequence } from "@/lib/sequenceManager";
import { usePermission } from "@/hooks/usePermission";

type MaterialFilter = {
  keyword: string;
  type: "all" | "PS" | "PM" | "PO";
  category: "all" | string;
  status: "all" | "active" | "inactive";
};

type MaterialForm = {
  code: string;
  name: string;
  spec: string;
  type: "PS" | "PM" | "PO";
  categoryCode: string;
  unitCode: string;
  defaultWarehouseCode: string;
  preferredSupplierCode: string;
  purchaseLeadTimeDays: string;
  stdCost: string;
  currency: string;
  status: "active" | "inactive";
  isStocked: boolean;
  note: string;
  baseCode?: string;
  isVariant?: boolean;
};

const defaultFilters: MaterialFilter = {
  keyword: "",
  type: "all",
  category: "all",
  status: "all",
};

const parseTagInput = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const defaultFormState = (categoryCode?: string, baseCode?: string): MaterialForm => ({
  code: "",
  name: "",
  spec: "",
  type: "PS",
  categoryCode: categoryCode ?? seedCategories[0]?.code ?? "",
  unitCode: seedUnits[0]?.code ?? "",
  defaultWarehouseCode: "",
  preferredSupplierCode: "",
  purchaseLeadTimeDays: "",
  stdCost: "",
  currency: "TWD",
  status: "active",
  isStocked: true,
  note: "",
  baseCode,
  isVariant: Boolean(baseCode),
});

const mapMaterialDoc = (data: DocumentData, id: string): Material => ({
  code: (data.code as string) ?? id,
  name: (data.name as string) ?? "",
  spec: data.spec as string | undefined,
  type: (data.type as Material["type"]) ?? "PS",
  categoryCode: (data.categoryCode as string) ?? "",
  unitCode: (data.unitCode as string) ?? "",
  defaultWarehouseCode: data.defaultWarehouseCode as string | undefined,
  preferredSupplierCode: data.preferredSupplierCode as string | undefined,
  purchaseLeadTimeDays:
    typeof data.purchaseLeadTimeDays === "number" ? data.purchaseLeadTimeDays : undefined,
  stdCost: typeof data.stdCost === "number" ? data.stdCost : undefined,
  currency: data.currency as string | undefined,
  status: (data.status as Material["status"]) ?? "active",
  isStocked: Boolean(data.isStocked),
  note: data.note as string | undefined,
  baseCode: data.baseCode as string | undefined,
  variantNo: data.variantNo as string | undefined,
  isVariant: data.isVariant === true || Boolean(data.variantNo),
});

const typeOptions: Array<{ label: string; value: Material["type"] }> = [
  { label: "標準 (PS)", value: "PS" },
  { label: "訂製 (PM)", value: "PM" },
  { label: "其他 (PO)", value: "PO" },
];

export function MaterialDirectory() {
  const [materials, setMaterials] = useState<Material[]>(seedMaterials);
  const [categories, setCategories] = useState<MaterialCategory[]>(seedCategories);
  const [units, setUnits] = useState<Unit[]>(seedUnits);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(seedWarehouses);
  const [suppliers, setSuppliers] = useState<Supplier[]>(seedSuppliers);
  const [filters, setFilters] = useState<MaterialFilter>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<MaterialFilter>(defaultFilters);
  const [showPanel, setShowPanel] = useState(false);
  const [showViewPanel, setShowViewPanel] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formState, setFormState] = useState<MaterialForm>(() =>
    defaultFormState(seedCategories[0]?.code),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [useManualCode, setUseManualCode] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null);
  const [materialFiles, setMaterialFiles] = useState<FileRecordWithURL[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [filesRefreshToken, setFilesRefreshToken] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [materialUploadForm, setMaterialUploadForm] = useState({
    title: "",
    description: "",
    tags: "",
    isPrimary: false,
  });
  const [materialUploadFiles, setMaterialUploadFiles] = useState<FileList | null>(null);
  const [materialUploadError, setMaterialUploadError] = useState<string | null>(null);
  const [materialUploadSuccess, setMaterialUploadSuccess] = useState<string | null>(null);
  const [isMaterialUploading, setIsMaterialUploading] = useState(false);

  const { can } = usePermission();
  const canRead = can("materials", "view");
  const canCreate = can("materials", "create");
  const canUpdate = can("materials", "update");
  const canViewFiles = can("files", "view");
  const canCreateFiles = can("files", "create");

  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [categorySnap, unitSnap, warehouseSnap, supplierSnap] = await Promise.all([
          getDocs(collection(db, "materialCategories")),
          getDocs(collection(db, "units")),
          getDocs(collection(db, "warehouses")),
          getDocs(collection(db, "suppliers")),
        ]);

        const mappedCategories =
          categorySnap.docs.length > 0
            ? categorySnap.docs.map((docSnapshot) => {
                const data = docSnapshot.data() as MaterialCategory;
                return {
                  ...data,
                  code: data.code ?? docSnapshot.id,
                };
              })
            : seedCategories;
        setCategories(mappedCategories);

        const mappedUnits =
          unitSnap.docs.length > 0
            ? unitSnap.docs.map((docSnapshot) => ({
                ...(docSnapshot.data() as Unit),
              }))
            : seedUnits;
        setUnits(mappedUnits);

        const mappedWarehouses =
          warehouseSnap.docs.length > 0
            ? warehouseSnap.docs.map((docSnapshot) => ({
                ...(docSnapshot.data() as Warehouse),
              }))
            : seedWarehouses;
        setWarehouses(mappedWarehouses);

        const mappedSuppliers =
          supplierSnap.docs.length > 0
            ? supplierSnap.docs.map((docSnapshot) => ({
                ...(docSnapshot.data() as Supplier),
              }))
            : seedSuppliers;
        setSuppliers(mappedSuppliers);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load reference data for materials", error);
      }
    };
    fetchReferenceData();
  }, []);

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const snapshot = await getDocs(collection(db, "materials"));
        const loaded = snapshot.docs.map((docSnapshot) =>
          mapMaterialDoc(docSnapshot.data(), docSnapshot.id),
        );
        if (loaded.length) {
          setMaterials((prev) => {
            const map = new Map(prev.map((item) => [item.code, item]));
            loaded.forEach((item) => map.set(item.code, item));
            return Array.from(map.values());
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load materials", error);
      }
    };
    fetchMaterials();
  }, []);

  useEffect(() => {
    if (!showPanel && !showViewPanel) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [showPanel, showViewPanel]);

  useEffect(() => {
    if (!showViewPanel || !viewingMaterial || !canViewFiles) {
      setMaterialFiles([]);
      return;
    }
    let isMounted = true;
    const loadFiles = async () => {
      setIsLoadingFiles(true);
      try {
        const fileQuery = query(
          collection(db, "files"),
          where("targetModule", "==", "materials"),
          where("entityId", "==", viewingMaterial.code),
        );
        const snapshot = await getDocs(fileQuery);
        const items: FileRecordWithURL[] = [];
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data();
          if (data.deletedAt) continue;
          const mimeType =
            typeof data.mimeType === "string" ? data.mimeType : "application/octet-stream";
          const record: FileRecordWithURL = {
            id: docSnapshot.id,
            targetModule: "materials",
            entityId: data.entityId ?? viewingMaterial.code,
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
            deletedAt: undefined,
          };
          if (record.storagePath && mimeType.startsWith("image/")) {
            try {
              record.downloadURL = await getDownloadURL(storageRef(storage, record.storagePath));
            } catch (imageError) {
              // eslint-disable-next-line no-console
              console.warn("Failed to load material preview", imageError);
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
        if (isMounted) {
          setMaterialFiles(items);
        }
      } catch (filesError) {
        // eslint-disable-next-line no-console
        console.error("Failed to load material files", filesError);
        if (isMounted) {
          setMaterialFiles([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingFiles(false);
        }
      }
    };
    loadFiles();
    return () => {
      isMounted = false;
    };
  }, [showViewPanel, viewingMaterial, canViewFiles, filesRefreshToken]);


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
        appliedFilters.category === "all" ? true : material.categoryCode === appliedFilters.category;
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

  const handleOpenCreate = () => {
    setEditingCode(null);
    setUseManualCode(false);
    setFormError(null);
    setFormState(defaultFormState(categories[0]?.code));
    setShowPanel(true);
    handleGenerateCode("PS");
  };

  const handleOpenVariant = (material: Material) => {
    setEditingCode(null);
    setUseManualCode(false);
    setFormError(null);
    setFormState({
      code: material.code,
      name: `${material.name} 子料`,
      spec: material.spec ?? "",
      type: "PM",
      categoryCode: material.categoryCode,
      unitCode: material.unitCode,
      defaultWarehouseCode: material.defaultWarehouseCode ?? "",
      preferredSupplierCode: material.preferredSupplierCode ?? "",
      purchaseLeadTimeDays:
        material.purchaseLeadTimeDays !== undefined ? material.purchaseLeadTimeDays.toString() : "",
      stdCost: material.stdCost !== undefined ? material.stdCost.toString() : "",
      currency: material.currency ?? "TWD",
      status: "active",
      isStocked: false,
      note: "",
      baseCode: material.baseCode ?? material.code,
      isVariant: true,
    });
    const baseCode = material.baseCode ?? material.code;
    handleGenerateVariantCode(baseCode);
    setShowPanel(true);
  };

  const handleOpenView = (material: Material) => {
    setViewingMaterial(material);
    setShowViewPanel(true);
  };

  const closeViewPanel = () => {
    setShowViewPanel(false);
    setViewingMaterial(null);
    setMaterialFiles([]);
  };

  const handleGenerateVariantCode = async (baseCode: string) => {
    const variants = materials
      .filter((m) => (m.baseCode ?? m.code) === baseCode && m.variantNo)
      .map((m) => Number.parseInt(m.variantNo ?? "0", 10))
      .filter((num) => !Number.isNaN(num));
    const nextNumber = variants.length ? Math.max(...variants) + 1 : 1;
    const variantNo = nextNumber.toString().padStart(5, "0");
    const candidateCode = `${baseCode}-${variantNo}`;

    const existingDoc = materials.find((material) => material.code === candidateCode);
    if (existingDoc) {
      setFormError("生成的子料號已存在，請稍後再試或手動調整。");
      return;
    }

    setFormState((prev) => ({
      ...prev,
      code: candidateCode,
      baseCode,
      isVariant: true,
      variantNo,
    }));
  };

  const handleOpenEdit = (material: Material) => {
    setEditingCode(material.code);
    setUseManualCode(false);
    setFormState({
      code: material.code,
      name: material.name,
      spec: material.spec ?? "",
      type: material.type,
      categoryCode: material.categoryCode,
      unitCode: material.unitCode,
      defaultWarehouseCode: material.defaultWarehouseCode ?? "",
      preferredSupplierCode: material.preferredSupplierCode ?? "",
      purchaseLeadTimeDays:
        material.purchaseLeadTimeDays !== undefined ? material.purchaseLeadTimeDays.toString() : "",
      stdCost: material.stdCost !== undefined ? material.stdCost.toString() : "",
      currency: material.currency ?? "TWD",
      status: material.status,
      isStocked: material.isStocked,
      note: material.note ?? "",
    });
    setFormError(null);
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setFormState(defaultFormState(categories[0]?.code));
    setFormError(null);
    setEditingCode(null);
    setUseManualCode(false);
    setShowUploadModal(false);
    setMaterialUploadFiles(null);
    setMaterialUploadError(null);
    setMaterialUploadSuccess(null);
  };
  const handleOpenMaterialUpload = () => {
    setMaterialUploadForm({
      title: "",
      description: "",
      tags: "",
      isPrimary: false,
    });
    setMaterialUploadFiles(null);
    setMaterialUploadError(null);
    setMaterialUploadSuccess(null);
    setShowUploadModal(true);
  };

  const handleMaterialUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCode) {
      setMaterialUploadError("請先儲存此物料後再上傳檔案。");
      return;
    }
    if (!materialUploadFiles || materialUploadFiles.length === 0) {
      setMaterialUploadError("請選擇至少一個檔案");
      return;
    }

    setIsMaterialUploading(true);
    setMaterialUploadError(null);
    try {
      await uploadFilesForEntity({
        module: "materials",
        entityId: editingCode,
        files: Array.from(materialUploadFiles),
        metadata: {
          title: materialUploadForm.title,
          description: materialUploadForm.description,
          tags: parseTagInput(materialUploadForm.tags),
          setPrimary: materialUploadForm.isPrimary,
        },
        createdBy: {
          uid: auth.currentUser?.uid ?? null,
          name: auth.currentUser?.email ?? auth.currentUser?.displayName ?? "system",
        },
      });
      setMaterialUploadSuccess("已完成檔案上傳");
      setMaterialUploadFiles(null);
      setMaterialUploadForm((prev) => ({ ...prev, isPrimary: false }));
      setFilesRefreshToken((prev) => prev + 1);
    } catch (uploadError) {
      // eslint-disable-next-line no-console
      console.error("Failed to upload material files", uploadError);
      setMaterialUploadError("上傳失敗，請稍後再試。");
    } finally {
      setIsMaterialUploading(false);
    }
  };

  const closeMaterialUploadModal = () => {
    setShowUploadModal(false);
    setMaterialUploadFiles(null);
    setMaterialUploadError(null);
    setMaterialUploadSuccess(null);
  };


  const handleFormChange = <K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerateCode = async (materialType: Material["type"]) => {
    if (editingCode || useManualCode || formState.isVariant) return;
    const sequenceKey =
      materialType === "PS" ? "PART_PS" : materialType === "PM" ? "PART_PM" : "PART_PO";
    try {
      const seq = await issueSequence(sequenceKey);
      setFormState((prev) => ({ ...prev, code: seq.value }));
    } catch {
      setFormError("取得料號時發生問題，請稍後再試。");
    }
  };

  const handleTypeChange = async (nextType: Material["type"]) => {
    setFormState((prev) => ({ ...prev, type: nextType }));
    if (!useManualCode && !editingCode) {
      await handleGenerateCode(nextType);
    }
  };

  const canUseManualCode = !editingCode && formState.type === "PS";

  const handleToggleManualCode = async (checked: boolean) => {
    setUseManualCode(checked);
    if (checked) {
      setFormState((prev) => ({ ...prev, code: "PS-0000A" }));
    } else {
      await handleGenerateCode(formState.type);
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const trimmedName = formState.name.trim();
    const trimmedCode = formState.code.trim();
    if (!trimmedCode) {
      setFormError("料號取得失敗，請重新選擇型態或重新整理頁面。");
      return;
    }
    if (!trimmedName) {
      setFormError("請輸入品名");
      return;
    }
    if (!formState.categoryCode) {
      setFormError("請選擇物料分類");
      return;
    }
    if (!formState.unitCode) {
      setFormError("請選擇計量單位");
      return;
    }
    const leadTime =
      formState.purchaseLeadTimeDays.trim() === ""
        ? undefined
        : Number.parseInt(formState.purchaseLeadTimeDays, 10);
    if (leadTime !== undefined && Number.isNaN(leadTime)) {
      setFormError("採購前置天數需為數字");
      return;
    }
    const stdCost =
      formState.stdCost.trim() === "" ? undefined : Number.parseFloat(formState.stdCost);
    if (stdCost !== undefined && Number.isNaN(stdCost)) {
      setFormError("參考成本需為數字");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      code: trimmedCode,
      name: trimmedName,
      spec: formState.spec.trim(),
      type: formState.type,
      categoryCode: formState.categoryCode,
      unitCode: formState.unitCode,
      defaultWarehouseCode: formState.defaultWarehouseCode || null,
      preferredSupplierCode: formState.preferredSupplierCode || null,
      purchaseLeadTimeDays: leadTime ?? null,
      stdCost: stdCost ?? null,
      currency: formState.currency.trim() || "TWD",
      status: formState.status,
      isStocked: formState.isStocked,
      note: formState.note.trim(),
      baseCode:
        formState.isVariant && formState.baseCode
          ? formState.baseCode
          : formState.isVariant
          ? trimmedCode.split("-")[0]
          : null,
      variantNo:
        formState.isVariant && trimmedCode.includes("-")
          ? trimmedCode.split("-").pop()
          : null,
      isVariant: formState.isVariant ?? false,
      updatedAt: serverTimestamp(),
      ...(editingCode ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      await setDoc(doc(db, "materials", trimmedCode), payload, { merge: true });
      setMaterials((prev) => {
        const next = prev.filter((material) => material.code !== trimmedCode);
        next.push({
          code: trimmedCode,
          name: trimmedName,
          spec: formState.spec.trim() || undefined,
          type: formState.type,
          categoryCode: formState.categoryCode,
          unitCode: formState.unitCode,
          defaultWarehouseCode: formState.defaultWarehouseCode || undefined,
          preferredSupplierCode: formState.preferredSupplierCode || undefined,
          purchaseLeadTimeDays: leadTime,
          stdCost,
          currency: payload.currency,
          status: formState.status,
          isStocked: formState.isStocked,
          note: formState.note.trim() || undefined,
          baseCode: payload.baseCode ?? undefined,
          variantNo: payload.variantNo ?? undefined,
          isVariant: payload.isVariant ?? false,
        });
        return next;
      });
      setFormSuccess(editingCode ? `已更新 ${trimmedCode}` : `已新增 ${trimmedCode}`);
      closePanel();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save material", error);
      setFormError("儲存物料時發生錯誤，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryName = (code: string) =>
    categories.find((category) => category.code === code)?.name ?? code;
  const getUnitName = (code: string) => units.find((unit) => unit.code === code)?.name ?? code;
  const getWarehouseName = (code?: string) =>
    code ? warehouses.find((warehouse) => warehouse.code === code)?.name ?? code : "—";
  const getSupplierName = (code?: string) =>
    code ? suppliers.find((supplier) => supplier.code === code)?.name ?? code : "—";
  const getTypeLabel = (type: Material["type"]) =>
    typeOptions.find((option) => option.value === type)?.label ?? type;
  const primaryMaterialFile = materialFiles.find((file) => file.isPrimary);
  const secondaryMaterialFiles = materialFiles.filter((file) => !file.isPrimary);

  return (
    <div className="space-y-6">
      {showViewPanel && viewingMaterial && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">View</p>
                <h2 className="text-xl font-semibold text-slate-900">檢視物料 {viewingMaterial.code}</h2>
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
                    <p className="mt-1 text-sm font-semibold text-slate-900">{viewingMaterial.code}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">物料型態</p>
                    <p className="mt-1 inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700">
                      {getTypeLabel(viewingMaterial.type)}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">品名</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">{viewingMaterial.name}</p>
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
              {canViewFiles && (
                <section className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        檔案 / 圖片
                      </p>
                      <p className="text-sm text-slate-500">與此料號關聯的附件與照片</p>
                    </div>
                    <Link
                      href={`/master/files?module=materials&entityId=${encodeURIComponent(viewingMaterial.code)}`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-600"
                    >
                      開啟檔案中心
                    </Link>
                  </div>
                  {isLoadingFiles ? (
                    <p className="mt-3 text-sm text-slate-500">檔案載入中…</p>
                  ) : materialFiles.length ? (
                    <div className="mt-4 space-y-4">
                      {primaryMaterialFile && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">主照片</p>
                          {primaryMaterialFile.downloadURL ? (
                            <img
                              src={primaryMaterialFile.downloadURL}
                              alt={primaryMaterialFile.fileName}
                              className="mt-2 max-h-64 w-full rounded-2xl object-contain"
                            />
                          ) : (
                            <div className="mt-2 flex h-48 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
                              無法預覽此檔案
                            </div>
                          )}
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {primaryMaterialFile.title ?? primaryMaterialFile.fileName}
                          </p>
                          <p className="text-xs text-slate-500">{primaryMaterialFile.mimeType}</p>
                        </div>
                      )}
                      {secondaryMaterialFiles.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">其他附件</p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            {secondaryMaterialFiles.map((file) => (
                              <div
                                key={file.id}
                                className="rounded-2xl border border-slate-100 p-3 text-sm text-slate-600"
                              >
                                {file.downloadURL && file.mimeType.startsWith("image/") ? (
                                  <img
                                    src={file.downloadURL}
                                    alt={file.fileName}
                                    className="h-40 w-full rounded-xl object-cover"
                                  />
                                ) : (
                                  <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-500">
                                    無法預覽
                                  </div>
                                )}
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {file.title ?? file.fileName}
                                </p>
                                <p className="text-xs text-slate-500">{file.mimeType}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">尚未上傳任何檔案。</p>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">
                  {editingCode ? "Edit" : "Create"}
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingCode ? `編輯物料 ${formState.code}` : "新增物料"}
                </h2>
              </div>
            <div className="flex items-center gap-2">
              {editingCode && canCreateFiles && (
                <button
                  type="button"
                  onClick={handleOpenMaterialUpload}
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-600"
                >
                  上傳檔案
                </button>
              )}
              <button
                onClick={closePanel}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600">物料型態</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {typeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleTypeChange(option.value)}
                      disabled={Boolean(editingCode)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        formState.type === option.value
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 text-slate-600"
                      } disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                料號
                <input
                  type="text"
                  value={formState.code}
                  onChange={(event) => handleFormChange("code", event.target.value.toUpperCase())}
                  readOnly={Boolean(editingCode) || !useManualCode}
                  className={`mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none ${
                    editingCode || !useManualCode ? "bg-slate-100" : ""
                  }`}
                />
              </label>
              {canUseManualCode && (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={useManualCode}
                    onChange={(event) => handleToggleManualCode(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  使用萬用料號 (PS-0000A 可手動輸入)
                </label>
              )}
              <label className="block text-sm font-semibold text-slate-600">
                品名
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                規格
                <input
                  type="text"
                  value={formState.spec}
                  onChange={(event) => handleFormChange("spec", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  物料分類
                  <select
                    value={formState.categoryCode}
                    onChange={(event) => handleFormChange("categoryCode", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {categories
                      .filter((category) => category.status === "active")
                      .map((category) => (
                        <option key={category.code} value={category.code}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  計量單位
                  <select
                    value={formState.unitCode}
                    onChange={(event) => handleFormChange("unitCode", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {units.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.code} ｜ {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  預設倉庫
                  <select
                    value={formState.defaultWarehouseCode}
                    onChange={(event) => handleFormChange("defaultWarehouseCode", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">（未指定）</option>
                    {warehouses
                      .filter((warehouse) => warehouse.status === "active")
                      .map((warehouse) => (
                        <option key={warehouse.code} value={warehouse.code}>
                          {warehouse.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  首選供應商
                  <select
                    value={formState.preferredSupplierCode}
                    onChange={(event) =>
                      handleFormChange("preferredSupplierCode", event.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">（未指定）</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.code} value={supplier.code}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-sm font-semibold text-slate-600">
                  採購前置天數
                  <input
                    type="number"
                    min={0}
                    value={formState.purchaseLeadTimeDays}
                    onChange={(event) => handleFormChange("purchaseLeadTimeDays", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  參考成本
                  <input
                    type="number"
                    min={0}
                    value={formState.stdCost}
                    onChange={(event) => handleFormChange("stdCost", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-600">
                  幣別
                  <input
                    type="text"
                    value={formState.currency}
                    onChange={(event) => handleFormChange("currency", event.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    placeholder="TWD / USD"
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-600">
                  狀態
                  <select
                    value={formState.status}
                    onChange={(event) =>
                      handleFormChange("status", event.target.value as Material["status"])
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    <option value="active">使用中</option>
                    <option value="inactive">停用</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={formState.isStocked}
                    onChange={(event) => handleFormChange("isStocked", event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  納入庫存管控
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-600">
                備註
                <textarea
                  value={formState.note}
                  onChange={(event) => handleFormChange("note", event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="例如：僅用於某專案、需特殊檢驗..."
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
                  {isSaving ? "儲存中…" : editingCode ? "更新物料" : "建立物料"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showUploadModal && editingCode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Upload</p>
                <h2 className="text-xl font-semibold text-slate-900">為 {editingCode} 上傳檔案</h2>
                <p className="text-sm text-slate-500">檔案會自動歸檔至檔案中心 · 物料模組</p>
              </div>
              <button
                onClick={closeMaterialUploadModal}
                className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                關閉
              </button>
            </div>
            <form onSubmit={handleMaterialUploadSubmit} className="mt-4 space-y-4">
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
                檔案標題（選填）
                <input
                  type="text"
                  value={materialUploadForm.title}
                  onChange={(event) =>
                    setMaterialUploadForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                說明（選填）
                <textarea
                  value={materialUploadForm.description}
                  onChange={(event) =>
                    setMaterialUploadForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="輸入簡短說明以利辨識"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                標籤（以逗號或空白分隔）
                <input
                  type="text"
                  value={materialUploadForm.tags}
                  onChange={(event) =>
                    setMaterialUploadForm((prev) => ({ ...prev, tags: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={materialUploadForm.isPrimary}
                  onChange={(event) =>
                    setMaterialUploadForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                將第一個檔案設為主照片
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                選擇檔案
                <input
                  type="file"
                  multiple
                  onChange={(event) => setMaterialUploadFiles(event.target.files)}
                  className="mt-1 w-full text-sm"
                />
                <p className="text-xs text-slate-400">支援多檔同時上傳，建議單檔不超過 10MB。</p>
              </label>
              {materialUploadError && (
                <p className="text-sm font-semibold text-red-600">{materialUploadError}</p>
              )}
              {materialUploadSuccess && (
                <p className="text-sm font-semibold text-emerald-600">{materialUploadSuccess}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeMaterialUploadModal}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isMaterialUploading}
                  className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {isMaterialUploading ? "上傳中…" : "開始上傳"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">Materials</p>
            <h1 className="text-2xl font-semibold text-slate-900">物料主檔</h1>
            <p className="text-sm text-slate-500">零件與採購料的統一主檔，與 BOM、庫存、報價共用。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              匯入清單
            </button>
            <button
              onClick={handleOpenCreate}
              disabled={!canCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              新增物料
            </button>
          </div>
        </div>
        {formSuccess && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {formSuccess}
          </p>
        )}
      </div>

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
                setFilters((prev) => ({ ...prev, type: event.target.value as MaterialFilter["type"] }))
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
                setFilters((prev) => ({ ...prev, category: event.target.value as MaterialFilter["category"] }))
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
                setFilters((prev) => ({ ...prev, status: event.target.value as MaterialFilter["status"] }))
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-500">
            已篩選 {filteredMaterials.length} 筆物料（共 {materials.length} 筆）
          </p>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["料號", "品名 / 規格", "型態", "分類", "單位", "預設倉庫", "狀態", "操作"].map(
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
              {filteredMaterials.map((material) => (
                <tr key={material.code} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {material.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{material.name}</div>
                    <div className="text-xs text-slate-500">{material.spec || "—"}</div>
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenView(material)}
                        disabled={!canRead}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                      >
                        檢視
                      </button>
                      <button
                        onClick={() => handleOpenEdit(material)}
                        disabled={!canUpdate}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                      >
                        編輯
                      </button>
                      {material.type === "PM" && !material.isVariant && (
                        <button
                          type="button"
                          onClick={() => handleOpenVariant(material)}
                          disabled={!canCreate}
                          className="rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-600 disabled:opacity-40"
                        >
                          建立子料
                        </button>
                      )}
                    </div>
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

