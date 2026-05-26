import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../../lib/api-auth";


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

  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const state = buildGitHubAppInstallState({ workspaceId, secret: stateSecret });
  const installUrl = buildGitHubAppInstallUrl(config.appSlug, state);

  return NextResponse.redirect(installUrl, 307);
}
