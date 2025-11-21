"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

const kpis = [
  { label: "本月接單金額", value: "NT$ 25.8M", delta: "+12% MoM" },
  { label: "毛利率", value: "38.4%", delta: "+2.1 pt" },
  { label: "交期準確率", value: "92%", delta: "-1% 上週" },
  { label: "庫存週轉天數", value: "48 天", delta: "-6 天" },
];

const pendingTasks = [
  { title: "油水分離機 LOT-241105", owner: "張成漢", due: "11/20", type: "訂單" },
  { title: "越籍人員技能盤點", owner: "張祐豪", due: "11/22", type: "人力" },
  { title: "BOM-PDM 權限規格審查", owner: "張仕杰", due: "11/25", type: "系統" },
];

const timeline = [
  { time: "09:00", event: "SolidWorks 設計評審", team: "研發" },
  { time: "11:00", event: "採購－供應商打樣確認", team: "行政" },
  { time: "14:00", event: "油水分離槽 FAT 驗收", team: "生產" },
  { time: "16:30", event: "財務預算滾動檢討", team: "管理" },
];

function DashboardContent() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {item.value}
            </p>
            <p className="text-xs font-semibold text-teal-600">{item.delta}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">待辦節點</h2>
            <p className="text-xs text-slate-500">聚焦 48 小時內工作</p>
          </div>
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <div
                key={task.title}
                className="rounded-xl border border-slate-100 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {task.title}
                </p>
                <p className="text-xs text-slate-500">
                  負責：{task.owner} ｜ 截止：{task.due} ｜ 類型：{task.type}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">今日節奏</h2>
          <div className="space-y-3">
            {timeline.map((slot) => (
              <div key={slot.event} className="flex items-center gap-3">
                <div className="w-16 rounded-lg bg-slate-900/90 py-2 text-center text-xs font-semibold text-white">
                  {slot.time}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {slot.event}
                  </p>
                  <p className="text-xs text-slate-500">{slot.team}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
