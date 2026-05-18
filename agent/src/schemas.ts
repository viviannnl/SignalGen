export type SignalType =
  | "bug"
  | "feature_request"
  | "friction"
  | "trust_objection"
  | "pricing"
  | "praise"
  | "noise";

export type SignalSeverity = "low" | "medium" | "high";

export type SignalDecision =
  | "store_only"
  | "needs_more_evidence"
  | "propose_plan"
  | "urgent_review";

export type RunStatus =
  | "uploaded"
  | "signal_detected"
  | "insufficient_evidence"
  | "needs_review"
  | "plan_ready"
  | "approved"
  | "pr_created";

export type ExtractedComment = {
  id: string;
  text: string;
  source?: string;
};

export type SignalCluster = {
  id: string;
  type: SignalType;
  title: string;
  summary: string;
  evidenceCommentIds: string[];
  severity: SignalSeverity;
  frequency: number;
  confidence: number;
  decision: SignalDecision;
  rationale: string;
};

export type ImplementationPlan = {
  title: string;
  summary: string;
  proposedFiles: string[];
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high";
};

export type SignalGenRun = {
  _id?: string;
  source?: string;
  status: RunStatus;
  screenshotNames?: string[];
  extractedComments?: string[] | ExtractedComment[];
  signalClusters?: SignalCluster[];
  topSignal?: {
    title: string;
    summary?: string;
    confidence?: number;
    evidence?: string[];
  };
  implementationPlan?: ImplementationPlan;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ProcessRunResult = {
  runId: string;
  status: RunStatus;
  signalClusters: SignalCluster[];
  topSignal?: SignalGenRun["topSignal"];
  implementationPlan?: ImplementationPlan;
};
