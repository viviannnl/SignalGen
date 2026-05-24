import { afterEach, describe, expect, it, vi } from "vitest";

import { callHostedAgent, getHostedAgentConfig } from "./hosted-agent-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getHostedAgentConfig", () => {
  it("returns null when AGENT_WORKER_URL is not set", () => {
    vi.stubEnv("AGENT_WORKER_URL", "");

    expect(getHostedAgentConfig()).toBeNull();
  });

  it("throws when AGENT_WORKER_URL is set but AGENT_WORKER_SECRET is missing", () => {
    vi.stubEnv("AGENT_WORKER_URL", "https://example.com/process-run");
    vi.stubEnv("AGENT_WORKER_SECRET", "");

    expect(() => getHostedAgentConfig()).toThrow("AGENT_WORKER_SECRET is missing");
  });

  it("returns config when both vars are set", () => {
    vi.stubEnv("AGENT_WORKER_URL", "https://example.com/process-run");
    vi.stubEnv("AGENT_WORKER_SECRET", "mysecret");

    expect(getHostedAgentConfig()).toEqual({
      url: "https://example.com/process-run",
      secret: "mysecret",
    });
  });
});

describe("callHostedAgent", () => {
  it("calls the hosted URL with Bearer auth and returns result on success", async () => {
    const mockResult = {
      ok: true,
      runtime: "google-cloud-adk",
      processedRunIds: ["abc123"],
      processedCount: 1,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      }),
    );

    const config = { url: "https://example.com/process-run", secret: "mysecret" };
    const result = await callHostedAgent(config, "abc123");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/process-run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer mysecret" }),
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const config = { url: "https://example.com/process-run", secret: "bad" };

    await expect(callHostedAgent(config, "abc123")).rejects.toThrow("HTTP 401");
  });
});
