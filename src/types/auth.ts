export const ROLE_DEFINITIONS = {
  admin: {
    label: "Admin",
    description: "序號調整、審核、最高權限",
    hierarchy: 4,
  },
  manager: {
    label: "Manager",
    description: "日常維運與審核啟動",
    hierarchy: 3,
  },
  planner: {
    label: "Planner",
    description: "草稿建立、流程規劃",
    hierarchy: 2,
  },
  operator: {
    label: "Operator",
    description: "查詢與執行現場作業",
    hierarchy: 1,
  },
} as const;

export const DEPARTMENT_DEFINITIONS = {
  executive: { label: "經營", description: "決策／策略" },
  rd: { label: "研發", description: "產品與設計" },
  production: { label: "生產", description: "製造與現場" },
  sales: { label: "營銷", description: "業務與客服" },
  management: { label: "管理", description: "行政／管理" },
  finance: { label: "財務", description: "財會／稽核" },
} as const;

export type RoleId = keyof typeof ROLE_DEFINITIONS;
export type DepartmentId = keyof typeof DEPARTMENT_DEFINITIONS;

export type UserRoleAssignment = {
  role: RoleId;
  departments: DepartmentId[];
  isPrimary?: boolean;
};

export type PermissionModule =
  | "users"
  | "employees"
  | "units"
  | "suppliers"
  | "customers"
  | "parts"
  | "products"
  | "categories"
  | "materials"
  | "files"
  | "sequences"
  | "quotes"
  | "orders"
  | "inventory"
  | "production";

export type PermissionAction =
  | "view"
  | "create"
  | "update"
  | "disable"
  | "approve"
  | "lock"
  | "sequence-adjust"
  | "cancel";

