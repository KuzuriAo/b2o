import type { ConvertRequest, ConvertResponse, ErrorResponse, ProfileListResponse } from "./internal/shared/index.js";
import { configureProxyFromEnv } from "./proxyAgent.js";

export const DEFAULT_BASE_URL = "https://b2o.kuzuriao.com";

export class B2oApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "B2oApiError";
  }
}

async function throwFromErrorResponse(res: Response): Promise<never> {
  let body: ErrorResponse | undefined;
  try {
    body = (await res.json()) as ErrorResponse;
  } catch {
    // Body wasn't JSON -- fall through to a generic message below.
  }
  throw new B2oApiError(res.status, body?.error.code ?? "unknown_error", body?.error.message ?? `Request failed with status ${res.status}.`);
}

/** POST /v1/api-keys/request -- starts the magic-link flow. Always 200 server-side regardless of whether this email already has a key. */
export async function requestApiKey(email: string, baseUrl: string = DEFAULT_BASE_URL): Promise<void> {
  configureProxyFromEnv();
  const res = await fetch(`${baseUrl}/v1/api-keys/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await throwFromErrorResponse(res);
}

/** GET /v1/profiles[?diameter=...] -- public, unauthenticated. */
export async function listProfiles(diameter: string | undefined, baseUrl: string = DEFAULT_BASE_URL): Promise<ProfileListResponse> {
  configureProxyFromEnv();
  const url = new URL("/v1/profiles", baseUrl);
  if (diameter) url.searchParams.set("diameter", diameter);
  const res = await fetch(url);
  if (!res.ok) await throwFromErrorResponse(res);
  return (await res.json()) as ProfileListResponse;
}

/** POST /v1/convert, authenticated via X-Api-Key -- no /v1/guest-token call at all; the key is the entire trust boundary. */
export async function convert(apiKey: string, request: ConvertRequest, baseUrl: string = DEFAULT_BASE_URL): Promise<ConvertResponse> {
  configureProxyFromEnv();
  const res = await fetch(`${baseUrl}/v1/convert`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify(request),
  });
  if (!res.ok) await throwFromErrorResponse(res);
  return (await res.json()) as ConvertResponse;
}
