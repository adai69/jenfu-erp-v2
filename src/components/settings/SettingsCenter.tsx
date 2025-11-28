"use client";

import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import type { PermissionModule } from "@/types/auth";

type SettingsGroupId = "basic" | "access";

type SettingsModule = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: SettingsGroupId;
  permissionModule?: PermissionModule;
  badge?: string;
};

const SETTINGS_GROUPS: Array<{ id: SettingsGroupId; label: string; helper: string }> = [
  {
    id: "basic",
    label: "基礎設定",
    helper: "各模組共用的基礎主檔，設定頻率較低但關係全域資料一致性。",
  },
  {
    id: "access",
    label: "人員與權限",
    helper: "帳號、角色與開通信件相關設定，建議由系統管理者操作。",
  },
];

const SETTINGS_MODULES: SettingsModule[] = [
  {
    id: "countries",
    label: "國家主檔",
    description: "國別 / 幣別 / 國碼設定",
    href: "/master/countries",
    group: "basic",
    permissionModule: "countries",
  },
  {
    id: "brands",
    label: "品牌主檔",
    description: "品牌 / 製造商資料",
    href: "/master/brands",
    group: "basic",
    permissionModule: "brands",
  },
  {
    id: "purchaseMethods",
    label: "採購方式主檔",
    description: "一般 / 委外 / 寄售流程規則",
    href: "/master/purchase-methods",
    group: "basic",
    permissionModule: "purchaseMethods",
  },
  {
    id: "materialCategories",
    label: "物料分類",
    description: "零件群組 / 供 BOM 使用",
    href: "/master/material-categories",
    group: "basic",
    permissionModule: "categories",
  },
  {
    id: "units",
    label: "計量單位",
    description: "跨模組共用量測單位",
    href: "/master/units",
    group: "basic",
    permissionModule: "units",
  },
  {
    id: "warehouses",
    label: "倉庫主檔",
    description: "倉別 / 預設收發設定",
    href: "/master/warehouses",
    group: "basic",
    permissionModule: "inventory",
  },
  {
    id: "paymentTerms",
    label: "付款條件主檔",
    description: "現金、月結、預付等條件",
    href: "/master/payment-terms",
    group: "basic",
    permissionModule: "suppliers",
  },
  {
    id: "sequences",
    label: "序號設定",
    description: "Prefix / Padding / 流水碼",
    href: "/master/sequences",
    group: "basic",
    permissionModule: "sequences",
    badge: "須審核",
  },
  {
    id: "users",
    label: "使用者主檔",
    description: "帳號、角色、部門",
    href: "/master/users",
    group: "access",
    permissionModule: "users",
  },
  {
    id: "userProvisioning",
    label: "帳號佇列",
    description: "建立紀錄 / 失敗原因",
    href: "/master/user-provisioning",
    group: "access",
    permissionModule: "users",
  },
];

export function SettingsCenter() {
  const { can } = usePermission();

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-8 py-10 text-white shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-teal-200">Settings Hub</p>
        <h1 className="mt-3 text-3xl font-semibold">設定中心</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-200">
          這裡集中放置所有較少操作的設定類主檔。當需要調整品牌、國家、序號或帳號權限時，先到設定中心挑選模組再進入維護畫面，避免左側選單堆疊造成干擾。
        </p>
      </header>

      {SETTINGS_GROUPS.map((group) => {
        const modules = SETTINGS_MODULES.filter((module) => module.group === group.id);
        if (!modules.length) return null;

        return (
          <section key={group.id} className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                {group.label}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">{group.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{group.helper}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => {
                const canView = module.permissionModule ? can(module.permissionModule, "view") : true;
                return (
                  <article
                    key={module.id}
                    className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      canView ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{module.label}</p>
                        <p className="mt-1 text-sm text-slate-500">{module.description}</p>
                      </div>
                      {module.badge ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
                          {module.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-5 flex items-center justify-between text-sm">
                      <span className="text-xs font-mono text-slate-400">{module.href}</span>
                      {canView ? (
                        <Link
                          href={module.href}
                          className="rounded-full border border-teal-500 px-4 py-1.5 text-xs font-semibold text-teal-600 transition hover:bg-teal-50"
                        >
                          前往管理
                        </Link>
                      ) : (
                        <span className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-400">
                          無檢視權限
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}


