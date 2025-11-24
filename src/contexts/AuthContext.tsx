"use client";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth, db } from "@/lib/firebaseClient";
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

  const loadClaims = useCallback(async (currentUser: User) => {
    const token = await currentUser.getIdTokenResult(true);
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
          ? (rawModules as Partial<Record<PermissionModule, PermissionAction[]>>)
          : undefined,
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          await loadClaims(currentUser);
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
  }, [loadClaims]);

  useEffect(() => {
    if (!user?.uid || !user.email) {
      return;
    }

    const ensureUserDocument = async () => {
      try {
        const targetRef = doc(db, "users", user.uid);
        const normalizedEmail = user.email?.toLowerCase();
        if (!normalizedEmail) return;

        const targetSnapshot = await getDoc(targetRef);
        let claimsNeedsRefresh = false;

        if (!targetSnapshot.exists()) {
          const matchQuery = query(
            collection(db, "users"),
            where("email", "==", normalizedEmail),
          );
          const snapshot = await getDocs(matchQuery);
          const legacyDoc = snapshot.docs[0];

          if (!legacyDoc) {
            return;
          }

          await setDoc(targetRef, legacyDoc.data(), { merge: true });
          await deleteDoc(legacyDoc.ref);
          claimsNeedsRefresh = true;
        }

        const lastLoginAt =
          user.metadata?.lastSignInTime ?? new Date().toISOString();

        await setDoc(
          targetRef,
          {
            email: normalizedEmail,
            lastLoginAt,
          },
          { merge: true },
        );

        if (claimsNeedsRefresh && auth.currentUser) {
          await loadClaims(auth.currentUser);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to ensure user document exists", error);
      }
    };

    ensureUserDocument();
  }, [loadClaims, user?.email, user?.uid]);

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


