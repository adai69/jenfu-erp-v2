"use client";

import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import type { PermissionModule } from "@/types/auth";
import { db, storage } from "@/lib/firebaseClient";

export async function clearExistingPrimary(
  module: PermissionModule,
  entityId: string,
  ignoreId?: string,
) {
  const snapshot = await getDocs(
    query(
      collection(db, "files"),
      where("targetModule", "==", module),
      where("entityId", "==", entityId),
      where("isPrimary", "==", true),
    ),
  );

  const updates = snapshot.docs
    .filter((docSnapshot) => docSnapshot.id !== ignoreId)
    .map((docSnapshot) => updateDoc(docSnapshot.ref, { isPrimary: false }));

  await Promise.all(updates);
}

type UploadFilesOptions = {
  module: PermissionModule;
  entityId: string;
  files: File[];
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
    setPrimary?: boolean;
  };
  createdBy?: {
    uid?: string | null;
    name?: string | null;
  };
};

export async function uploadFilesForEntity({
  module,
  entityId,
  files,
  metadata,
  createdBy,
}: UploadFilesOptions) {
  if (!entityId.trim() || files.length === 0) {
    throw new Error("entityId 和 files 為必填");
  }

  const normalizedEntityId = entityId.trim();
  const normalizedTitle = metadata?.title?.trim();
  const normalizedDescription = metadata?.description?.trim();
  const tags = metadata?.tags?.filter((tag) => tag.trim()) ?? [];

  if (metadata?.setPrimary) {
    await clearExistingPrimary(module, normalizedEntityId);
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const storagePath = `${module}/${normalizedEntityId}/${Date.now()}-${file.name}`;
    await uploadBytes(storageRef(storage, storagePath), file);

    await addDoc(collection(db, "files"), {
      targetModule: module,
      entityId: normalizedEntityId,
      storagePath,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      title: normalizedTitle || file.name,
      description: normalizedDescription || null,
      tags,
      isPrimary: metadata?.setPrimary ? index === 0 : false,
      orderIndex: Date.now() + index,
      createdAt: serverTimestamp(),
      createdByUid: createdBy?.uid ?? null,
      createdByName: createdBy?.name ?? "system",
    });
  }
}

