export type RoleId = "admin" | "manager" | "planner" | "operator";
export type DepartmentId =
  | "executive"
  | "rd"
  | "production"
  | "sales"
  | "management"
  | "finance";

export type PermissionModule =
  | "users"
  | "units"
  | "suppliers"
  | "customers"
  | "parts"
  | "products"
  | "categories"
  | "files"
  | "materials"
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

export type UserRoleAssignment = {
  role: RoleId;
  departments: DepartmentId[];
  isPrimary?: boolean;
};

type PermissionProfile = Record<PermissionModule, PermissionAction[]>;

const ROLE_PERMISSION_MATRIX: Record<RoleId, PermissionProfile> = {
  admin: defaultProfile({
    users: ["view", "create", "update", "disable", "approve"],
    units: ["view", "create", "update", "disable", "approve"],
    suppliers: ["view", "create", "update", "disable", "approve"],
    customers: ["view", "create", "update", "disable", "approve"],
    parts: ["view", "create", "update", "disable", "approve"],
    products: ["view", "create", "update", "disable", "approve"],
    categories: ["view", "create", "update", "disable", "approve"],
    files: ["view", "create", "update", "disable"],
    materials: ["view", "create", "update", "disable"],
    sequences: ["view", "lock", "sequence-adjust", "approve"],
    quotes: ["view", "create", "update", "approve", "lock", "cancel"],
    orders: ["view", "create", "update", "approve", "lock", "cancel"],
    inventory: ["view", "create", "update", "lock"],
    production: ["view", "create", "update", "approve", "lock"],
  }),
  manager: defaultProfile({
    users: ["view", "create", "update", "disable"],
    units: ["view", "create", "update", "disable"],
    suppliers: ["view", "create", "update"],
    customers: ["view", "create", "update"],
    parts: ["view", "create", "update", "disable"],
    products: ["view", "create", "update"],
    categories: ["view", "create", "update"],
    files: ["view", "create", "update"],
    materials: ["view", "create", "update"],
    sequences: ["view", "lock"],
    quotes: ["view", "create", "update", "lock"],
    orders: ["view", "create", "update", "lock"],
    inventory: ["view", "create", "update"],
    production: ["view", "create", "update"],
  }),
  planner: defaultProfile({
    users: ["view"],
    units: ["view", "create"],
    suppliers: ["view", "create"],
    customers: ["view", "create"],
    parts: ["view", "create"],
    products: ["view", "create"],
    categories: ["view", "create"],
    files: ["view", "create"],
    materials: ["view", "create"],
    sequences: ["view"],
    quotes: ["view", "create"],
    orders: ["view", "create"],
    inventory: ["view", "create"],
    production: ["view", "create"],
  }),
  operator: defaultProfile({
    users: ["view"],
    units: ["view"],
    suppliers: ["view"],
    customers: ["view"],
    parts: ["view"],
    products: ["view"],
    categories: ["view"],
    files: ["view"],
    materials: ["view"],
    sequences: ["view"],
    quotes: ["view"],
    orders: ["view"],
    inventory: ["view"],
    production: ["view"],
  }),
};

function defaultProfile(overrides: Partial<PermissionProfile>): PermissionProfile {
  const base: PermissionProfile = {
    users: [],
    units: [],
    suppliers: [],
    customers: [],
    parts: [],
    products: [],
    categories: [],
    files: [],
    materials: [],
    sequences: [],
    quotes: [],
    orders: [],
    inventory: [],
    production: [],
  };

  return { ...base, ...overrides };
}

export function buildPermissionProfile(assignments: UserRoleAssignment[]) {
  const profile = defaultProfile({});

  assignments.forEach((assignment) => {
    const rolePermissions = ROLE_PERMISSION_MATRIX[assignment.role];
    Object.entries(rolePermissions).forEach(([module, actions]) => {
      const existing = new Set(profile[module as PermissionModule]);
      actions.forEach((action) => existing.add(action));
      profile[module as PermissionModule] = Array.from(existing);
    });
  });

  return profile;
}

