import type { Timestamp } from "firebase/firestore";
import type { PermissionModule } from "@/types/auth";

export type FileRecord = {
  id: string;
  targetModule: PermissionModule;
  entityId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size?: number;
  title?: string;
  description?: string;
  tags?: string[];
  isPrimary?: boolean;
  orderIndex?: number;
  createdAt?: Timestamp;
  createdByUid?: string;
  createdByName?: string;
  deletedAt?: Timestamp;
};

export type FileRecordWithURL = FileRecord & {
  downloadURL?: string;
};

