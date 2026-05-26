import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../../lib/api-auth";

import { findGitHubInstallationByWorkspace } from "@/lib/github-installation-db";
import { listInstallationRepos, type GitHubRepo } from "@/lib/github-repos-client";

type GitHubReposResponse = {
  repos: GitHubRepo[];
};

type GitHubReposErrorResponse = {
  error: string;
};

function logGitHubReposError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function GET(request: Request): Promise<NextResponse<GitHubReposResponse | GitHubReposErrorResponse>> {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  try {
    const installation = await findGitHubInstallationByWorkspace(workspaceId);

    if (!installation) {
      return NextResponse.json<GitHubReposErrorResponse>(
        { error: "No GitHub App installation found for this workspace" },
        { status: 404 },
      );
    }

    const repos = await listInstallationRepos(installation.installationId);
    return NextResponse.json<GitHubReposResponse>({ repos });
  } catch (error) {
    logGitHubReposError("Failed to list GitHub installation repositories", error);
    return NextResponse.json<GitHubReposErrorResponse>(
      { error: "GitHub repos could not be loaded. Please try again." },
      { status: 503 },
    );
  }
}
