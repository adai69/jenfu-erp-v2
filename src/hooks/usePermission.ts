import { useMemo } from "react";
import { buildPermissionProfile, canPerformAction } from "@/lib/permissionMatrix";
import type {
  DepartmentId,
  PermissionAction,
  PermissionModule,
  RoleId,
  UserRoleAssignment,
} from "@/types/auth";

type UsePermissionParams = {
  assignments: UserRoleAssignment[];
  roleFilter?: RoleId;
  departmentFilter?: DepartmentId;
};

export function usePermission({
  assignments,
  roleFilter,
  departmentFilter,
}: UsePermissionParams) {
  const profile = useMemo(
    () =>
      buildPermissionProfile(assignments, {
        roleFilter,
        departmentFilter,
      }),
    [assignments, roleFilter, departmentFilter],
  );

  const can = (module: PermissionModule, action: PermissionAction) =>
    canPerformAction(assignments, module, action, { roleFilter, departmentFilter });

  return { profile, can };
}

