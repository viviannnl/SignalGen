import { createHmac, timingSafeEqual } from "crypto";

import { DISABLED_REPO_CONNECTION_CAPABILITIES } from "./repo-connection";
import type { RepoConnectionCapability } from "./types";

const DEFAULT_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const GITHUB_APP_ENV_KEYS = {
  appSlug: "SIGNALGEN_GITHUB_APP_SLUG",
  stateSecret: "SIGNALGEN_GITHUB_APP_STATE_SECRET",
} as const;

export const DISABLED_GITHUB_INSTALL_CAPABILITIES: Record<RepoConnectionCapability, boolean> = {
  ...DISABLED_REPO_CONNECTION_CAPABILITIES,
};

export type GitHubAppInstallConfig = {
  appSlug: string | null;
  hasStateSecret: boolean;
  missing: string[];
};

export type GitHubAppInstallStatePayload = {
  workspaceId: string;
  issuedAt: string;
  nonce: string;
};

export type GitHubAppInstallStateResult =
  | { ok: true; value: GitHubAppInstallStatePayload }
  | { ok: false; error: "MalformedState" | "InvalidStateSignature" | "ExpiredState" | "FutureIssuedState" };

export function readGitHubAppInstallConfig(
  env: Record<string, string | undefined> = process.env,
): GitHubAppInstallConfig {
  const appSlug = normalizeEnvValue(env[GITHUB_APP_ENV_KEYS.appSlug]);
  const stateSecret = normalizeEnvValue(env[GITHUB_APP_ENV_KEYS.stateSecret]);
  const missing: string[] = [];

  if (!appSlug) missing.push(GITHUB_APP_ENV_KEYS.appSlug);
  if (!stateSecret) missing.push(GITHUB_APP_ENV_KEYS.stateSecret);

  return {
    appSlug,
    hasStateSecret: Boolean(stateSecret),
    missing,
  };
}

export function getGitHubAppStateSecret(env: Record<string, string | undefined> = process.env): string | null {
  return normalizeEnvValue(env[GITHUB_APP_ENV_KEYS.stateSecret]);
}

export function buildGitHubAppInstallUrl(appSlug: string, state: string): string {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function buildGitHubAppInstallState({
  workspaceId,
  secret,
  now,
  nonce,
}: {
  workspaceId: string;
  secret: string;
  now?: string;
  nonce?: string;
}): string {
  const payload: GitHubAppInstallStatePayload = {
    workspaceId,
    issuedAt: now ?? new Date().toISOString(),
    nonce: nonce ?? crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signStatePayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function parseGitHubAppInstallState({
  state,
  secret,
  now,
  maxAgeMs = DEFAULT_STATE_MAX_AGE_MS,
  maxClockSkewMs = DEFAULT_STATE_CLOCK_SKEW_MS,
}: {
  state: string;
  secret: string;
  now?: string;
  maxAgeMs?: number;
  maxClockSkewMs?: number;
}): GitHubAppInstallStateResult {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "MalformedState" };
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signStatePayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, error: "InvalidStateSignature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, error: "MalformedState" };
  }

  if (!isStatePayload(payload)) {
    return { ok: false, error: "MalformedState" };
  }

  const issuedAtMs = new Date(payload.issuedAt).getTime();
  const nowMs = new Date(now ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false, error: "ExpiredState" };
  }
  if (issuedAtMs - nowMs > maxClockSkewMs) {
    return { ok: false, error: "FutureIssuedState" };
  }
  if (nowMs - issuedAtMs > maxAgeMs) {
    return { ok: false, error: "ExpiredState" };
  }

  return { ok: true, value: payload };
}

function normalizeEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function signStatePayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isStatePayload(value: unknown): value is GitHubAppInstallStatePayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.workspaceId === "string" &&
    candidate.workspaceId.length > 0 &&
    typeof candidate.issuedAt === "string" &&
    candidate.issuedAt.length > 0 &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.length > 0
  );
}
