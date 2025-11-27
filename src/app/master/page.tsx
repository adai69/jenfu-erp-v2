import {
  categories,
  brands,
  countries,
  customers,
  employees,
  parts,
  products,
  sequences,
  suppliers,
  units,
  users,
} from "@/data/masterRecords";
import { DEPARTMENT_DEFINITIONS, ROLE_DEFINITIONS } from "@/types/auth";

const countryRegionLabels: Record<string, string> = {
  asia: "亞洲",
  europe: "歐洲",
  america: "美洲",
  oceania: "大洋洲",
  africa: "非洲",
  "middle-east": "中東",
  other: "其他",
};

const masterSets = [
  {
    key: "users",
    title: "使用者 Users",
    description: "角色權限、部門與狀態管理",
    total: users.length,
    updated: "11/18 09:00",
    headers: ["姓名", "角色", "部門", "狀態"],
    rows: users.map((u) => [
      u.name,
      u.roles.map((assignment) => ROLE_DEFINITIONS[assignment.role].label).join(" / "),
      u.departments.map((dept) => DEPARTMENT_DEFINITIONS[dept]?.label ?? dept).join(" / "),
      u.status,
    ]),
  },
  {
    key: "employees",
    title: "員工 Employees",
    description: "人事資料卡、部門與狀態",
    total: employees.length,
    updated: "11/18 09:05",
    headers: ["編號", "姓名", "部門", "狀態"],
    rows: employees.map((e) => [
      e.code,
      e.name,
      e.departments.map((dept) => DEPARTMENT_DEFINITIONS[dept]?.label ?? dept).join(" / "),
      e.status === "active" ? "在職" : e.status === "on-leave" ? "留停" : "離職",
    ]),
  },
  {
    key: "units",
    title: "計量單位 Units",
    description: "跨模組共用的單位與分類",
    total: units.length,
    updated: "11/18 09:10",
    headers: ["代碼", "名稱", "類別"],
    rows: units.map((u) => [u.code, u.name, u.category]),
  },
  {
    key: "suppliers",
    title: "供應商 Suppliers",
    description: "採購等級與交期能力",
    total: suppliers.length,
    updated: "11/18 09:20",
    headers: ["名稱", "等級", "交期(天)", "狀態"],
    rows: suppliers.map((s) => [s.name, `Level ${s.level}`, `${s.leadTimeDays}`, s.status]),
  },
  {
    key: "brands",
    title: "品牌 Brands",
    description: "品牌代碼、國別與網站",
    total: brands.length,
    updated: "11/18 09:22",
    headers: ["代碼", "品牌", "國別", "狀態"],
    rows: brands.map((brand) => [
      brand.code,
      brand.name,
      brand.countryCode ?? "—",
      brand.status === "active" ? "使用中" : "停用",
    ]),
  },
  {
    key: "countries",
    title: "國家 Countries",
    description: "國別代碼 / 幣別 / 區域",
    total: countries.length,
    updated: "11/18 09:18",
    headers: ["代碼", "中文", "英文", "區域", "幣別"],
    rows: countries.map((country) => [
      country.code,
      country.nameZh,
      country.nameEn ?? "—",
      country.region ? countryRegionLabels[country.region] ?? country.region : "—",
      country.currencyCode ?? "—",
    ]),
  },
  {
    key: "customers",
    title: "客戶 Customers",
    description: "市場區隔與負責人",
    total: customers.length,
    updated: "11/18 09:25",
    headers: ["名稱", "區隔", "國別", "負責"],
    rows: customers.map((c) => [c.name, c.segment, c.country, c.owner]),
  },
  {
    key: "products",
    title: "產品 Products",
    description: "標準交期與生命週期",
    total: products.length,
    updated: "11/18 09:35",
    headers: ["品名", "分類", "階段", "交期"],
    rows: products.map((p) => [p.name, p.category, p.stage, `${p.standardLeadTime} 天`]),
  },
  {
    key: "parts",
    title: "零件 Parts",
    description: "成本、單位與狀態",
    total: parts.length,
    updated: "11/18 09:40",
    headers: ["料號", "品名", "單位", "狀態"],
    rows: parts.map((p) => [p.code, p.name, p.unit, p.status]),
  },
  {
    key: "categories",
    title: "類別 Categories",
    description: "零件/原物料分類管理",
    total: categories.length,
    updated: "11/18 09:45",
    headers: ["代碼", "名稱", "型態"],
    rows: categories.map((c) => [c.code, c.name, c.type]),
  },
  {
    key: "sequences",
    title: "流水號 Sequences",
    description: "報價/訂單/製令編碼控管",
    total: sequences.length,
    updated: "11/18 09:50",
    headers: ["Key", "Prefix", "下一號", "使用範圍"],
    rows: sequences.map((s) => [
      s.key,
      s.prefix,
      s.nextNumber.toString().padStart(s.padding, "0"),
      s.scope,
    ]),
  },
];

const summary = [
  { label: "核心主檔", value: `${masterSets.length}`, note: "本階段完整定義" },
  { label: "員工人數", value: `${employees.length}`, note: "JFS 編號" },
  { label: "角色/單位", value: `${users.length}+${units.length}`, note: "跨模組共用" },
  { label: "供應/客戶", value: `${suppliers.length}/${customers.length}`, note: "採購/營銷" },
  { label: "品號/零件", value: `${products.length}+${parts.length}`, note: "BOM 基礎" },
];

export default function MasterDataPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal-200">Master Data</p>
          <h1 className="text-3xl font-semibold">主檔中心 · 單一真相來源</h1>
          <p className="text-sm text-slate-200">
            連結 BOM、製令、財務及 PDM，確保所有決策與序號一體校正。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="text-xs text-slate-200">{item.label}</p>
              <p className="text-2xl font-semibold text-white">{item.value}</p>
              <p className="text-xs text-slate-300">{item.note}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-6">
        {masterSets.map((set) => (
          <div
            key={set.key}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{set.title}</h2>
                <p className="text-sm text-slate-500">{set.description}</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {set.total} 筆
                </span>
                <span className="text-xs text-slate-400">更新：{set.updated}</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {set.headers.map((header) => (
                      <th
                        key={header}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {set.rows.map((row, idx) => (
                    <tr key={`${set.key}-${idx}`} className="hover:bg-slate-50/70">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="whitespace-nowrap px-4 py-2 text-slate-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
              <p>同步 BOM 篩選介面，保持搜尋體驗一致。</p>
              <button className="rounded-full bg-slate-900 px-4 py-1 text-white">
                管理 {set.title}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

