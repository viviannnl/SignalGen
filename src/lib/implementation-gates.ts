import { isCapabilityEnabled } from "./repo-connection";
import type { ImplementationJob, RepoConnection } from "@/lib/types";

export type GateResult = { passed: true } | { passed: false; gate: string; reason: string };

export type GateContext = {
  workspaceId: string;
  repoConnection: RepoConnection | null;
  installationToken: string | null;
  requestingUserId: string;
};

export function checkAllGates(job: ImplementationJob, context: GateContext): GateResult {
  if (job.workspaceId !== context.workspaceId) {
    return { passed: false, gate: "WorkspaceMatch", reason: "Workspace mismatch" };
  }

  if (context.repoConnection === null) {
    return { passed: false, gate: "RepoConnectionPresent", reason: "No repo connection" };
  }

  if (context.repoConnection.status !== "connected") {
    return { passed: false, gate: "RepoConnectionStatus", reason: "Repo connection is not connected" };
  }

  if (context.repoConnection._id?.toString() !== job.repoConnectionId) {
    return { passed: false, gate: "RepoConnectionMatch", reason: "Repo connection ID mismatch" };
  }

  if (!isCapabilityEnabled(context.repoConnection, "pr_creation")) {
    return { passed: false, gate: "CapabilityEnabled", reason: "pr_creation capability is disabled" };
  }

  if (typeof job.approvedByUserId !== "string" || job.approvedByUserId.length === 0) {
    return { passed: false, gate: "ExplicitApproval", reason: "No explicit approval" };
  }

  if (job.approvedByUserId !== context.requestingUserId) {
    return { passed: false, gate: "ApproverMatch", reason: "Requester does not match approver" };
  }

  if (context.installationToken === null || context.installationToken.length === 0) {
    return { passed: false, gate: "InstallationToken", reason: "GitHub installation token not available" };
  }

  return { passed: true };
}
