import * as admin from "firebase-admin";
import {
  buildPermissionProfile,
  type DepartmentId,
  type PermissionAction,
  type PermissionModule,
  type RoleId,
  type UserRoleAssignment,
} from "./permissions";

type UserDocument = {
  roles: UserRoleAssignment[];
  overrides?: Partial<Record<PermissionModule, PermissionAction[]>>;
};

const app = admin.apps.length ? admin.app() : admin.initializeApp();
const firestore = app.firestore();
const auth = app.auth();

const dedupe = <T,>(items: T[] = []) => Array.from(new Set(items));
const normalizeModuleActions = (actions: PermissionAction[] = []) => dedupe(actions);

export async function syncUserClaims(uid: string) {
  const ref = firestore.doc(`users/${uid}`);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new Error(`User document not found for uid: ${uid}`);
  }

  const data = snapshot.data() as UserDocument;
  const assignments = data.roles ?? [];

  const profile = buildPermissionProfile(assignments);

  const modules = Object.fromEntries(
    Object.entries(profile).map(([module, actions]) => {
      const overrides = data.overrides?.[module as PermissionModule] ?? [];
      return [module, normalizeModuleActions([...actions, ...overrides])];
    }),
  );

  const roles: RoleId[] = dedupe(assignments.map((assignment) => assignment.role));
  const departments: DepartmentId[] = dedupe(
    assignments.flatMap((assignment) => assignment.departments),
  );

  await auth.setCustomUserClaims(uid, {
    roles,
    departments,
    modules,
  });
}

