import type {
  DepartmentId,
  PermissionAction,
  PermissionModule,
  RoleId,
  UserRoleAssignment,
} from "@/types/auth";

export type User = {
  id: string;
  name: string;
  primaryRole: RoleId;
  roles: UserRoleAssignment[];
  departments: DepartmentId[];
  email: string;
  status: "active" | "inactive";
  moduleOverrides?: Partial<Record<PermissionModule, PermissionAction[]>>;
};

export type Unit = {
  code: string;
  name: string;
  category: "weight" | "length" | "volume" | "count" | "flow" | "temperature";
  conversion?: string;
};

export type Supplier = {
  code: string;
  name: string;
  contact: string;
  phone: string;
  level: "A" | "B" | "C";
  leadTimeDays: number;
  status: "active" | "suspended";
  email?: string;
  address?: string;
  taxId?: string;
  paymentTermCode?: string;
  note?: string;
};

export type PaymentTerm = {
  code: string;
  name: string;
  category: "cash" | "net" | "monthly" | "installment";
  status: "active" | "inactive";
  description?: string;
  netDays?: number;
  monthlyOffset?: number;
  sortOrder?: number;
};

export type Customer = {
  code: string;
  name: string;
  segment: "工業" | "政府" | "外銷";
  country: string;
  owner: string;
  status: "pipeline" | "active" | "on-hold";
};

export type Product = {
  code: string;
  name: string;
  category: string;
  stage: "開發" | "量產" | "停產";
  standardLeadTime: number;
};

export type Part = {
  code: string;
  name: string;
  spec: string;
  unit: string;
  cost: number;
  status: "使用中" | "停用";
};

export type Category = {
  code: string;
  name: string;
  type: "零件" | "原物料" | "配件" | "工具";
};

export type Sequence = {
  key: string;
  prefix: string;
  padding: number;
  nextNumber: number;
  scope: "報價" | "訂單" | "製令" | "序號" | "帳號";
};

export type MaterialCategory = {
  code: string;
  name: string;
  type: "part" | "purchase" | "other";
  description?: string;
  status: "active" | "inactive";
  sortOrder?: number;
};

export type Material = {
  code: string;
  name: string;
  spec?: string;
  type: "PS" | "PM" | "PO";
  categoryCode: string;
  unitCode: string;
  defaultWarehouseCode?: string;
  preferredSupplierCode?: string;
  purchaseLeadTimeDays?: number;
  stdCost?: number;
  currency?: string;
  status: "active" | "inactive";
  isStocked: boolean;
  note?: string;
  baseCode?: string;
  variantNo?: string;
  isVariant?: boolean;
};

export type Warehouse = {
  code: string;
  name: string;
  type: "raw" | "wip" | "fg" | "other";
  status: "active" | "inactive";
  isDefaultReceive?: boolean;
  isDefaultIssue?: boolean;
  sortOrder?: number;
  address?: string;
  note?: string;
};

