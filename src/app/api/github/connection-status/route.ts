import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../../lib/api-auth";

import { findGitHubInstallationByWorkspace } from "@/lib/github-installation-db";
import { listRepoConnectionsByWorkspace } from "@/lib/repo-connection-db";
import type { RepoConnection } from "@/lib/types";

type ConnectionStatusResponse =
  | { status: "disconnected" }
  | { status: "installed"; installationId: string }
  | { status: "connected"; installationId: string; repoConnection: RepoConnection; repoConnections: RepoConnection[] };

type ConnectionStatusErrorResponse = {
  error: string;
};

function logConnectionStatusError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function GET(
  request: Request,
): Promise<NextResponse<ConnectionStatusResponse | ConnectionStatusErrorResponse>> {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  try {
    const installation = await findGitHubInstallationByWorkspace(workspaceId);

    if (!installation) {
      return NextResponse.json<ConnectionStatusResponse>({ status: "disconnected" });
    }

    const connections = await listRepoConnectionsByWorkspace(workspaceId);
    const connectedConnections = connections.filter((connection) => connection.status === "connected");
    const connected = connectedConnections[0];

    if (!connected) {
      return NextResponse.json<ConnectionStatusResponse>({
        status: "installed",
        installationId: installation.installationId,
      });
    }

    return NextResponse.json<ConnectionStatusResponse>({
      status: "connected",
      installationId: installation.installationId,
      repoConnection: connected,
      repoConnections: connectedConnections,
    });
  } catch (error) {
    logConnectionStatusError("Failed to load GitHub connection status", error);
    return NextResponse.json<ConnectionStatusErrorResponse>(
      { error: "GitHub connection status could not be loaded. Please try again." },
      { status: 503 },
    );
  }
}
