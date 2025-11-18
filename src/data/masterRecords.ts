import type {
  Category,
  Customer,
  Part,
  Product,
  Sequence,
  Supplier,
  Unit,
  User,
} from "@/types/master";

export const users: User[] = [
  {
    id: "U-001",
    name: "張仕杰",
    primaryRole: "admin",
    roles: [
      { role: "admin", departments: ["executive", "rd", "finance", "management"], isPrimary: true },
      { role: "manager", departments: ["rd", "finance"] },
    ],
    departments: ["executive", "rd", "finance", "management"],
    email: "ceo@cfm.com",
    status: "active",
    moduleOverrides: {
      quotes: ["approve", "lock", "cancel"],
      orders: ["approve", "lock", "cancel"],
    },
  },
  {
    id: "U-002",
    name: "張成漢",
    primaryRole: "manager",
    roles: [
      { role: "manager", departments: ["production", "sales"], isPrimary: true },
      { role: "operator", departments: ["production"] },
    ],
    departments: ["production", "sales"],
    email: "operation@cfm.com",
    status: "active",
    moduleOverrides: {
      inventory: ["lock"],
      production: ["lock"],
    },
  },
  {
    id: "U-003",
    name: "張祐豪",
    primaryRole: "planner",
    roles: [
      { role: "planner", departments: ["management", "sales"], isPrimary: true },
      { role: "manager", departments: ["management"] },
    ],
    departments: ["management", "sales"],
    email: "planner@cfm.com",
    status: "active",
  },
  {
    id: "U-004",
    name: "阮梓明",
    primaryRole: "operator",
    roles: [{ role: "operator", departments: ["production"] }],
    departments: ["production"],
    email: "worker.vn@cfm.com",
    status: "active",
  },
];

export const units: Unit[] = [
  { code: "EA", name: "台", category: "count", conversion: "1 台 = 1 件" },
  { code: "SET", name: "套", category: "count", conversion: "1 套 = 多件零組" },
  { code: "BAR", name: "條", category: "count", conversion: "1 條 = 1 件" },
  { code: "KG", name: "公斤", category: "weight", conversion: "1 kg = 1000 g" },
  { code: "L", name: "公升", category: "volume", conversion: "1 L = 1000 mL" },
  { code: "MM", name: "毫米", category: "length", conversion: "1 mm = 0.001 m" },
  { code: "LPM", name: "公升/分鐘", category: "flow", conversion: "1 LPM = 0.001 m³/min" },
  { code: "M3H", name: "立方米/小時", category: "flow", conversion: "1 m³/h = 16.67 LPM" },
  { code: "DEG-C", name: "攝氏度", category: "temperature", conversion: "基準溫標 °C" },
  { code: "DEG-F", name: "華氏度", category: "temperature", conversion: "°F = °C × 1.8 + 32" },
];

export const suppliers: Supplier[] = [
  {
    code: "S-ACM",
    name: "亞鋼金屬",
    contact: "陳小姐",
    phone: "02-1234-5678",
    level: "A",
    leadTimeDays: 12,
    status: "active",
  },
  {
    code: "S-PUMP",
    name: "鑫泉幫浦",
    contact: "吳經理",
    phone: "04-8765-4321",
    level: "A",
    leadTimeDays: 20,
    status: "active",
  },
  {
    code: "S-CHEM",
    name: "沛富化工原料",
    contact: "林先生",
    phone: "07-2222-8888",
    level: "B",
    leadTimeDays: 15,
    status: "suspended",
  },
];

export const customers: Customer[] = [
  {
    code: "C-TPWR",
    name: "台北水務處",
    segment: "政府",
    country: "TW",
    owner: "張成漢",
    status: "active",
  },
  {
    code: "C-LNG",
    name: "聯能光電",
    segment: "工業",
    country: "TW",
    owner: "張祐豪",
    status: "pipeline",
  },
  {
    code: "C-VNM1",
    name: "越南南部工業區",
    segment: "外銷",
    country: "VN",
    owner: "張仕杰",
    status: "on-hold",
  },
];

export const products: Product[] = [
  {
    code: "PR-OWS-200",
    name: "油水分離機 200L",
    category: "油水分離",
    stage: "量產",
    standardLeadTime: 45,
  },
  {
    code: "PR-SCREEN-01",
    name: "機械式攔汙柵",
    category: "固液分離",
    stage: "量產",
    standardLeadTime: 35,
  },
  {
    code: "PR-FLOT-01",
    name: "溶氣浮選模組",
    category: "預處理模組",
    stage: "開發",
    standardLeadTime: 60,
  },
];

export const parts: Part[] = [
  {
    code: "PT-PUMP-15",
    name: "防爆油泵",
    spec: "15HP|不銹鋼|三相",
    unit: "SET",
    cost: 42000,
    status: "使用中",
  },
  {
    code: "PT-SENSOR-01",
    name: "油水界面感測器",
    spec: "4-20mA|IP68",
    unit: "EA",
    cost: 6800,
    status: "使用中",
  },
  {
    code: "PT-CHEM-07",
    name: "氣浮助凝劑",
    spec: "25KG/桶",
    unit: "KG",
    cost: 3200,
    status: "停用",
  },
];

export const categories: Category[] = [
  { code: "CAT-ASM", name: "零組件", type: "零件" },
  { code: "CAT-RM", name: "原物料", type: "原物料" },
  { code: "CAT-ACC", name: "配件", type: "配件" },
  { code: "CAT-TOOL", name: "治具工具", type: "工具" },
];

export const sequences: Sequence[] = [
  { key: "QUOTE", prefix: "QU", padding: 4, nextNumber: 128, scope: "報價" },
  { key: "ORDER", prefix: "SO", padding: 5, nextNumber: 3021, scope: "訂單" },
  { key: "WO", prefix: "WO", padding: 5, nextNumber: 873, scope: "製令" },
  { key: "SERIAL", prefix: "CFM", padding: 6, nextNumber: 54219, scope: "序號" },
  { key: "USER", prefix: "UA", padding: 4, nextNumber: 42, scope: "帳號" },
];

