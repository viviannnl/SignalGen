import { NextResponse } from "next/server";

import {
  DISABLED_GITHUB_INSTALL_CAPABILITIES,
  getGitHubAppStateSecret,
  parseGitHubAppInstallState,
  readGitHubAppInstallConfig,
} from "../../../../../lib/github-app-install";

type GitHubAppInstallCallbackResponse = {
  installation: {
    installationId: string;
    setupAction: "install" | "update";
    workspaceId: string;
    status: "pending_repo_selection";
    capabilities: typeof DISABLED_GITHUB_INSTALL_CAPABILITIES;
  };
  message: string;
};

type GitHubAppInstallCallbackErrorResponse = {
  error: string;
  missing?: string[];
  reason?: string;
};

export async function GET(
  request: Request,
): Promise<NextResponse<GitHubAppInstallCallbackResponse | GitHubAppInstallCallbackErrorResponse>> {
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

  return NextResponse.json<GitHubAppInstallCallbackResponse>({
    installation: {
      installationId,
      setupAction,
      workspaceId: parsedState.value.workspaceId,
      status: "pending_repo_selection",
      capabilities: { ...DISABLED_GITHUB_INSTALL_CAPABILITIES },
    },
    message:
      "GitHub App installation received. Select and verify a repository before any write capability can be enabled.",
  });
}
