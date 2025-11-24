import { useMemo } from "react";
import { buildPermissionProfile, canPerformAction } from "@/lib/permissionMatrix";
import { useAuth } from "@/contexts/AuthContext";
import type {
  DepartmentId,
  PermissionAction,
  PermissionModule,
  RoleId,
  UserRoleAssignment,
} from "@/types/auth";

type UsePermissionParams = {
  assignments?: UserRoleAssignment[];
  roleFilter?: RoleId;
  departmentFilter?: DepartmentId;
};

export function usePermission(params?: UsePermissionParams) {
  const { assignments, roleFilter, departmentFilter } = params ?? {};
  const { claims } = useAuth();

  const usingAssignments = Boolean(assignments && assignments.length);

  const profile = useMemo(() => {
    if (usingAssignments && assignments) {
      return buildPermissionProfile(assignments, { roleFilter, departmentFilter });
    }

    const modules = claims?.modules;
    if (modules) {
      const profileFromClaims: Record<PermissionModule, PermissionAction[]> = {
        users: [],
        units: [],
        suppliers: [],
        customers: [],
        parts: [],
        products: [],
        categories: [],
        materials: [],
        sequences: [],
        quotes: [],
        orders: [],
        inventory: [],
        production: [],
      };

      (Object.keys(profileFromClaims) as PermissionModule[]).forEach((module) => {
        const actions = modules[module];
        if (Array.isArray(actions)) {
          profileFromClaims[module] = actions as PermissionAction[];
        }
      });

      return profileFromClaims;
    }

    return null;
  }, [assignments, claims?.modules, departmentFilter, roleFilter, usingAssignments]);

  const can = (module: PermissionModule, action: PermissionAction) => {
    if (usingAssignments && assignments) {
      return canPerformAction(assignments, module, action, { roleFilter, departmentFilter });
    }

    const moduleActions = claims?.modules?.[module];
    return Array.isArray(moduleActions) ? moduleActions.includes(action) : false;
  };

  return {
    profile,
    can,
  };
}

