import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { label: "總覽", description: "即時 KPI 與工單負載", href: "/" },
  { label: "主檔中心", description: "Users / Parts / Sequences", href: "/master" },
  { label: "使用者主檔", description: "帳號、角色、權限", href: "/master/users" },
  { label: "計量單位", description: "跨模組共用單位", href: "/master/units" },
  { label: "序號設定", description: "Prefix / Padding / 流水", href: "/master/sequences" },
  { label: "供應商主檔", description: "等級、交期、狀態", href: "/master/suppliers" },
  { label: "報價管理", description: "詢價、交期、成本估算", href: "/quotes" },
  { label: "訂單管理", description: "接單、排程、出貨", href: "/orders" },
  { label: "庫存控管", description: "零件、原物料、批次", href: "/inventory" },
  { label: "產品/模組", description: "BOM、序號、版本", href: "/products" },
  { label: "供應協同", description: "供應商、採購、付款", href: "/suppliers" },
];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
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
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">張仕杰</p>
              <p className="text-xs text-slate-500">總經理 · 研發 / 財務</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
              JS
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

