import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setGlobalDispatcher = vi.fn();
const ProxyAgentCtor = vi.fn(function ProxyAgent(this: unknown, url: string) {
  return { __proxyUrl: url };
});

vi.mock("undici", () => ({
  setGlobalDispatcher,
  ProxyAgent: ProxyAgentCtor,
}));

describe("configureProxyFromEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    setGlobalDispatcher.mockClear();
    ProxyAgentCtor.mockClear();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
  });

  afterEach(() => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
  });

  it("does nothing when no proxy env var is set", async () => {
    const { configureProxyFromEnv } = await import("./proxyAgent.js");
    configureProxyFromEnv();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });

  it("sets a ProxyAgent pointed at HTTPS_PROXY when set", async () => {
    process.env.HTTPS_PROXY = "http://localhost:8080";
    const { configureProxyFromEnv } = await import("./proxyAgent.js");
    configureProxyFromEnv();
    expect(ProxyAgentCtor).toHaveBeenCalledWith("http://localhost:8080");
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("also honors lowercase https_proxy", async () => {
    process.env.https_proxy = "http://localhost:9090";
    const { configureProxyFromEnv } = await import("./proxyAgent.js");
    configureProxyFromEnv();
    expect(ProxyAgentCtor).toHaveBeenCalledWith("http://localhost:9090");
  });

  it("only reconfigures once for the same URL, even across repeated calls", async () => {
    process.env.HTTPS_PROXY = "http://localhost:8080";
    const { configureProxyFromEnv } = await import("./proxyAgent.js");
    configureProxyFromEnv();
    configureProxyFromEnv();
    configureProxyFromEnv();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
  });

  it("reconfigures if the proxy URL changes mid-process", async () => {
    process.env.HTTPS_PROXY = "http://localhost:8080";
    const { configureProxyFromEnv } = await import("./proxyAgent.js");
    configureProxyFromEnv();
    process.env.HTTPS_PROXY = "http://localhost:9999";
    configureProxyFromEnv();
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(2);
    expect(ProxyAgentCtor).toHaveBeenLastCalledWith("http://localhost:9999");
  });
});
