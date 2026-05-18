import type { FounderDecisionAction, FounderDecisionRecord, SignalGenRun } from "./types";

export class FounderDecisionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FounderDecisionError";
  }
}

export type ApplyFounderDecisionInput = {
  action: FounderDecisionAction;
  note?: unknown;
  decidedBy: string;
  now?: string;
};

export type FounderDecisionUpdate = Pick<SignalGenRun, "status" | "updatedAt" | "founderDecision">;

export function applyFounderDecision(run: SignalGenRun, input: ApplyFounderDecisionInput): FounderDecisionUpdate {
  if (input.action !== "approve" && input.action !== "reject") {
    throw new FounderDecisionError("Decision action must be approve or reject.", 400);
  }

  if (run.status !== "plan_ready") {
    throw new FounderDecisionError("Only plan-ready runs can be approved or rejected.", 409);
  }

  const decidedAt = input.now ?? new Date().toISOString();
  const rawNote = input.note ?? "";
  if (typeof rawNote !== "string") {
    throw new FounderDecisionError("Decision note must be text.", 400);
  }
  const note = rawNote.trim();
  if (note.length > 1000) {
    throw new FounderDecisionError("Decision note must be 1000 characters or fewer.", 400);
  }

  const founderDecision: FounderDecisionRecord = {
    action: input.action,
    note,
    decidedAt,
    decidedBy: input.decidedBy,
  };

  return {
    status: input.action === "approve" ? "approved" : "rejected",
    updatedAt: decidedAt,
    founderDecision,
  };
}
