"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "erp-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const hasMounted = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let stored: Theme | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {
      stored = null;
    }

    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
      hasMounted.current = true;
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const initial = prefersDark.matches ? "dark" : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    hasMounted.current = true;

    const handler = (event: MediaQueryListEvent) => {
      let persisted: Theme | null = null;
      try {
        persisted = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      } catch {
        persisted = null;
      }
      if (persisted === "light" || persisted === "dark") {
        return;
      }
      const nextTheme: Theme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    };

    if (typeof prefersDark.addEventListener === "function") {
      prefersDark.addEventListener("change", handler);
      return () => prefersDark.removeEventListener("change", handler);
    }

    // 舊瀏覽器 fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMedia: any = prefersDark;
    if (typeof anyMedia.addListener === "function") {
      anyMedia.addListener(handler);
      return () => anyMedia.removeListener(handler);
    }
  }, []);

  useEffect(() => {
    if (!hasMounted.current) return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

