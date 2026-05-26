import { NextResponse } from "next/server";

import { resolveWorkspaceId } from "@/lib/workspace";

import {
  buildGitHubAppInstallState,
  buildGitHubAppInstallUrl,
  getGitHubAppStateSecret,
  readGitHubAppInstallConfig,
} from "../../../../lib/github-app-install";

type GitHubAppInstallConfigErrorResponse = {
  error: string;
  missing: string[];
};

export async function GET(
  request: Request,
): Promise<NextResponse<GitHubAppInstallConfigErrorResponse> | NextResponse<unknown>> {
  const config = readGitHubAppInstallConfig();
  const stateSecret = getGitHubAppStateSecret();

  if (!config.appSlug || !stateSecret) {
    return NextResponse.json<GitHubAppInstallConfigErrorResponse>(
      {
        error: "GitHub App install is not configured",
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  const workspaceId = resolveWorkspaceId(request);
  const state = buildGitHubAppInstallState({ workspaceId, secret: stateSecret });
  const installUrl = buildGitHubAppInstallUrl(config.appSlug, state);

  return NextResponse.redirect(installUrl, 307);
}
