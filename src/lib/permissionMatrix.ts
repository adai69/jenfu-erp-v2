import type {
  DepartmentId,
  PermissionAction,
  PermissionModule,
  RoleId,
  UserRoleAssignment,
} from "@/types/auth";
import { ROLE_DEFINITIONS } from "@/types/auth";

type PermissionProfile = Record<PermissionModule, PermissionAction[]>;

const MODULE_DEFINITIONS: Record<
  PermissionModule,
  { label: string; description: string }
> = {
  users: { label: "使用者", description: "帳號與權限" },
  employees: { label: "員工", description: "人事資料卡" },
  units: { label: "計量單位", description: "跨模組基本單位" },
  suppliers: { label: "供應商", description: "採購夥伴" },
  customers: { label: "客戶", description: "營銷對象" },
  parts: { label: "零件", description: "料號與成本" },
  products: { label: "產品", description: "BOM 與模組" },
  categories: { label: "類別", description: "物料分類" },
  files: { label: "檔案中心", description: "設計圖 / 圖片 / 附件" },
  sequences: { label: "序號", description: "Prefix / 流水" },
  quotes: { label: "報價", description: "報價單與交期" },
  orders: { label: "訂單", description: "接單與變更" },
  inventory: { label: "庫存", description: "入出庫與盤點" },
  production: { label: "產品/製令", description: "工單與製造履歷" },
  materials: { label: "物料", description: "零件與採購料主檔" },
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "檢視",
  create: "新增",
  update: "編輯",
  disable: "停用",
  approve: "核准",
  lock: "鎖定",
  "sequence-adjust": "調整序號",
  cancel: "作廢",
};

const ROLE_PERMISSION_MATRIX: Record<RoleId, PermissionProfile> = {
  admin: {
    users: ["view", "create", "update", "disable", "approve"],
    employees: ["view", "create", "update", "disable"],
    units: ["view", "create", "update", "disable", "approve"],
    suppliers: ["view", "create", "update", "disable", "approve"],
    customers: ["view", "create", "update", "disable", "approve"],
    parts: ["view", "create", "update", "disable", "approve"],
    products: ["view", "create", "update", "disable", "approve"],
    categories: ["view", "create", "update", "disable", "approve"],
    sequences: ["view", "lock", "sequence-adjust", "approve"],
    quotes: ["view", "create", "update", "approve", "lock", "cancel"],
    orders: ["view", "create", "update", "approve", "lock", "cancel"],
    inventory: ["view", "create", "update", "lock"],
    production: ["view", "create", "update", "approve", "lock"],
    materials: ["view", "create", "update", "disable"],
    files: ["view", "create", "update", "disable"],
  },
  manager: {
    users: ["view", "create", "update", "disable"],
    employees: ["view", "create", "update"],
    units: ["view", "create", "update", "disable"],
    suppliers: ["view", "create", "update"],
    customers: ["view", "create", "update"],
    parts: ["view", "create", "update", "disable"],
    products: ["view", "create", "update"],
    categories: ["view", "create", "update"],
    sequences: ["view", "lock"],
    quotes: ["view", "create", "update", "lock"],
    orders: ["view", "create", "update", "lock"],
    inventory: ["view", "create", "update"],
    production: ["view", "create", "update"],
    materials: ["view", "create", "update"],
    files: ["view", "create", "update"],
  },
  planner: {
    users: ["view"],
    employees: ["view", "create"],
    units: ["view", "create"],
    suppliers: ["view", "create"],
    customers: ["view", "create"],
    parts: ["view", "create"],
    products: ["view", "create"],
    categories: ["view", "create"],
    sequences: ["view"],
    quotes: ["view", "create"],
    orders: ["view", "create"],
    inventory: ["view", "create"],
    production: ["view", "create"],
    materials: ["view", "create"],
    files: ["view", "create"],
  },
  operator: {
    users: ["view"],
    employees: ["view"],
    units: ["view"],
    suppliers: ["view"],
    customers: ["view"],
    parts: ["view"],
    products: ["view"],
    categories: ["view"],
    sequences: ["view"],
    quotes: ["view"],
    orders: ["view"],
    inventory: ["view"],
    production: ["view"],
    materials: ["view"],
    files: ["view"],
  },
};

export type PermissionContextOptions = {
  roleFilter?: RoleId;
  departmentFilter?: DepartmentId;
};

export function buildPermissionProfile(
  assignments: UserRoleAssignment[],
  options?: PermissionContextOptions,
) {
  const profile = initializeEmptyProfile();
  const { roleFilter, departmentFilter } = options ?? {};

  const applicableAssignments = assignments.filter((assignment) => {
    const matchesRole = roleFilter ? assignment.role === roleFilter : true;
    const matchesDepartment =
      departmentFilter && assignment.departments.length
        ? assignment.departments.includes(departmentFilter)
        : true;
    return matchesRole && matchesDepartment;
  });

  if (!applicableAssignments.length) {
    return profile;
  }

  for (const assignment of applicableAssignments) {
    const rolePermissions = ROLE_PERMISSION_MATRIX[assignment.role];
    Object.entries(rolePermissions).forEach(([module, actions]) => {
      const existingActions = new Set(profile[module as PermissionModule]);
      actions.forEach((action) => existingActions.add(action));
      profile[module as PermissionModule] = Array.from(existingActions);
    });
  }

  return profile;
}

export function canPerformAction(
  assignments: UserRoleAssignment[],
  module: PermissionModule,
  action: PermissionAction,
  options?: PermissionContextOptions,
) {
  const profile = buildPermissionProfile(assignments, options);
  return profile[module]?.includes(action) ?? false;
}

export function getHighestRole(assignments: UserRoleAssignment[]): RoleId | null {
  const sorted = [...assignments].sort(
    (a, b) => ROLE_DEFINITIONS[b.role].hierarchy - ROLE_DEFINITIONS[a.role].hierarchy,
  );
  return sorted[0]?.role ?? null;
}

function initializeEmptyProfile(): PermissionProfile {
  return {
    users: [],
    employees: [],
    units: [],
    suppliers: [],
    customers: [],
    parts: [],
    products: [],
    categories: [],
    materials: [],
    files: [],
    sequences: [],
    quotes: [],
    orders: [],
    inventory: [],
    production: [],
  };
}

export { MODULE_DEFINITIONS, ACTION_LABELS, ROLE_PERMISSION_MATRIX };

