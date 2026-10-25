import { createApi } from "./api";
import { apiInternalUrl } from "./config";

/** Whether the server offers Sign in with Google (GET /api/auth/providers). Any failure means no: the password form still works. */
export async function googleSignInOn(): Promise<boolean> {
  try {
    return (await createApi({ baseUrl: apiInternalUrl() }).authProviders()).google === true;
  } catch {
    return false;
  }
}
