export type SignalGenRunStatus =
  | "uploaded"
  | "signal_detected"
  | "plan_ready"
  | "approved"
  | "pr_created"
  | "needs_review"
  | "insufficient_evidence";

export type SignalType = "bug" | "feature_request" | "friction" | "trust_objection" | "pricing" | "praise" | "noise";

export type SignalSeverity = "low" | "medium" | "high";

export type SignalDecision = "store_only" | "needs_more_evidence" | "propose_plan" | "urgent_review";

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

export type SignalGenRun = {
  _id?: string;
  source: "dashboard_upload";
  status: SignalGenRunStatus;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  screenshotNames: string[];
  comments: string[];
  signalClusters?: SignalCluster[];
  signal: {
    title: string;
    summary: string;
    confidence: number;
    evidence: string[];
  };
  plan: {
    recommendedChange: string;
    filesToChange: string[];
    guardrails: string[];
    acceptanceCriteria: string[];
  };
  pr?: {
    url?: string;
    previewUrl?: string;
  };
};
