import { cookies } from "next/headers";
import { createApi } from "./api";
import { apiInternalUrl } from "./config";

/** API client for Server Components: calls the API directly and forwards the visitor's cookies. */
export async function serverApi() {
  const cookie = (await cookies()).toString();
  return createApi({ baseUrl: apiInternalUrl(), cookie: cookie || undefined });
}
