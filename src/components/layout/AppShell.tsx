"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

const navItems = [
  { label: "總覽", description: "即時 KPI 與工單負載", href: "/" },
  { label: "主檔中心", description: "Users / Parts / Sequences", href: "/master" },
  { label: "使用者主檔", description: "帳號、角色、權限", href: "/master/users" },
  { label: "帳號佇列", description: "建立紀錄 / 失敗原因", href: "/master/user-provisioning" },
  { label: "物料主檔", description: "零件 / 採購料", href: "/master/materials" },
  { label: "物料分類", description: "零件群組 / 供 BOM 使用", href: "/master/material-categories" },
  { label: "計量單位", description: "跨模組共用單位", href: "/master/units" },
  { label: "倉庫主檔", description: "倉別 / 預設收發", href: "/master/warehouses" },
  { label: "付款條件", description: "供應商付款條款", href: "/master/payment-terms" },
  { label: "序號設定", description: "Prefix / Padding / 流水", href: "/master/sequences" },
  { label: "供應商主檔", description: "等級、交期、狀態", href: "/master/suppliers" },
  { label: "報價管理", description: "詢價、交期、成本估算", href: "/quotes" },
  { label: "訂單管理", description: "接單、排程、出貨", href: "/orders" },
  { label: "庫存控管", description: "零件、原物料、批次", href: "/inventory" },
  { label: "產品/模組", description: "BOM、序號、版本", href: "/products" },
  { label: "供應協同", description: "供應商、採購、付款", href: "/suppliers" },
];

const COMMON_NAV_COUNT = 5;
const commonNavItems = navItems.slice(0, COMMON_NAV_COUNT);
const extraNavItems = navItems.slice(COMMON_NAV_COUNT);
const navChipClass =
  "whitespace-nowrap rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMoreOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreOpen]);

  const isLoggedIn = Boolean(user);
  const displayName = user?.displayName || user?.email || "訪客";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("logout failed", error);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-600">ERP V2</p>
            <h1 className="text-lg font-semibold text-slate-900">鉦富機械登入</h1>
          </div>
        </header>
        <main className="flex flex-1 flex-col bg-slate-50">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <div className="mb-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            鉦富機械 · ERP V2
          </p>
          <p className="text-lg font-semibold text-slate-900">廢水處理一階段</p>
          <p className="text-sm text-slate-500">物理預處理 · 油水分離設備</p>
        </div>

        <nav className="space-y-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-xl border border-slate-100 px-4 py-3 transition hover:border-teal-500 hover:bg-teal-50"
            >
              <p className="text-sm font-medium text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-500">{item.description}</p>
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-xl bg-slate-900 px-4 py-5 text-white">
          <p className="text-sm font-semibold">短期重點 (2025-2026)</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            <li>．三位種子主管能力養成</li>
            <li>．導入 PDM / BOM / 生產履歷</li>
            <li>．產品與流程優化</li>
          </ul>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-600">
              ERP 指揮中心
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              生產／財務整合作業台
            </h1>
            <p className="text-sm text-slate-500">
              週期目標：交期準確率、毛利率、庫存週轉天數
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={toggleTheme}
              aria-label="切換顯示模式"
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 theme-transition"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="text-xs text-slate-500">已登入使用者</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
              {initials || "JS"}
            </div>
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                登出
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-teal-500 px-3 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50"
              >
                登入
              </Link>
            )}
          </div>
          <div className="flex w-full basis-full flex-wrap items-start gap-3 pt-2">
            <nav aria-label="常用捷徑" className="flex flex-1 flex-wrap gap-3">
              {commonNavItems.map((item) => (
                <Link key={item.href} href={item.href} className={navChipClass}>
                  {item.label}
                </Link>
              ))}
            </nav>
            {extraNavItems.length > 0 && (
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isMoreOpen}
                  className={`${navChipClass} flex items-center gap-1`}
                >
                  更多模組
                  <span className="text-xs text-slate-500">{isMoreOpen ? "▲" : "▼"}</span>
                </button>
                {isMoreOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      其它模組
                    </p>
                    <div className="mt-1 space-y-1">
                      {extraNavItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMoreOpen(false)}
                          className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-teal-600"
                        >
                          <span className="block">{item.label}</span>
                          <span className="text-xs font-normal text-slate-500">{item.description}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

