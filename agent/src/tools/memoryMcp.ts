import { MongoClient, type Document } from "mongodb";
import "dotenv/config";

export type MemorySearchInput = {
  query: string;
  limit?: number;
};

export type MemorySearchResult = {
  matches: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  warning?: string;
};

let clientPromise: Promise<MongoClient> | undefined;

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "Unknown error";
}

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  clientPromise ??= new MongoClient(uri).connect();
  return clientPromise;
}

export async function searchProductMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
  const { query, limit = 5 } = input;

  if (!process.env.MONGODB_URI) {
    return {
      matches: [],
      warning: "MONGODB_URI not set — cannot search past signals.",
    };
  }

  try {
    const client = await getClient();
    const runs = client.db("signalgen").collection("runs");

    const queryRegex = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const docs = await runs
      .find({
        status: { $in: ["plan_ready", "approved", "pr_created"] },
        $or: [
          { "signal.title": { $regex: queryRegex, $options: "i" } },
          { "signal.summary": { $regex: queryRegex, $options: "i" } },
          { "plan.recommendedChange": { $regex: queryRegex, $options: "i" } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return {
      matches: docs.map((doc: Document) => ({
        id: doc._id?.toString() ?? "",
        title: (doc.signal as { title?: string } | undefined)?.title ?? "Unknown signal",
        summary: (doc.signal as { summary?: string } | undefined)?.summary ?? "",
      })),
    };
  } catch (error) {
    return { matches: [], warning: `Memory search failed: ${safeErrorMessage(error)}` };
  }
}
