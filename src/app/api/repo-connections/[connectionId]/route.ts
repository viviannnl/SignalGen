import { NextResponse } from "next/server";

import type { RepoConnection } from "@/lib/types";

type RepoConnectionGetResponse = {
  connection: RepoConnection;
};

type RepoConnectionErrorResponse = {
  error: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse<RepoConnectionGetResponse | RepoConnectionErrorResponse>> {
  await params;

  return NextResponse.json<RepoConnectionErrorResponse>({ error: "Connection not found" }, { status: 404 });
}
