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

export type ImplementationStatus =
  | "queued"
  | "blocked"
  | "running"
  | "failed"
  | "succeeded"
  | "cancelled"
  | "requires_attention"
  | "ready_for_pr"
  | "pr_created";

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

export type SignalStatus =
  | "accumulating"
  | "needs_more_evidence"
  | "plan_ready"
  | "approved"
  | "rejected"
  | "implemented";

export type EvidenceItem = {
  id: string;
  runId: string;
  clusterType: SignalType;
  title: string;
  summary: string;
  commentIds: string[];
  frequency: number;
  confidence: number;
  severity: SignalSeverity;
  decision: SignalDecision;
  createdAt: string;
};

export type ProductSignal = {
  _id?: string;
  workspaceId?: string;
  type: SignalType;
  title: string;
  summary: string;
  signalKey: string;
  evidenceItemIds: string[];
  evidenceItems?: EvidenceItem[];
  strength: number;
  confidence: number;
  status: SignalStatus;
  currentPlanId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SignalPlanStatus = "draft" | "approved" | "rejected" | "implemented";

export type SignalPlan = {
  _id?: string;
  workspaceId?: string;
  signalId: string;
  recommendedChange: string;
  filesToChange: string[];
  guardrails: string[];
  acceptanceCriteria: string[];
  status: SignalPlanStatus;
  approvalDecision?: FounderDecisionRecord;
  createdAt: string;
  updatedAt: string;
};

export type SignalGenRun = {
  _id?: string;
  source: "dashboard_upload";
  status: SignalGenRunStatus;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  processingError?: string;
  workspaceId?: string;
  createdByUserId?: string;
  extractionDiagnostics?: {
    commentCount: number;
    screenshotCount: number;
    screenshotNames: string[];
  };
  screenshotNames: string[];
  comments: string[];
  extractedComments?: string[];
  evidenceItems?: EvidenceItem[];
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
