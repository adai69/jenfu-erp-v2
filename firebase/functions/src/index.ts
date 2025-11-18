import * as functions from "firebase-functions/v1";
import { syncUserClaims } from "./syncUserClaims";

const SERVICE_ACCOUNT = "jenfu-erp-v2@appspot.gserviceaccount.com";

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

