import { NextResponse } from "next/server";

import { buildDemoRun, buildPendingRun } from "@/lib/demo-run";
import {
  extractCommentsFromScreenshots,
  RunCreationError,
  validateScreenshotFile,
  validateTotalUploadSize,
  type ScreenshotFile,
} from "@/lib/gemini-extraction";
import { getSignalGenDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

type CreateRunBody = {
  screenshotNames?: string[];
};

function serializeRun(run: Record<string, unknown>) {
  return {
    ...run,
    _id: run._id?.toString(),
  };
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

async function buildRunFromMultipart(request: Request) {
  const sizeError = validateTotalUploadSize(request.headers.get("content-length"));
  if (sizeError) throw new RunCreationError(sizeError, 413);

  const formData = await request.formData();
  const files = formData.getAll("screenshots").filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    throw new RunCreationError("Upload at least one screenshot before creating a SignalGen run.");
  }

  if (files.length > 5) {
    throw new RunCreationError("Upload at most 5 screenshots per SignalGen run.");
  }

  const screenshots = await Promise.all(files.map(fileToScreenshot));
  const comments = await extractCommentsFromScreenshots(screenshots);
  return buildPendingRun(
    screenshots.map((screenshot) => screenshot.name),
    comments,
    {
      commentCount: comments.length,
      screenshotCount: screenshots.length,
      screenshotNames: screenshots.map((screenshot) => screenshot.name),
    },
  );
}

async function buildRunFromJson(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateRunBody;
  const screenshotNames = body.screenshotNames?.filter(Boolean).slice(0, 20) ?? [];
  return buildDemoRun(screenshotNames);
}

export async function GET() {
  const db = await getSignalGenDb();
  const runs = await db.collection("runs").find({}).sort({ createdAt: -1 }).limit(20).toArray();

  return NextResponse.json({ runs: runs.map(serializeRun) });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const run = contentType.includes("multipart/form-data") ? await buildRunFromMultipart(request) : await buildRunFromJson(request);

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
