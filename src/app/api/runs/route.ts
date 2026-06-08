import { NextResponse } from "next/server";

import { getApiAuthContextOrResponse } from "../../../lib/api-auth";

import { buildDemoRun, buildPendingRun } from "@/lib/demo-run";
import {
  extractCommentsFromScreenshots,
  RunCreationError,
  validateScreenshotFile,
  validateTotalUploadSize,
  type ScreenshotFile,
} from "@/lib/gemini-extraction";
import { getSignalGenDb } from "@/lib/mongodb";
import { findRepoConnectionById } from "@/lib/repo-connection-db";
import { buildWorkspaceRepoFilter, resolveRepoConnectionId } from "@/lib/workspace";
import { findPrimarySignalIdForRun } from "../../../lib/signal-run-resolution";
import type { ProductSignal, SignalGenRun } from "../../../lib/types";

export const dynamic = "force-dynamic";

type CreateRunBody = {
  repoConnectionId?: string;
  screenshotNames?: string[];
  comments?: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function serializeRun(run: SignalGenRun & Record<string, unknown>): SignalGenRun & { _id?: string } {
  return {
    ...run,
    _id: run._id?.toString(),
  };
}

function runIdString(run: Record<string, unknown>) {
  return run._id?.toString();
}

function addSignalToRunMap(runSignalsByRunId: Map<string, ProductSignal[]>, signal: ProductSignal) {
  const runIds = signal.evidenceItems?.map((item) => item.runId).filter((id): id is string => Boolean(id)) ?? [];
  for (const runId of new Set(runIds)) {
    const existing = runSignalsByRunId.get(runId) ?? [];
    existing.push(signal);
    runSignalsByRunId.set(runId, existing);
  }
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "screenshot";
}

async function fileToScreenshot(file: File): Promise<ScreenshotFile> {
  const preview = {
    name: safeFileName(file.name || "screenshot"),
    type: file.type,
    size: file.size,
  };
  const validationError = validateScreenshotFile(preview);
  if (validationError) {
    throw new RunCreationError(validationError);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    ...preview,
    data: buffer.toString("base64"),
  };
}

async function validateRepoConnectionForWorkspace(repoConnectionId: string, workspaceId: string) {
  const connection = await findRepoConnectionById(repoConnectionId);
  if (!connection || connection.workspaceId !== workspaceId || connection.status !== "connected") {
    throw new RunCreationError("Choose a connected repo before creating a SignalGen run.");
  }
  return connection;
}

async function buildRunFromMultipart(request: Request, workspaceId: string) {
  const sizeError = validateTotalUploadSize(request.headers.get("content-length"));
  if (sizeError) throw new RunCreationError(sizeError, 413);

  const formData = await request.formData();
  const repoConnectionId = formData.get("repoConnectionId");
  if (!isNonEmptyString(repoConnectionId)) {
    throw new RunCreationError("Choose a repo before creating a SignalGen run.");
  }
  await validateRepoConnectionForWorkspace(repoConnectionId.trim(), workspaceId);
  const files = formData.getAll("screenshots").filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    throw new RunCreationError("Upload at least one screenshot before creating a SignalGen run.");
  }

  if (files.length > 5) {
    throw new RunCreationError("Upload at most 5 screenshots per SignalGen run.");
  }

  const screenshots = await Promise.all(files.map(fileToScreenshot));
  const comments = await extractCommentsFromScreenshots(screenshots);
  return {
    ...buildPendingRun(
      screenshots.map((screenshot) => screenshot.name),
      comments,
      {
        commentCount: comments.length,
        screenshotCount: screenshots.length,
        screenshotNames: screenshots.map((screenshot) => screenshot.name),
      },
    ),
    repoConnectionId: repoConnectionId.trim(),
  };
}

async function buildRunFromJson(request: Request, workspaceId: string) {
  const body = (await request.json().catch(() => ({}))) as CreateRunBody;
  if (!isNonEmptyString(body.repoConnectionId)) {
    throw new RunCreationError("Choose a repo before creating a SignalGen run.");
  }
  await validateRepoConnectionForWorkspace(body.repoConnectionId.trim(), workspaceId);
  const screenshotNames = body.screenshotNames?.filter(Boolean).slice(0, 20) ?? [];
  const comments = body.comments?.filter(Boolean).slice(0, 100) ?? [];
  const runData = comments.length > 0 ? buildPendingRun(screenshotNames, comments) : buildDemoRun(screenshotNames);
  return { ...runData, repoConnectionId: body.repoConnectionId.trim() };
}

export async function GET(request: Request) {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const repoConnectionId = resolveRepoConnectionId(request);
  if (!repoConnectionId) {
    return NextResponse.json({ error: "Choose a repo before loading SignalGen runs." }, { status: 400 });
  }
  try {
    await validateRepoConnectionForWorkspace(repoConnectionId, workspaceId);
  } catch (error) {
    if (error instanceof RunCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const db = await getSignalGenDb();
  const repoFilter = buildWorkspaceRepoFilter(workspaceId, repoConnectionId);
  const runs = await db.collection("runs").find(repoFilter).sort({ createdAt: -1 }).limit(20).toArray();
  const runIds = runs.map(runIdString).filter((runId): runId is string => Boolean(runId));
  const runSignalsByRunId = new Map<string, ProductSignal[]>();

  if (runIds.length > 0) {
    const candidateSignals = (await db
      .collection("signals")
      .find({ ...repoFilter, "evidenceItems.runId": { $in: runIds } })
      .toArray()) as unknown as ProductSignal[];
    for (const signal of candidateSignals) {
      addSignalToRunMap(runSignalsByRunId, signal);
    }
  }

  return NextResponse.json({
    runs: runs.map((run) => {
      const serializedRun = serializeRun(run as unknown as SignalGenRun & Record<string, unknown>);
      const primarySignalId = serializedRun._id ? findPrimarySignalIdForRun(serializedRun, runSignalsByRunId.get(serializedRun._id) ?? []) : undefined;
      return primarySignalId ? { ...serializedRun, primarySignalId } : serializedRun;
    }),
  });
}

export async function POST(request: Request) {
  const auth = await getApiAuthContextOrResponse(request);
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const runData = contentType.includes("multipart/form-data") ? await buildRunFromMultipart(request, workspaceId) : await buildRunFromJson(request, workspaceId);
    const run = { ...runData, workspaceId };

    const db = await getSignalGenDb();
    const result = await db.collection("runs").insertOne(run);

    return NextResponse.json(
      {
        run: {
          ...run,
          _id: result.insertedId.toString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Could not create SignalGen run", error);

    if (error instanceof RunCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Could not create a SignalGen run. Check server logs for details.",
      },
      { status: 500 },
    );
  }
}
