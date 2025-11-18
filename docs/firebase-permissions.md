## Firebase 權限整合方案

### 1. Claims 結構

- `roles`: string[]
- `departments`: string[]
- `modules`: Record<PermissionModule, PermissionAction[]>
- `overrides`: 可選，針對特定模組或資料範圍給予額外權限

Cloud Function `syncUserClaims` 步驟：
1. 從 Firestore 取得使用者的 role assignments 與 overrides。
2. 透過 `buildPermissionProfile` 計算 actions。
3. 以 `admin.auth().setCustomUserClaims(uid, claims)` 寫回。

### 2. Security Rules 模板

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /quotes/{quoteId} {
      allow create: if hasModuleAction("quotes", "create");
      allow read: if hasModuleAction("quotes", "view");
      allow update: if canUpdateQuote();

      function hasModuleAction(module, action) {
        return request.auth != null
          && module in request.auth.token.modules
          && action in request.auth.token.modules[module];
      }

      function canUpdateQuote() {
        return hasModuleAction("quotes", "update") && !resource.data.locked
          || (isLocking() && hasModuleAction("quotes", "lock"))
          || (isCancelling() && hasModuleAction("quotes", "cancel"));
      }

      function isLocking() {
        return !resource.data.locked && request.resource.data.locked == true;
      }

      function isCancelling() {
        return request.resource.data.status == "cancelled"
          && resource.data.status != "cancelled";
      }
    }
  }
}
```

同理可套用到 `orders`、`inventory`、`production`，只要替換模組名稱與特殊欄位檢查即可。

### 3. 前端 Hook / Gate

- `usePermission(assignments, role, department)`：包裝 `buildPermissionProfile` 與 `canPerformAction`，UI 判斷是否顯示按鈕。
- `PermissionGate` 元件：接收 `module`、`action`、`fallback`，在組件內使用 hook 判斷，避免重複程式碼。

### 4. 導入流程

1. 後台「使用者主檔」允許設定角色、部門、模組 overrides。
2. 每次變更後呼叫 Cloud Function 更新 claims。
3. Next.js 端以 `usePermission` 決定 UI；API 呼叫帶上 token，由 Security Rules 二次驗證。
4. 規則與 hook 變更需記錄在 `docs/permissions.md`，並教育三位主管如何檢視與調整。

