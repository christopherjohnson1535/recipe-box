import { ApiError, createApi } from "./api";
import { apiInternalUrl } from "./config";

/** GET /api/setup from the server; `error` is set when the API can't answer. */
export async function setupStatus(): Promise<{ needsSetup: boolean; error?: ApiError }> {
  try {
    return await createApi({ baseUrl: apiInternalUrl() }).getSetup();
  } catch (e) {
    if (e instanceof ApiError) return { needsSetup: false, error: e };
    throw e;
  }
}
