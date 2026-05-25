import { getSignalGenDb } from "@/lib/mongodb";

export type GitHubInstallation = {
  _id?: string;
  workspaceId: string;
  installationId: string;
  setupAction: "install" | "update";
  installedAt: string;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  updatedAt: string;
};

type GitHubInstallationDocument = Omit<GitHubInstallation, "_id"> & {
  _id?: { toString(): string };
};

function serializeGitHubInstallation(doc: GitHubInstallationDocument): GitHubInstallation {
  return {
    ...doc,
    _id: doc._id?.toString(),
  };
}

function logPersistenceError(message: string, error: unknown) {
  console.error(message, { errorName: error instanceof Error ? error.name : typeof error });
}

export async function upsertGitHubInstallation(
  installation: Omit<GitHubInstallation, "_id" | "createdAt" | "updatedAt">,
  now?: string,
): Promise<void> {
  const ts = now ?? new Date().toISOString();

  try {
    const db = await getSignalGenDb();
    await db.collection("github_installations").updateOne(
      { workspaceId: installation.workspaceId, installationId: installation.installationId },
      {
        $set: {
          ...installation,
          updatedAt: ts,
        },
        $setOnInsert: {
          createdAt: ts,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logPersistenceError("Failed to persist GitHub installation metadata", error);
    throw error;
  }
}

export async function findGitHubInstallationByWorkspace(workspaceId: string): Promise<GitHubInstallation | null> {
  try {
    const db = await getSignalGenDb();
    const doc = await db
      .collection<GitHubInstallationDocument>("github_installations")
      .findOne({ workspaceId }, { sort: { updatedAt: -1 } });

    return doc ? serializeGitHubInstallation(doc) : null;
  } catch (error) {
    logPersistenceError("Failed to read GitHub installation metadata", error);
    throw error;
  }
}
