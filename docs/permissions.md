# 權限與多角色規劃

此文件說明鉦富機械 ERP V2 的角色、部門與權限矩陣，並處理「一人多職」的授權狀況。

## 1. 角色層級

| 角色 | 說明 | 典型人員 |
| --- | --- | --- |
| Admin | 擁有序號調整、主檔核准、審計設定最高權限 | 張仕杰 |
| Manager | 各模組的日常維運：新增/編輯/停用資料、啟動審核 | 張成漢、張祐豪 |
| Planner | 策劃/草稿：可建立草稿、提交變更、查詢資料 | 管理／研發規劃人員 |
| Operator | 只讀：生產線或外籍人員查詢用 | 現場人員 |

角色可同時存在於同一帳號，系統會依所選「操作視角」判斷授權集合。

## 2. 部門／職能

支援多部門授權（Example: `["rd","production"]`），權限檢查時需同時符合角色與部門範圍。主要部門代碼：

- `executive`（經營）
- `rd`（研發）
- `production`（生產）
- `sales`（營銷）
- `management`（管理／行政）
- `finance`（財務）

## 3. 模組權限定義

`src/lib/permissionMatrix.ts` 定義 `PermissionModule` 與 `PermissionAction`：

- Modules：`users`、`units`、`suppliers`、`customers`、`parts`、`products`、`categories`、`sequences`、`quotes`、`orders`、`inventory`、`production`
- Actions：`view`、`create`、`update`、`disable`、`approve`、`lock`、`sequence-adjust`、`cancel`

對應矩陣重點：

- Admin：所有模組 `view/create/update/disable/approve`；序號模組額外擁有 `lock`、`sequence-adjust`；報價/訂單/庫存/製令額外可 `cancel` 與 `lock`。
- Manager：主檔具 `view/create/update/disable`；序號模組僅 `view`、`lock`（需填寫原因）；流程模組可 `view/create/update`，必要時可 `lock`。
- Planner：多為草稿/提交 (`view/create`)，不含停用與序號操作。
- Operator：僅 `view`。

## 4. 多角色處理

`src/types/auth.ts` 與 `src/lib/permissionMatrix.ts` 提供：

- `UserRoleAssignment`：記錄角色 + 部門範圍 + 是否主要職務。
- `buildPermissionProfile(assignments, { roleFilter, departmentFilter })`：依所選視角合併權限動作，供介面顯示與權限判斷。
- `ROLE_DEFINITIONS / DEPARTMENT_DEFINITIONS`：提供顯示文字與階層資訊。

UI 可透過 `操作視角` 選單切換當前角色與部門，所有操作與 log 需記錄所選視角。

## 5. 流程要求

1. 序號：任何建檔流程在 `issueSequence` 成功前，禁止寫入資料；`lock` 與 `sequence-adjust` 需雙簽（操作人 + Admin）。
2. 主檔變更：高風險欄位（供應商等級、付款條件）需 `approve` 權限才可定案。
3. Audit Log：須紀錄 `userId`、`roles[]`、`selectedRole`、`selectedDepartment`、`module`、`action`、`reason`。

## 6. Firebase 導入策略

1. **Claims 結構**  
   - 使用 Cloud Functions 將 `buildPermissionProfile` 結果寫入 custom claims，例如：
     ```json
     {
       "roles": ["admin","manager"],
       "departments": ["executive","rd"],
       "modules": {
         "quotes": ["view","create","update","lock","cancel"],
         "orders": ["view","create","update"]
       }
     }
     ```
   - claims 每 1 小時重新整理或於角色變更時觸發 `syncUserClaims`.

2. **Security Rules 原則**  
   - 以 `module`/`action` 判定：`request.auth.token.modules.quotes` 是否含 `create`。
   - 判斷資料範圍：若文件帶 `department`, Rules 需確認 `department in auth.token.departments`.
   - 高風險欄位（`locked`, `status`, `approval`）只能被擁有對應動作的人修改，規則中需比較 `request.resource.data` 與 `resource.data`.

3. **Rules 範例 (Quotes)**  
   ```javascript
   match /quotes/{quoteId} {
     allow create: if hasModuleAction("quotes", "create");
     allow update: if hasModuleAction("quotes", "update")
       && !resource.data.locked
       || (isLocking() && hasModuleAction("quotes", "lock"))
       || (isCancelling() && hasModuleAction("quotes", "cancel"));
     allow get, list: if hasModuleAction("quotes", "view");

     function hasModuleAction(module, action) {
       return request.auth != null
         && module in request.auth.token.modules
         && action in request.auth.token.modules[module];
     }

     function isLocking() {
       return resource.data.locked == false
         && request.resource.data.locked == true;
     }

     function isCancelling() {
       return request.resource.data.status == "cancelled"
         && resource.data.status != "cancelled";
     }
   }
   ```

4. **前端 `usePermission` Hook**  
   - 包一層 hook，將 `buildPermissionProfile` / persona 選擇與 `can(module, action)` 封裝；UI 按鈕依結果顯示/禁用。
   - API 呼叫前再次檢查，若後端回傳 403，彈出「需 Admin 權限」提示。

5. **導入順序**  
   1. 完成矩陣擴充與 `moduleOverrides` schema。  
   2. 寫 `syncUserClaims` Function。  
   3. 建 `usePermission` + `PermissionGate` 元件，更新現有 UI。  
   4. 編寫並測試 Firestore Rules。  
   5. 文件化流程、教育使用者。

後續模組在實作權限檢查時，統一呼叫 `canPerformAction(user, module, action, options)`；若不符合，需阻擋操作並提示須由有權限之角色執行。*** End Patch

