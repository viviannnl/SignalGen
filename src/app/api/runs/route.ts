import { NextResponse } from "next/server";

import { buildDemoRun } from "@/lib/demo-run";
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

export async function GET() {
  const db = await getSignalGenDb();
  const runs = await db
    .collection("runs")
    .find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json({ runs: runs.map(serializeRun) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateRunBody;
  const screenshotNames = body.screenshotNames?.filter(Boolean).slice(0, 20) ?? [];
  const run = buildDemoRun(screenshotNames);

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
}
