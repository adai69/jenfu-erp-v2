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

  const fallbackAssignments = useMemo<UserRoleAssignment[]>(() => {
    if (!claims?.roles?.length) return [];
    const departments = claims.departments ?? [];
    return claims.roles.map((role) => ({
      role,
      departments,
    }));
  }, [claims?.departments, claims?.roles]);

  const profile = useMemo(() => {
    if (usingAssignments && assignments) {
      return buildPermissionProfile(assignments, { roleFilter, departmentFilter });
    }

    const modules = claims?.modules;
    if (modules) {
      const profileFromClaims = buildPermissionProfile(fallbackAssignments, {
        roleFilter,
        departmentFilter,
      }) as Record<PermissionModule, PermissionAction[]>;

      (Object.keys(profileFromClaims) as PermissionModule[]).forEach((module) => {
        const actions = modules[module];
        if (Array.isArray(actions)) {
          profileFromClaims[module] = actions as PermissionAction[];
        }
      });

      return profileFromClaims;
    }

    if (fallbackAssignments.length) {
      return buildPermissionProfile(fallbackAssignments, { roleFilter, departmentFilter });
    }

    return null;
  }, [
    assignments,
    claims?.modules,
    departmentFilter,
    fallbackAssignments,
    roleFilter,
    usingAssignments,
  ]);

  const can = (module: PermissionModule, action: PermissionAction) => {
    if (usingAssignments && assignments) {
      return canPerformAction(assignments, module, action, { roleFilter, departmentFilter });
    }

    const moduleActions = profile?.[module];
    return Array.isArray(moduleActions) ? moduleActions.includes(action) : false;
  };

  return {
    profile,
    can,
  };
}

