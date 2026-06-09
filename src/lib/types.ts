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
  runId?: string;
  workspaceId?: string;
  repoConnectionId?: string;
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
  repoConnectionId?: string;
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
  primarySignalId?: string;
  source: "dashboard_upload";
  status: SignalGenRunStatus;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  processingError?: string;
  workspaceId?: string;
  repoConnectionId?: string;
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

// RepoConnection — workspace-scoped GitHub repo connection
export type RepoConnectionCapability = "pr_creation" | "branch_push" | "issue_creation";
export type RepoConnectionStatus = "connected" | "disconnected" | "pending" | "error";

export type RepoConnection = {
  _id?: string;
  workspaceId: string;
  provider: "github";
  owner: string;
  repo: string;
  defaultBranch: string;
  installationId: string | null; // GitHub App installation ID, null until real App is installed
  capabilities: Record<RepoConnectionCapability, boolean>;
  status: RepoConnectionStatus;
  disabledReason?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

// ImplementationJob — first-class MongoDB document tracking a real PR automation job
export type ImplementationJobStatus =
  | "queued"
  | "blocked"
  | "running"
  | "failed"
  | "succeeded"
  | "cancelled"
  | "requires_attention";

export type ImplementationJob = {
  _id?: string;
  workspaceId: string;
  runId: string;
  signalId?: string;
  planId?: string;
  repoConnectionId: string;
  status: ImplementationJobStatus;
  branchName: string;
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  changedFiles?: string[];
  codegenSummary?: string;
  idempotencyKey: string; // hash of workspaceId+runId, prevents duplicates
  approvedByUserId: string;
  approvedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  errorClass?: string;
  errorMessage?: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
};

// AuditLog — immutable record of all auditable actions
export type AuditAction =
  | "repo_connection.created"
  | "repo_connection.updated"
  | "repo_connection.disabled"
  | "run.approved"
  | "run.rejected"
  | "implementation_job.created"
  | "implementation_job.gate_failed"
  | "implementation_job.started"
  | "implementation_job.retry_scheduled"
  | "implementation_job.succeeded"
  | "implementation_job.failed"
  | "implementation_job.requires_attention"
  | "implementation_job.cancelled";

export type AuditLog = {
  _id?: string;
  workspaceId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: "run" | "signal" | "plan" | "repo_connection" | "implementation_job";
  resourceId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};
