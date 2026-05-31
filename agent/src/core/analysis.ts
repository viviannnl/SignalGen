import type {
  Plan,
  RunStatus,
  SignalCluster,
  SignalDecision,
  SignalGenRun,
  SignalSeverity,
  SignalType,
} from "../schemas.js";

const BUG_WORDS = ["bug", "broken", "crash", "error", "fail", "cannot", "can't", "doesn't work", "stuck", "不能用", "报错", "坏了", "失败", "卡住"];
const FEATURE_WORDS = ["can you add", "feature", "would love", "need", "wish", "support", "integration", "能不能", "可以", "有没有", "选择", "支持"];
const FRICTION_WORDS = ["confusing", "hard", "unclear", "don't understand", "takes too long", "generic", "ugly", "丑", "难用", "不好看", "不清楚"];
const TRUST_WORDS = ["trust", "fake", "scam", "safe", "secure", "ai-generated", "obviously ai", "安全", "真假", "骗子"];
const PRICING_WORDS = ["price", "pricing", "expensive", "cost", "free", "trial", "subscription", "价格", "贵", "免费", "订阅"];
const PRAISE_WORDS = ["love", "great", "helpful", "amazing", "awesome", "works well", "save my life", "喜欢", "感谢", "非常好", "解决痛点"];
const GEMINI_TIMEOUT_MS = 30_000;
const GEMINI_MODEL = "gemini-2.5-flash";
const HARDCODED_GUARDRAILS = [
  "No code changes before founder approval.",
  "Create a branch and PR instead of pushing directly to main.",
  "Do not touch secrets, auth, billing, or database migrations without explicit approval.",
  "Run build/tests before marking any PR ready for review.",
];

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

type SignalTopic = {
  key: string;
  title: string;
  summary: string;
};

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

function hasResumeContext(lower: string): boolean {
  return lower.includes("resume") || lower.includes("cv") || lower.includes("简历");
}

function topicsForComment(text: string): Array<{ type: SignalType; topic: SignalTopic }> {
  const lower = text.toLowerCase();
  const topics: Array<{ type: SignalType; topic: SignalTopic }> = [];
  const resumeContext = hasResumeContext(lower);

  if (resumeContext && (lower.includes("submit") || lower.includes("apply") || lower.includes("application") || lower.includes("投") || lower.includes("递交"))) {
    topics.push({
      type: "feature_request",
      topic: {
        key: "direct-resume-submission",
        title: "Direct resume submission",
        summary: "Users want the product to submit or apply with their resume directly, not only generate cover-letter material.",
      },
    });
  }

  if (resumeContext && (lower.includes("format") || lower.includes("type") || lower.includes("pdf") || lower.includes("docx") || lower.includes("格式"))) {
    topics.push({
      type: "feature_request",
      topic: {
        key: "additional-resume-format-options",
        title: "Additional resume format options",
        summary: "Users want more supported resume format choices when using the resume flow.",
      },
    });
  }

  if (lower.includes("ui") || lower.includes("ugly") || lower.includes("丑") || lower.includes("不好看")) {
    topics.push({
      type: "friction",
      topic: {
        key: "ui-visual-polish-concern",
        title: "UI visual polish concern",
        summary: "Users are reacting negatively to the product's visual design or polish.",
      },
    });
  }

  if (topics.length > 0) return topics;

  const type = classifyComment(text);
  if (type === "praise" && (lower.includes("save my life") || lower.includes("喜欢") || lower.includes("非常好") || lower.includes("感谢") || lower.includes("解决痛点"))) {
    return [
      {
        type,
        topic: {
          key: "positive-product-validation",
          title: "Positive product validation",
          summary: "Users are expressing satisfaction that the product idea solves a real pain point.",
        },
      },
    ];
  }

  return [
    {
      type,
      topic: {
        key: type,
        title: titleFor(type),
        summary: "Related feedback was grouped by signal type because no narrower topic was detected.",
      },
    },
  ];
}

type CommentInput = string | { id?: string; text: string };

export function buildSignalClusters(comments: CommentInput[]): SignalCluster[] {
  const grouped = new Map<string, { type: SignalType; topic: SignalTopic; items: Array<{ id: string; text: string }> }>();

  comments.forEach((comment, index) => {
    const item = typeof comment === "string" ? { id: `comment-${index + 1}`, text: comment } : { id: comment.id || `comment-${index + 1}`, text: comment.text };

    for (const { type, topic } of topicsForComment(item.text)) {
      const groupKey = `${type}:${topic.key}`;
      const existing = grouped.get(groupKey);

      if (existing) {
        existing.items.push(item);
      } else {
        grouped.set(groupKey, { type, topic, items: [item] });
      }
    }
  });

  return Array.from(grouped.values()).map(({ type, topic, items }) => {
    const frequency = items.length;
    const severity = severityFor(type, frequency);
    const decision = decideCluster(type, frequency, severity);
    const confidence = Math.min(0.55 + frequency * 0.12, 0.95);

    return {
      id: `${type}-${topic.key}-${frequency}`,
      type,
      title: topic.title,
      summary: topic.key === type ? `${frequency} related comment${frequency === 1 ? "" : "s"} classified as ${type.replace("_", " ")}.` : topic.summary,
      evidenceCommentIds: items.map((item) => item.id),
      severity,
      frequency,
      confidence,
      decision,
      rationale: rationaleFor(type, frequency, severity, decision),
    };
  });
}

function selectTopCluster(clusters: SignalCluster[]): SignalCluster | undefined {
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

function statusForDecision(decision?: SignalDecision): RunStatus {
  if (decision === "propose_plan") return "plan_ready";
  if (decision === "urgent_review" || decision === "needs_more_evidence") return "needs_review";
  if (decision === "store_only" || !decision) return "insufficient_evidence";
  return "signal_detected";
}

function planFor(cluster: SignalCluster | undefined): Plan | undefined {
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

function analyzeRunWithAdkRuntime(run: SignalGenRun): Partial<SignalGenRun> {
  const comments = run.comments ?? [];
  const signalClusters = buildSignalClusters(comments);
  const topCluster = selectTopCluster(signalClusters);
  const status = statusForDecision(topCluster?.decision);
  const evidence = comments.filter((_, index) => topCluster?.evidenceCommentIds.includes(`comment-${index + 1}`));
  const now = new Date().toISOString();

  return {
    status,
    updatedAt: now,
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

A founder has collected the following customer/social media feedback comments. Analyze them and identify every distinct product signal.

Comments (numbered for reference):
${numberedComments}

Instructions:
1. Create one cluster per atomic user need, pain point, objection, praise theme, or bug. Do NOT merge separate asks just because they share the same signal type.
2. For each cluster, determine its type, severity, decision, and which original comment numbers belong.
3. Select the most actionable cluster as the top signal.
4. If the top signal's decision is "propose_plan", generate a specific implementation plan for that one top product change.

Atomic clustering rules:
- A direct-resume-submission request and a resume-format-options request are two separate feature_request clusters, even though both mention resumes.
- A UI/visual-polish complaint is a friction cluster, separate from feature requests.
- Praise/validation belongs in a praise cluster unless the same sentence also contains a concrete request; keep the concrete request as its own cluster.
- One screenshot can produce several saved signals. Prefer narrower clusters over broad labels such as "Enhanced Resume Functionality Requests".

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
  if (response.clusters.length === 0) throw new Error("Gemini signal analysis response had no clusters.");
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

function clusterFromCommentGroup(type: SignalType, topic: SignalTopic, commentIndices: number[], requested: Pick<SignalCluster, "severity" | "decision" | "confidence" | "rationale">): SignalCluster {
  const frequency = commentIndices.length;
  const severity = severityFor(type, frequency);
  const decision = requested.decision === "propose_plan" && decisionAllowsProposePlan(type, frequency) ? requested.decision : decideCluster(type, frequency, severity);

  return {
    id: `${type}-${topic.key}-${frequency}`,
    type,
    title: topic.title,
    summary: topic.key === type ? `${frequency} related comment${frequency === 1 ? "" : "s"} classified as ${type.replace("_", " ")}.` : topic.summary,
    evidenceCommentIds: commentIndices.map((commentIndex) => `comment-${commentIndex}`),
    severity,
    frequency,
    confidence: Math.min(requested.confidence, 0.95),
    decision,
    rationale: decision === requested.decision ? requested.rationale : rationaleFor(type, frequency, severity, decision),
  };
}

function decisionAllowsProposePlan(type: SignalType, frequency: number): boolean {
  return (type === "bug" && frequency >= 2) || (["feature_request", "friction", "trust_objection"].includes(type) && frequency >= 3);
}

function splitClusterByAtomicTopics(cluster: SignalCluster, comments: string[]): SignalCluster[] {
  const byTopic = new Map<string, { type: SignalType; topic: SignalTopic; indices: number[] }>();

  for (const commentId of cluster.evidenceCommentIds) {
    const match = /^comment-(\d+)$/.exec(commentId);
    const commentIndex = match ? Number(match[1]) : Number.NaN;
    const text = Number.isInteger(commentIndex) ? comments[commentIndex - 1] : undefined;
    if (!text) continue;

    for (const { type, topic } of topicsForComment(text)) {
      const key = `${type}:${topic.key}`;
      const existing = byTopic.get(key);
      if (existing) {
        existing.indices.push(commentIndex);
      } else {
        byTopic.set(key, { type, topic, indices: [commentIndex] });
      }
    }
  }

  if (byTopic.size <= 1) return [cluster];

  return Array.from(byTopic.values()).map(({ type, topic, indices }) =>
    clusterFromCommentGroup(type, topic, indices, {
      severity: cluster.severity,
      decision: cluster.decision,
      confidence: cluster.confidence,
      rationale: cluster.rationale,
    }),
  );
}

function splitGeminiClustersByAtomicTopics(clusters: SignalCluster[], comments: string[]): SignalCluster[] {
  return clusters.flatMap((cluster) => splitClusterByAtomicTopics(cluster, comments));
}

function mapGeminiAnalysisToRun(run: SignalGenRun, response: GeminiSignalAnalysisResponse): Partial<SignalGenRun> {
  const rawSignalClusters: SignalCluster[] = response.clusters.map((cluster) => ({
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
  const signalClusters = splitGeminiClustersByAtomicTopics(rawSignalClusters, run.comments ?? []);
  const originalTopCluster = rawSignalClusters[response.topSignalIndex];
  const topCluster = selectTopCluster(signalClusters) ?? originalTopCluster;
  const topEvidenceCommentIds = new Set(topCluster.evidenceCommentIds);
  const originalTopEvidenceCommentIds = new Set(originalTopCluster.evidenceCommentIds);
  const canReuseGeminiPlan =
    Boolean(response.implementationPlan) &&
    topCluster.decision === "propose_plan" &&
    topCluster.title === originalTopCluster.title &&
    topCluster.evidenceCommentIds.length === originalTopCluster.evidenceCommentIds.length &&
    topCluster.evidenceCommentIds.every((commentId) => originalTopEvidenceCommentIds.has(commentId));
  const now = new Date().toISOString();

  return {
    status: statusForDecision(topCluster.decision),
    updatedAt: now,
    signalClusters,
    signal: {
      title: topCluster.title,
      summary: topCluster.summary,
      confidence: topCluster.confidence,
      evidence: (run.comments ?? []).filter((_, index) => topEvidenceCommentIds.has(`comment-${index + 1}`)),
    },
    plan: canReuseGeminiPlan && response.implementationPlan
      ? {
          recommendedChange: response.implementationPlan.recommendedChange,
          filesToChange: response.implementationPlan.filesToChange,
          guardrails: HARDCODED_GUARDRAILS,
          acceptanceCriteria: response.implementationPlan.acceptanceCriteria,
        }
      : planFor(topCluster),
  };
}

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
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
