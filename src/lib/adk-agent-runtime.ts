import { stripMarkdownFence } from "./gemini-extraction";
import type { SignalCluster, SignalDecision, SignalGenRun, SignalGenRunStatus, SignalSeverity, SignalType } from "./types";

const BUG_WORDS = ["bug", "broken", "crash", "error", "fail", "cannot", "can't", "doesn't work", "stuck"];
const FEATURE_WORDS = ["can you add", "feature", "would love", "need", "wish", "support", "integration"];
const FRICTION_WORDS = ["confusing", "hard", "unclear", "don't understand", "takes too long", "generic"];
const TRUST_WORDS = ["trust", "fake", "scam", "safe", "secure", "ai-generated", "obviously ai"];
const PRICING_WORDS = ["price", "pricing", "expensive", "cost", "free", "trial", "subscription"];
const PRAISE_WORDS = ["love", "great", "helpful", "amazing", "awesome", "works well"];
const GEMINI_TIMEOUT_MS = 30_000;
const GEMINI_MODEL = "gemini-2.5-flash";
const HARDCODED_GUARDRAILS = [
  "No code changes before founder approval.",
  "Create a branch and PR instead of pushing directly to main.",
  "Do not touch secrets, auth, billing, or database migrations without explicit approval.",
  "Run build/tests before marking any PR ready for review.",
];

export type AgentRuntime = {
  kind: "adk";
  analyzeRun: (run: SignalGenRun) => Promise<Partial<SignalGenRun>> | Partial<SignalGenRun>;
};

export function classifyComment(text: string): SignalType {
  const lower = text.toLowerCase();

  if (BUG_WORDS.some((word) => lower.includes(word))) return "bug";
  if (FEATURE_WORDS.some((word) => lower.includes(word))) return "feature_request";
  if (TRUST_WORDS.some((word) => lower.includes(word))) return "trust_objection";
  if (PRICING_WORDS.some((word) => lower.includes(word))) return "pricing";
  if (FRICTION_WORDS.some((word) => lower.includes(word))) return "friction";
  if (PRAISE_WORDS.some((word) => lower.includes(word))) return "praise";

  return "noise";
}

function severityFor(type: SignalType, frequency: number): SignalSeverity {
  if (type === "bug" && frequency >= 2) return "high";
  if (["bug", "trust_objection", "pricing"].includes(type) && frequency >= 1) return "medium";
  if (["feature_request", "friction"].includes(type) && frequency >= 3) return "medium";
  return "low";
}

export function decideCluster(type: SignalType, frequency: number, severity: SignalSeverity): SignalDecision {
  if (type === "bug" && severity === "high" && frequency >= 2) return "propose_plan";
  if (type === "bug" && frequency === 1 && severity !== "low") return "urgent_review";
  if (["feature_request", "friction", "trust_objection"].includes(type) && frequency >= 3) return "propose_plan";
  if (["bug", "feature_request", "friction", "trust_objection", "pricing"].includes(type) && frequency >= 2) {
    return "needs_more_evidence";
  }
  return "store_only";
}

function titleFor(type: SignalType): string {
  switch (type) {
    case "bug":
      return "Repeated bug reports detected";
    case "feature_request":
      return "Repeated feature request detected";
    case "friction":
      return "Repeated product friction detected";
    case "trust_objection":
      return "Repeated trust objection detected";
    case "pricing":
      return "Pricing concern detected";
    case "praise":
      return "Positive feedback detected";
    case "noise":
      return "Low-signal feedback stored";
  }
}

function rationaleFor(type: SignalType, frequency: number, severity: SignalSeverity, decision: SignalDecision): string {
  if (decision === "propose_plan") {
    return `Evidence is strong enough to draft a plan: ${frequency} related ${type.replace("_", " ")} comment(s), severity ${severity}.`;
  }
  if (decision === "urgent_review") {
    return "Potentially severe issue detected; request founder review before planning changes.";
  }
  if (decision === "needs_more_evidence") {
    return "Pattern is emerging, but the agent should collect or wait for more evidence before proposing a code change.";
  }
  return "Evidence is too weak or noisy for action; store in memory only.";
}

type CommentInput = string | { id?: string; text: string };

export function buildSignalClusters(comments: CommentInput[]): SignalCluster[] {
  const grouped = new Map<SignalType, Array<{ id: string; text: string }>>();

  comments.forEach((comment, index) => {
    const item = typeof comment === "string" ? { id: `comment-${index + 1}`, text: comment } : { id: comment.id || `comment-${index + 1}`, text: comment.text };
    const type = classifyComment(item.text);
    grouped.set(type, [...(grouped.get(type) ?? []), item]);
  });

  return Array.from(grouped.entries()).map(([type, items]) => {
    const frequency = items.length;
    const severity = severityFor(type, frequency);
    const decision = decideCluster(type, frequency, severity);
    const confidence = Math.min(0.55 + frequency * 0.12, 0.95);

    return {
      id: `${type}-${frequency}`,
      type,
      title: titleFor(type),
      summary: `${frequency} related comment${frequency === 1 ? "" : "s"} classified as ${type.replace("_", " ")}.`,
      evidenceCommentIds: items.map((item) => item.id),
      severity,
      frequency,
      confidence,
      decision,
      rationale: rationaleFor(type, frequency, severity, decision),
    };
  });
}

export function selectTopCluster(clusters: SignalCluster[]): SignalCluster | undefined {
  const decisionRank: Record<SignalDecision, number> = {
    urgent_review: 4,
    propose_plan: 3,
    needs_more_evidence: 2,
    store_only: 1,
  };

  return [...clusters].sort((a, b) => {
    const byDecision = decisionRank[b.decision] - decisionRank[a.decision];
    if (byDecision !== 0) return byDecision;
    const byFrequency = b.frequency - a.frequency;
    if (byFrequency !== 0) return byFrequency;
    return b.confidence - a.confidence;
  })[0];
}

export function statusForDecision(decision?: SignalDecision): SignalGenRunStatus {
  if (decision === "propose_plan") return "plan_ready";
  if (decision === "urgent_review" || decision === "needs_more_evidence") return "needs_review";
  if (decision === "store_only" || !decision) return "insufficient_evidence";
  return "signal_detected";
}

function planFor(cluster: SignalCluster | undefined): SignalGenRun["plan"] {
  const guardrails = HARDCODED_GUARDRAILS;

  if (!cluster || cluster.decision !== "propose_plan") {
    return {
      recommendedChange: cluster
        ? "Store this signal in memory and wait for more evidence before proposing a product change."
        : "No actionable product signal was detected yet.",
      filesToChange: [],
      guardrails,
      acceptanceCriteria: ["Keep the run in memory for future clustering.", "Do not open a PR until evidence is stronger and the founder approves."],
    };
  }

  return {
    recommendedChange: `Draft a small, reviewable product improvement for: ${cluster.title}. Cite the evidence comments before asking for founder approval.`,
    filesToChange: ["Product UI/content file to be selected after founder approval"],
    guardrails,
    acceptanceCriteria: [
      "Plan cites the feedback comments that triggered it.",
      "Change is limited to approved product surfaces.",
      "Founder approval is captured before any repo edit or PR.",
      "Build/tests must pass before PR is marked ready for review.",
    ],
  };
}

export function analyzeRunWithAdkRuntime(run: SignalGenRun): Partial<SignalGenRun> {
  const signalClusters = buildSignalClusters(run.comments ?? []);
  const topCluster = selectTopCluster(signalClusters);
  const status = statusForDecision(topCluster?.decision);
  const evidence = (run.comments ?? []).filter((_, index) => topCluster?.evidenceCommentIds.includes(`comment-${index + 1}`));
  const now = new Date().toISOString();

  return {
    status,
    updatedAt: now,
    processedAt: now,
    signalClusters,
    signal: topCluster
      ? {
          title: topCluster.title,
          summary: topCluster.summary,
          confidence: topCluster.confidence,
          evidence,
        }
      : {
          title: "No actionable signal detected yet",
          summary: "The agent tick ran, but the current feedback was too sparse or noisy to classify.",
          confidence: 0,
          evidence: [],
        },
    plan: planFor(topCluster),
  };
}

type GeminiSignalCluster = {
  type: SignalType;
  title: string;
  summary: string;
  evidenceIndices: number[];
  severity: SignalSeverity;
  decision: SignalDecision;
  rationale: string;
  confidence: number;
};

type GeminiSignalAnalysisResponse = {
  clusters: GeminiSignalCluster[];
  topSignalIndex: number;
  implementationPlan: {
    recommendedChange: string;
    filesToChange: string[];
    acceptanceCriteria: string[];
  } | null;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function buildGeminiAnalysisPrompt(comments: string[]): string {
  const numberedComments = comments.map((comment, index) => `[${index + 1}] ${JSON.stringify(comment)}`).join("\n");

  return `You are SignalGen, an expert product analyst and AI feedback agent.

A founder has collected the following customer/social media feedback comments. Analyze them and identify the strongest product signal.

Comments (numbered for reference):
${numberedComments}

Instructions:
1. Classify and cluster semantically related comments into signal groups.
2. For each cluster, determine its type, severity, decision, and which original comment numbers belong.
3. Select the most actionable cluster as the top signal.
4. If the top signal's decision is "propose_plan", generate a specific implementation plan for the product change.

Signal types:
- "bug": crashes, errors, broken features, things that don't work
- "feature_request": requests for new features or integrations
- "friction": UX confusion, hard to use, unclear flows, slow processes
- "trust_objection": concerns about safety, AI-ness, authenticity, scam worries
- "pricing": cost or pricing concerns
- "praise": positive feedback
- "noise": irrelevant, off-topic, or ambiguous

Decision rules (apply these strictly):
- "propose_plan": Use when evidence is strong enough to recommend a product change. Minimum: 2+ bug reports, OR 3+ feature_request/friction/trust_objection comments
- "urgent_review": Single severe issue needing immediate founder attention (e.g., security concern, app completely broken)
- "needs_more_evidence": Pattern is emerging but not enough yet to act
- "store_only": Weak, noisy, ambiguous, or praise/noise signals

Return ONLY this JSON (no markdown fences, no explanation):
{
  "clusters": [
    {
      "type": "bug|feature_request|friction|trust_objection|pricing|praise|noise",
      "title": "Short descriptive title for this cluster",
      "summary": "1-2 sentence description of what customers are saying and why it matters",
      "evidenceIndices": [1, 2, 3],
      "severity": "low|medium|high",
      "decision": "store_only|needs_more_evidence|propose_plan|urgent_review",
      "rationale": "Specific explanation for why this decision was made, citing the evidence",
      "confidence": 0.85
    }
  ],
  "topSignalIndex": 0,
  "implementationPlan": {
    "recommendedChange": "Specific, concrete product change description",
    "filesToChange": ["Type of component or file that needs changing"],
    "acceptanceCriteria": ["Specific measurable success criterion"]
  }
}

Set "implementationPlan" to null if topSignal decision is "store_only" or "needs_more_evidence".`;
}

function isSignalType(value: unknown): value is SignalType {
  return ["bug", "feature_request", "friction", "trust_objection", "pricing", "praise", "noise"].includes(String(value));
}

function isSignalSeverity(value: unknown): value is SignalSeverity {
  return ["low", "medium", "high"].includes(String(value));
}

function isSignalDecision(value: unknown): value is SignalDecision {
  return ["store_only", "needs_more_evidence", "propose_plan", "urgent_review"].includes(String(value));
}

function validateGeminiAnalysisResponse(value: unknown, commentCount: number): GeminiSignalAnalysisResponse {
  if (!value || typeof value !== "object") throw new Error("Gemini signal analysis response was not an object.");

  const response = value as { clusters?: unknown; topSignalIndex?: unknown; implementationPlan?: unknown };
  if (!Array.isArray(response.clusters)) throw new Error("Gemini signal analysis response was missing clusters.");
  if (typeof response.topSignalIndex !== "number" || !Number.isInteger(response.topSignalIndex)) {
    throw new Error("Gemini signal analysis response had an invalid topSignalIndex.");
  }
  if (response.topSignalIndex < 0 || response.topSignalIndex >= response.clusters.length) {
    throw new Error("Gemini signal analysis topSignalIndex was out of range.");
  }

  const clusters = response.clusters.map((cluster, index): GeminiSignalCluster => {
    if (!cluster || typeof cluster !== "object") throw new Error(`Gemini signal cluster ${index} was not an object.`);
    const item = cluster as Record<string, unknown>;
    if (!isSignalType(item.type)) throw new Error(`Gemini signal cluster ${index} had an invalid type.`);
    if (!isSignalSeverity(item.severity)) throw new Error(`Gemini signal cluster ${index} had an invalid severity.`);
    if (!isSignalDecision(item.decision)) throw new Error(`Gemini signal cluster ${index} had an invalid decision.`);
    const evidenceIndices = item.evidenceIndices;
    if (!Array.isArray(evidenceIndices) || !evidenceIndices.every((evidenceIndex) => Number.isInteger(evidenceIndex) && evidenceIndex > 0 && evidenceIndex <= commentCount)) {
      throw new Error(`Gemini signal cluster ${index} had invalid evidence indices.`);
    }
    const type = item.type;
    const severity = item.severity;
    const requestedDecision = item.decision;
    const meetsProposeThreshold =
      (type === "bug" && evidenceIndices.length >= 2) ||
      (["feature_request", "friction", "trust_objection"].includes(type) && evidenceIndices.length >= 3);
    const decision = requestedDecision === "propose_plan" && !meetsProposeThreshold ? decideCluster(type, evidenceIndices.length, severity) : requestedDecision;

    return {
      type,
      title: typeof item.title === "string" ? item.title : titleFor(type),
      summary: typeof item.summary === "string" ? item.summary : "Gemini identified a related feedback pattern.",
      evidenceIndices,
      severity,
      decision,
      rationale: typeof item.rationale === "string" ? item.rationale : "Gemini selected this decision from the supplied feedback evidence.",
      confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : 0.7,
    };
  });

  const implementationPlan = response.implementationPlan && typeof response.implementationPlan === "object" ? (response.implementationPlan as Record<string, unknown>) : null;

  return {
    clusters,
    topSignalIndex: response.topSignalIndex,
    implementationPlan: implementationPlan
      ? {
          recommendedChange: typeof implementationPlan.recommendedChange === "string" ? implementationPlan.recommendedChange : "Implement the product change recommended by the top signal.",
          filesToChange: Array.isArray(implementationPlan.filesToChange) ? implementationPlan.filesToChange.map(String) : [],
          acceptanceCriteria: Array.isArray(implementationPlan.acceptanceCriteria) ? implementationPlan.acceptanceCriteria.map(String) : [],
        }
      : null,
  };
}

function mapGeminiAnalysisToRun(run: SignalGenRun, response: GeminiSignalAnalysisResponse): Partial<SignalGenRun> {
  const signalClusters: SignalCluster[] = response.clusters.map((cluster) => ({
    id: `${cluster.type}-${cluster.evidenceIndices.length}`,
    type: cluster.type,
    title: cluster.title,
    summary: cluster.summary,
    evidenceCommentIds: cluster.evidenceIndices.map((evidenceIndex) => `comment-${evidenceIndex}`),
    severity: cluster.severity,
    frequency: cluster.evidenceIndices.length,
    confidence: cluster.confidence,
    decision: cluster.decision,
    rationale: cluster.rationale,
  }));
  const topCluster = signalClusters[response.topSignalIndex];
  const sourceTopCluster = response.clusters[response.topSignalIndex];
  const now = new Date().toISOString();

  return {
    status: statusForDecision(topCluster.decision),
    updatedAt: now,
    processedAt: now,
    signalClusters,
    signal: {
      title: topCluster.title,
      summary: topCluster.summary,
      confidence: topCluster.confidence,
      evidence: sourceTopCluster.evidenceIndices.map((evidenceIndex) => run.comments[evidenceIndex - 1]).filter((comment): comment is string => Boolean(comment)),
    },
    plan: response.implementationPlan && topCluster.decision === "propose_plan"
      ? {
          recommendedChange: response.implementationPlan.recommendedChange,
          filesToChange: response.implementationPlan.filesToChange,
          guardrails: HARDCODED_GUARDRAILS,
          acceptanceCriteria: response.implementationPlan.acceptanceCriteria,
        }
      : planFor(topCluster),
  };
}

export async function analyzeRunWithGemini(run: SignalGenRun): Promise<Partial<SignalGenRun>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !run.comments?.length) {
    return analyzeRunWithAdkRuntime(run);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildGeminiAnalysisPrompt(run.comments) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini signal analysis failed with status ${response.status}.`);
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) throw new Error("Gemini signal analysis returned an empty response.");

    const parsed = JSON.parse(stripMarkdownFence(text)) as unknown;
    const analysis = validateGeminiAnalysisResponse(parsed, run.comments.length);
    return mapGeminiAnalysisToRun(run, analysis);
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn("Gemini signal analysis failed; falling back to keyword analysis.", reason);
    return analyzeRunWithAdkRuntime(run);
  } finally {
    clearTimeout(timeout);
  }
}

export const signalGenAdkRuntime: AgentRuntime = {
  kind: "adk",
  analyzeRun: analyzeRunWithGemini,
};
