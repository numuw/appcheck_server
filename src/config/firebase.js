import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";

import * as dotenv from "dotenv";
dotenv.config();

const app = initializeApp({
  credential: cert(JSON.parse(process.env.SERVICE_ACCOUNT_JSON)),
});

const appCheck = getAppCheck(app);

export { appCheck };
