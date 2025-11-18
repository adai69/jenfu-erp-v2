## Firebase Functions 部署指引

1. **安裝依賴**
   ```bash
   cd firebase/functions
   npm install
   ```

2. **本地建置/測試**
   ```bash
   npm run build        # 產出 lib/
   npm run serve        # （可選）啟動 Emulator 僅跑 functions
   ```

3. **部署前準備**
   - 於根目錄執行 `firebase login`、`firebase use <project-id>`。
   - 確認 `users/{uid}` 文件 schema 為 `roles[]`、`overrides`、`departments`.

4. **部署**
   ```bash
   npm run deploy
   ```
   會先編譯 TypeScript，再執行 `firebase deploy --only functions`。

5. **Trigger 機制**
   - `users/{uid}` onWrite → `syncUserClaims(uid)`
   - 任何新增/修改使用者角色、部門、模組覆寫後，claims 會立即重算。
   - 使用者重新登入後即可取得最新權限，Security Rules 與 `usePermission` 均會生效。

## Firebase Hosting（Next.js）

1. **設定 `firebase.json` / `.firebaserc`**
   - `firebase.json` 內的 `site` 與 `.firebaserc` 的 `default` 項目需替換成實際的 Firebase Hosting 與 Project ID。

2. **部署步驟**
   ```bash
   npm install         # 根目錄
   npm run build       # 建置 Next.js
   npm run firebase:deploy   # 執行 next build + firebase deploy
   ```
   若僅需 Hosting，可改跑 `firebase deploy --only hosting`.

3. **提示**
   - Firebase CLI 需 12.9+，並已 login/use 正確專案。
   - Hosting 使用 frameworksBackend，自動處理 Next.js SSR，無需手動 rewrites。

