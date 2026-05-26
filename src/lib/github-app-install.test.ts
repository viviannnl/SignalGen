import { describe, expect, it } from "vitest";

import {
  buildGitHubAppInstallState,
  buildGitHubAppInstallUrl,
  parseGitHubAppInstallState,
  readGitHubAppInstallConfig,
} from "./github-app-install";

const NOW = "2026-05-25T13:00:00.000Z";
const SECRET = "test-state-secret-with-enough-length";

describe("GitHub App install helpers", () => {
  it("reads only the GitHub App slug and state-secret presence from env", () => {
    const config = readGitHubAppInstallConfig({
      SIGNALGEN_GITHUB_APP_SLUG: "signalgen-dev",
      SIGNALGEN_GITHUB_APP_STATE_SECRET: SECRET,
    });

    expect(config).toEqual({
      appSlug: "signalgen-dev",
      hasStateSecret: true,
      missing: [],
    });
  });

  it("reports missing config without exposing secret values", () => {
    const config = readGitHubAppInstallConfig({
      SIGNALGEN_GITHUB_APP_SLUG: " ",
      SIGNALGEN_GITHUB_APP_STATE_SECRET: " ",
    });

    expect(config).toEqual({
      appSlug: null,
      hasStateSecret: false,
      missing: ["SIGNALGEN_GITHUB_APP_SLUG", "SIGNALGEN_GITHUB_APP_STATE_SECRET"],
    });
  });

  it("builds an install URL for the configured GitHub App slug", () => {
    const url = buildGitHubAppInstallUrl("signalgen-dev", "state-value");

    expect(url).toBe("https://github.com/apps/signalgen-dev/installations/new?state=state-value");
  });

  it("round-trips a signed install state", () => {
    const state = buildGitHubAppInstallState({
      workspaceId: "workspace-1",
      secret: SECRET,
      now: NOW,
      nonce: "nonce-1",
    });

    const parsed = parseGitHubAppInstallState({ state, secret: SECRET, now: NOW });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toMatchObject({
        workspaceId: "workspace-1",
        issuedAt: NOW,
        nonce: "nonce-1",
      });
    }
  });

  it("rejects tampered install state", () => {
    const state = buildGitHubAppInstallState({
      workspaceId: "workspace-1",
      secret: SECRET,
      now: NOW,
      nonce: "nonce-1",
    });

    const parsed = parseGitHubAppInstallState({
      state: `${state.slice(0, -3)}abc`,
      secret: SECRET,
      now: NOW,
    });

    expect(parsed).toEqual({ ok: false, error: "InvalidStateSignature" });
  });

  it("rejects expired install state", () => {
    const state = buildGitHubAppInstallState({
      workspaceId: "workspace-1",
      secret: SECRET,
      now: NOW,
      nonce: "nonce-1",
    });

    const parsed = parseGitHubAppInstallState({
      state,
      secret: SECRET,
      now: "2026-05-26T13:00:01.000Z",
      maxAgeMs: 24 * 60 * 60 * 1000,
    });

    expect(parsed).toEqual({ ok: false, error: "ExpiredState" });
  });

  it("rejects states issued too far in the future", () => {
    const state = buildGitHubAppInstallState({
      workspaceId: "workspace-1",
      secret: SECRET,
      now: "2026-05-25T13:10:01.000Z",
      nonce: "nonce-1",
    });

    const parsed = parseGitHubAppInstallState({
      state,
      secret: SECRET,
      now: NOW,
      maxClockSkewMs: 5 * 60 * 1000,
    });

    expect(parsed).toEqual({ ok: false, error: "FutureIssuedState" });
  });
});
