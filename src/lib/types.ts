export type SignalGenRunStatus =
  | "uploaded"
  | "signal_detected"
  | "plan_ready"
  | "approved"
  | "rejected"
  | "failed"
  | "pr_created"
  | "needs_review"
  | "insufficient_evidence";

export type SignalType = "bug" | "feature_request" | "friction" | "trust_objection" | "pricing" | "praise" | "noise";

export type SignalSeverity = "low" | "medium" | "high";

export type SignalDecision = "store_only" | "needs_more_evidence" | "propose_plan" | "urgent_review";

export type FounderDecisionAction = "approve" | "reject";

export type FounderDecisionRecord = {
  action: FounderDecisionAction;
  note: string;
  decidedAt: string;
  decidedBy: string;
};

export type ImplementationStatus = "queued" | "ready_for_pr" | "pr_created";

export type ImplementationPrDraft = {
  title: string;
  body: string;
  branchName: string;
  filesToInspect: string[];
  testCommands: string[];
  checklist: string[];
  previewUrl?: string;
};

export type ImplementationRecord = {
  status: ImplementationStatus;
  summary: string;
  branchName: string;
  guardrails: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  prDraft?: ImplementationPrDraft;
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

export type SignalGenRun = {
  _id?: string;
  source: "dashboard_upload";
  status: SignalGenRunStatus;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  processingError?: string;
  extractionDiagnostics?: {
    commentCount: number;
    screenshotCount: number;
    screenshotNames: string[];
  };
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
  founderDecision?: FounderDecisionRecord;
  implementation?: ImplementationRecord;
  pr?: {
    url?: string;
    previewUrl?: string;
  };
};
