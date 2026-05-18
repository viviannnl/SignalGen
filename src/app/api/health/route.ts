import { NextResponse } from "next/server";

import { getSignalGenDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getSignalGenDb();
  await db.command({ ping: 1 });

  return NextResponse.json({
    ok: true,
    database: "signalgen",
    project: process.env.GOOGLE_CLOUD_PROJECT ?? null,
  });
}
