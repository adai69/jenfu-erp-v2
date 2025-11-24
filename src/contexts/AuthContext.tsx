"use client";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth } from "@/lib/firebaseClient";
import type {
  DepartmentId,
  PermissionAction,
  PermissionModule,
  RoleId,
} from "@/types/auth";

type PermissionClaims = {
  roles?: RoleId[];
  departments?: DepartmentId[];
  modules?: Partial<Record<PermissionModule, PermissionAction[]>>;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  claims: PermissionClaims | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<PermissionClaims | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const token = await currentUser.getIdTokenResult();
          const rawRoles = token.claims.roles;
          const rawDepartments = token.claims.departments;
          const rawModules = token.claims.modules;

          setClaims({
            roles: Array.isArray(rawRoles) ? (rawRoles as RoleId[]) : undefined,
            departments: Array.isArray(rawDepartments)
              ? (rawDepartments as DepartmentId[])
              : undefined,
            modules:
              rawModules && typeof rawModules === "object"
                ? (rawModules as Partial<
                    Record<PermissionModule, PermissionAction[]>
                  >)
                : undefined,
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to load user claims", error);
          setClaims(null);
        } finally {
          setLoading(false);
        }
      } else {
        setClaims(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      claims,
    }),
    [user, loading, login, logout, claims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}


