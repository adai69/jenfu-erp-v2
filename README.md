## 鉦富機械 ERP V2

本專案為鉦富機械 ERP V2（Next.js + TypeScript + Tailwind 4）原型，聚焦廢水處理第一階段業務（油水分離機、機械式攔汙柵等）的流程數位化。所有模組需遵循公司治理與序號規則，並與 PDM / BOM / 生產履歷整合。

### 快速啟動

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

主要路由：
- `/`：營運儀表首頁
- `/master`：主檔中心
- `/master/users`：使用者主檔（統一篩選介面）
- `/master/sequences`：序號治理模組

### 統一序號規則

自 2025-11-18 起，所有模組建檔必須透過序號模組取得正式編碼，禁止自行組合 prefix 或流水號。相關規範與 API 介面詳見 `docs/sequence-policy.md` 與 `src/lib/sequenceManager.ts`。

- `peekSequence(key)`：預覽下一個號碼
- `issueSequence(key)`：正式取號並自動遞增
- `formatSequenceNumber(key, value)`：統一格式化規則

若需新增模組，必須在需求文件中註記「序號來源：Sequences」，並在程式內呼叫上述 API；違反規範的程式碼不得合併。

### 權限與公司背景

`docs/company-prompt.md` 收錄張祐豪提供的完整公司背景、營運模式與顧問要求；`docs/permissions.md` 與 `docs/firebase-permissions.md` 詳述多角色/多部門權限矩陣、Firebase claims、Security Rules 模板，以及前端 `usePermission`/`PermissionGate` 使用方式。若要部署 Cloud Functions，請依 `docs/firebase-deploy.md` 步驟操作。
