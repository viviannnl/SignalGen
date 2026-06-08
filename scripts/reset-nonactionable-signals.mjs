#!/usr/bin/env node
import nextEnv from "@next/env";
import { MongoClient } from "mongodb";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const DATABASE_NAME = "signalgen";
const NON_ACTIONABLE_TYPES = ["noise", "praise"];
const INVALID_STATUSES = ["plan_ready", "approved", "rejected", "implemented"];

function redactHost(uri) {
  const parsed = new URL(uri);
  return parsed.host;
}

function looksProduction(uri, dbName) {
  const parsed = new URL(uri);
  const haystack = [parsed.host, parsed.pathname, parsed.searchParams.get("appName") ?? "", dbName]
    .join(" ")
    .toLowerCase();

  if (/\bprod(uction)?\b/.test(haystack) || /[-_.]prod[-_.]/.test(haystack)) return true;

  const isAtlas = parsed.host.toLowerCase().includes("mongodb.net");
  const hasNonProdMarker = /\b(dev|development|local|localhost|test|testing|stage|staging|sandbox|demo)\b/.test(haystack);
  return isAtlas && !hasNonProdMarker;
}

function summarizeSignal(signal) {
  return {
    _id: signal._id?.toString(),
    title: signal.title,
    type: signal.type,
    status: signal.status,
  };
}

function hasProductionCleanupOverride() {
  return process.env.ALLOW_PROD_CLEANUP === "1" || process.argv.includes("--i-understand-prod");
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI. Add it to the environment or the project's Next.js env files before running this cleanup.");
  }

  let host;
  try {
    host = redactHost(uri);
  } catch (error) {
    throw new Error(`MONGODB_URI is not a valid MongoDB URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`Database: ${DATABASE_NAME}`);
  console.log(`Host: ${host}`);

  if (looksProduction(uri, DATABASE_NAME) && !hasProductionCleanupOverride()) {
    console.warn("STOPPED: This MongoDB connection looks production-like. No writes were made. Get explicit reviewer/user approval before running cleanup here, then rerun with ALLOW_PROD_CLEANUP=1 or --i-understand-prod.");
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    const signals = db.collection("signals");
    const filter = {
      type: { $in: NON_ACTIONABLE_TYPES },
      status: { $in: INVALID_STATUSES },
    };

    const before = await signals.find(filter).sort({ updatedAt: -1, title: 1 }).toArray();
    console.log("BEFORE matched docs:");
    console.log(JSON.stringify(before.map(summarizeSignal), null, 2));

    if (before.length > 0) {
      const now = new Date().toISOString();
      const result = await signals.updateMany(filter, {
        $set: { status: "accumulating", updatedAt: now },
      });
      console.log(`Update result: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
    } else {
      console.log("Update result: matched=0, modified=0");
    }

    const after = before.length > 0
      ? await signals.find({ _id: { $in: before.map((signal) => signal._id) } }).sort({ updatedAt: -1, title: 1 }).toArray()
      : [];
    console.log("AFTER docs:");
    console.log(JSON.stringify(after.map(summarizeSignal), null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
