import { NextResponse } from "next/server";

import { upsertGitHubInstallation } from "@/lib/github-installation-db";

import {
  getGitHubAppStateSecret,
  parseGitHubAppInstallState,
  readGitHubAppInstallConfig,
} from "../../../../../lib/github-app-install";

type GitHubAppInstallCallbackErrorResponse = {
  error: string;
  missing?: string[];
  reason?: string;
};

export async function GET(request: Request): Promise<NextResponse<GitHubAppInstallCallbackErrorResponse> | Response> {
  const config = readGitHubAppInstallConfig();
  const stateSecret = getGitHubAppStateSecret();

  if (!config.appSlug || !stateSecret) {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      {
        error: "GitHub App install is not configured",
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id")?.trim();
  const setupAction = url.searchParams.get("setup_action")?.trim();
  const state = url.searchParams.get("state")?.trim();

  if (!installationId) {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "installation_id is required" },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(installationId)) {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "installation_id must be numeric" },
      { status: 400 },
    );
  }

  if (setupAction !== "install" && setupAction !== "update") {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "setup_action must be install or update" },
      { status: 400 },
    );
  }

  if (!state) {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "state is required" },
      { status: 400 },
    );
  }

  const parsedState = parseGitHubAppInstallState({ state, secret: stateSecret });
  if (parsedState.ok === false) {
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "Invalid GitHub App install state", reason: parsedState.error },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  try {
    await upsertGitHubInstallation(
      {
        workspaceId: parsedState.value.workspaceId,
        installationId,
        setupAction,
        installedAt: now,
        status: "active",
      },
      now,
    );
  } catch (error) {
    console.error("GitHub App installation persistence failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json<GitHubAppInstallCallbackErrorResponse>(
      { error: "GitHub App installation could not be saved. Please try again." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(new URL("/dashboard", request.url), 302);
}
