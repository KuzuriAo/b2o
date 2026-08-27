import { ProxyAgent, setGlobalDispatcher } from "undici";

let configuredProxyUrl: string | undefined;

/**
 * Routes every fetch() call this package makes through HTTPS_PROXY (or
 * https_proxy) if set -- e.g. mitmproxy, so anyone skeptical of
 * --dry-run/--verbose's own payload dump can independently decrypt and
 * read exactly what's actually sent to bambu2orca, not just trust this
 * tool's word for it. Node's native fetch (undici) does NOT respect
 * proxy environment variables on its own -- confirmed by testing (no
 * TLS-keylog support exists in undici at all, ruling out the
 * SSLKEYLOGFILE/Wireshark route entirely); this explicit wiring is what
 * actually makes HTTPS_PROXY do anything.
 *
 * Called defensively at the top of every exported network call in
 * convertClient.ts, so it applies whether this package is used as the
 * `b2o` CLI binary or imported as a library directly, with no separate
 * setup step. Cheap to call repeatedly -- only reconfigures the global
 * dispatcher when the proxy URL actually changes (env var newly set,
 * unset, or pointed elsewhere), not on every call.
 */
export function configureProxyFromEnv(): void {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxyUrl || proxyUrl === configuredProxyUrl) return;
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  configuredProxyUrl = proxyUrl;
}
