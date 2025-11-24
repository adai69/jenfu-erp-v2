import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { syncUserClaims } from "./syncUserClaims";
import {
  buildPermissionProfile,
  type PermissionModule,
  type UserRoleAssignment,
} from "./permissions";

// Node 20 Runtime 內建 fetch，這裡宣告最簡單型別避免 TypeScript 編譯錯誤。
// 不額外引入 node-fetch 依賴，以降低維護成本。
declare function fetch(input: string, init?: unknown): Promise<any>;

const SERVICE_ACCOUNT = "jenfu-erp-v2@appspot.gserviceaccount.com";
// 與前端相同的 Web API Key，用於呼叫 Firebase REST API 寄送設定密碼信。
const WEB_API_KEY = "AIzaSyASrFuFoYfs5RyS7Edd6NJSZbkuSdGOWtY";
const ALLOWED_ADMIN_EMAILS = ["dani@jenfu.com.tw"];
async function requesterCanCreateUsers(uid?: string, email?: string) {
  if (uid) {
    const docRef = firestore.doc(`users/${uid}`);
    const snapshot = await docRef.get();
    if (snapshot.exists) {
      const userData = snapshot.data() as {
        roles?: UserRoleAssignment[];
        overrides?: Partial<Record<PermissionModule, string[]>>;
      };
      const assignments = userData.roles ?? [];
      const profile = buildPermissionProfile(assignments);
      const actions = profile.users ?? [];
      if (actions.includes("create")) {
        return true;
      }
    }
  }

  if (email && ALLOWED_ADMIN_EMAILS.includes(email)) {
    return true;
  }

  return false;
}
const DEFAULT_PASSWORD = "12345678";

const app = admin.apps.length ? admin.app() : admin.initializeApp();
const firestore = app.firestore();
const auth = app.auth();

async function sendPasswordResetEmail(email: string) {
  const apiKey = WEB_API_KEY;

  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "sendPasswordResetEmail skipped: functions config web.api_key is not set.",
    );
    return;
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      // eslint-disable-next-line no-console
      console.error("sendPasswordResetEmail failed", response.status, text);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("sendPasswordResetEmail error", error);
  }
}

export const onUserWrite = functions
  .region("us-central1")
  .runWith({ serviceAccount: SERVICE_ACCOUNT })
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) {
      return;
    }
    const uid = context.params.uid as string;
    await syncUserClaims(uid);
  });

/**
 * Firestore 佇列：當前端在 userProvisioning 新增文件時，
 * 由此函式在後端建立 Firebase Auth 使用者與對應的 users 文件，
 * 並同步自訂 Claims。
 */
export const onUserProvisionRequest = functions
  .region("us-central1")
  .runWith({ serviceAccount: SERVICE_ACCOUNT })
  .firestore.document("userProvisioning/{requestId}")
  .onCreate(async (snapshot) => {
    const data = snapshot.data() as {
      requestedBy?: string;
      requestedByUid?: string;
      payload: {
        id: string;
        name: string;
        email: string;
        primaryRole: string;
        departments: string[];
        status: "active" | "inactive";
        roles: unknown[];
        overrides?: Record<string, unknown>;
      };
    };

    const requesterEmail = (data.requestedBy ?? "").toLowerCase();
    const requesterUid = typeof data.requestedByUid === "string" ? data.requestedByUid : undefined;
    const isAllowed = await requesterCanCreateUsers(requesterUid, requesterEmail);
    if (!isAllowed) {
      await snapshot.ref.update({
        state: "rejected",
        error: "permission-denied",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const payload = data.payload;
    if (
      !payload?.id ||
      !payload?.name ||
      !payload?.email ||
      !payload?.primaryRole ||
      !payload?.departments?.length ||
      !payload?.roles?.length
    ) {
      await snapshot.ref.update({
        state: "failed",
        error: "invalid-argument",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    try {
      const userRecord = await auth.createUser({
        email: payload.email.toLowerCase(),
        password: DEFAULT_PASSWORD,
        displayName: payload.name,
        disabled: payload.status === "inactive",
      });

      const uid = userRecord.uid;

      // 建立帳號後，透過 Firebase REST API 發送「設定密碼／重設密碼」信件，
      // 讓使用者自行設定第一次登入密碼。
      await sendPasswordResetEmail(payload.email.toLowerCase());

      const docData: Record<string, unknown> = {
        ...payload,
        email: payload.email.toLowerCase(),
      };

      await firestore.doc(`users/${uid}`).set(docData, { merge: true });
      await syncUserClaims(uid);

      await snapshot.ref.update({
        state: "completed",
        uid,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error("onUserProvisionRequest error", error);
      const errorCode = error?.code ?? "internal";
      await snapshot.ref.update({
        state: "failed",
        error: errorCode,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

