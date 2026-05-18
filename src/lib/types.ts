export type SignalGenRunStatus =
  | "uploaded"
  | "signal_detected"
  | "plan_ready"
  | "approved"
  | "pr_created"
  | "needs_review";

export type SignalGenRun = {
  _id?: string;
  source: "dashboard_upload";
  status: SignalGenRunStatus;
  createdAt: string;
  updatedAt: string;
  screenshotNames: string[];
  comments: string[];
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
