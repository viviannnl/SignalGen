import type { GitHubClient } from "./github-client";

const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_MODEL = "gemini-2.5-pro";
const MAX_CANDIDATE_READS = 12;
const MAX_CHANGE_FILES = 5;
const MAX_FILE_BYTES = 64 * 1024;

export type ImplementationPlanForCodegen = {
  recommendedChange: string;
  filesToChange?: string[];
  guardrails?: string[];
  acceptanceCriteria?: string[];
};

export type ImplementationSignalForCodegen = {
  title: string;
  summary: string;
  evidence?: unknown[];
};

export type GeminiGenerate = (prompt: string) => Promise<string>;

export type CodegenResult =
  | { status: "success"; changes: Array<{ path: string; content: string }>; summary: string }
  | { status: "no_changes"; reason: string }
  | { status: "failed"; reason: string };

export type GenerateImplementationChangesInput = {
  plan: ImplementationPlanForCodegen;
  signal: ImplementationSignalForCodegen;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  baseRef: string;
  generate?: GeminiGenerate;
};

type GeminiCodegenResponse = {
  changes: Array<{ path: string; content: string }>;
  summary: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function isLockfile(path: string): boolean {
  return ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(path.split("/").at(-1) ?? "");
}

function hasSensitiveIntent(path: string): boolean {
  return /(^|\/|[-_.])(secret|secrets|auth|authentication|oauth|login|billing|payment|payments|stripe)([-_.]|\/|$)/i.test(path);
}

function isEnvFile(path: string): boolean {
  const filename = path.split("/").at(-1) ?? "";
  return filename === ".env" || filename.startsWith(".env.");
}

function isMigrationPath(path: string): boolean {
  return path.startsWith("migrations/") || path.startsWith("migration/") || path.includes("/migrations/") || path.includes("/migration/");
}

function isDenylistedPath(path: string): boolean {
  return (
    path.startsWith(".github/workflows/") ||
    isEnvFile(path) ||
    isLockfile(path) ||
    isMigrationPath(path) ||
    hasSensitiveIntent(path)
  );
}

function isSafeRelativePath(path: string): boolean {
  return path.trim().length > 0 && !path.startsWith("/") && !path.split("/").includes("..");
}

function isReadableProductSource(path: string): boolean {
  if (!isSafeRelativePath(path) || isDenylistedPath(path)) return false;
  if (!/\.(tsx?|jsx?|css|scss|mdx?|json)$/.test(path)) return false;
  return path.startsWith("src/app/") || path.startsWith("src/components/") || path.startsWith("src/lib/") || path.startsWith("app/") || path.startsWith("components/") || path.startsWith("lib/");
}

function chooseCandidateFiles(tree: string[], hints: string[] = []): string[] {
  const existing = new Set(tree);
  const chosen: string[] = [];
  for (const hint of hints) {
    const path = hint.trim();
    if (existing.has(path) && isReadableProductSource(path) && !chosen.includes(path)) {
      chosen.push(path);
    }
    if (chosen.length >= MAX_CANDIDATE_READS) return chosen;
  }
  if (chosen.length > 0) return chosen;

  for (const path of tree) {
    if (isReadableProductSource(path) && !chosen.includes(path)) {
      chosen.push(path);
    }
    if (chosen.length >= MAX_CANDIDATE_READS) return chosen;
  }
  return chosen;
}

function buildPrompt(input: {
  plan: ImplementationPlanForCodegen;
  signal: ImplementationSignalForCodegen;
  repoTree: string[];
  files: Array<{ path: string; content: string }>;
}): string {
  const evidence = JSON.stringify(input.signal.evidence ?? [], null, 2);
  const acceptanceCriteria = (input.plan.acceptanceCriteria ?? []).map((item) => `- ${item}`).join("\n") || "- No explicit acceptance criteria supplied.";
  const guardrails = (input.plan.guardrails ?? []).map((item) => `- ${item}`).join("\n") || "- Keep the change small and safe.";
  const tree = input.repoTree.slice(0, 400).join("\n");
  const files = input.files
    .map((file) => `### ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");

  return `You are SignalGen's implementation executor. Generate a small, real code change from the approved product plan.

Return ONLY JSON with this exact shape, no markdown fences and no explanation:
{
  "changes": [{ "path": "relative/repo/path", "content": "FULL new file content" }],
  "summary": "Short implementation summary"
}

Rules:
- Return whole-file content, not diffs.
- Make at most ${MAX_CHANGE_FILES} changed files.
- Do not delete files or return empty content.
- Do not touch .github/workflows, .env files, lockfiles, secrets, auth, billing, or database migrations.
- Prefer editing the fetched files when they are enough for the requested product change.

Signal title: ${input.signal.title}
Signal summary: ${input.signal.summary}
Evidence:
${evidence}

Recommended change:
${input.plan.recommendedChange}

Acceptance criteria:
${acceptanceCriteria}

Guardrails:
${guardrails}

Repository tree / candidate context:
${tree}

Fetched file contents:
${files || "No file contents were available."}`;
}

function validateGeminiResponse(value: unknown): GeminiCodegenResponse {
  if (!value || typeof value !== "object") throw new Error("Gemini codegen response was not an object.");
  const response = value as { changes?: unknown; summary?: unknown };
  if (!Array.isArray(response.changes)) throw new Error("Gemini codegen response was missing changes.");
  const changes = response.changes.map((change, index) => {
    if (!change || typeof change !== "object") throw new Error(`Gemini change ${index} was not an object.`);
    const item = change as { path?: unknown; content?: unknown };
    if (typeof item.path !== "string") throw new Error(`Gemini change ${index} had an invalid path.`);
    if (typeof item.content !== "string") throw new Error(`Gemini change ${index} had invalid content.`);
    return { path: item.path, content: item.content };
  });
  return {
    changes,
    summary: typeof response.summary === "string" && response.summary.trim() ? response.summary.trim() : "Generated implementation changes.",
  };
}

function filterGuardrailedChanges(changes: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
  const accepted: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  for (const change of changes) {
    const path = change.path.trim();
    const content = change.content;
    let reason: string | null = null;
    if (!isSafeRelativePath(path)) reason = "unsafe path";
    else if (isDenylistedPath(path)) reason = "denylisted path";
    else if (!isReadableProductSource(path)) reason = "outside allowed product source paths";
    else if (content.trim().length === 0) reason = "empty content";
    else if (byteLength(content) > MAX_FILE_BYTES) reason = "content exceeds 64KB";
    else if (seen.has(path)) reason = "duplicate path";

    if (reason) {
      console.warn("Dropped unsafe Gemini implementation change", { path, reason });
      continue;
    }

    accepted.push({ path, content });
    seen.add(path);
    if (accepted.length >= MAX_CHANGE_FILES) break;
  }
  return accepted;
}

export async function defaultGeminiGenerate(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured.");
    error.name = "MissingGeminiApiKey";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini code generation failed with status ${response.status}.`);
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) throw new Error("Gemini code generation returned an empty response.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateImplementationChanges(input: GenerateImplementationChangesInput): Promise<CodegenResult> {
  let repoTree: string[];
  try {
    repoTree = await input.githubClient.listFiles({ owner: input.owner, repo: input.repo, ref: input.baseRef });
  } catch (error) {
    console.warn("Failed to list repository files for implementation codegen", error instanceof Error ? error.name : typeof error);
    return { status: "failed", reason: "Could not read repository file tree." };
  }

  const candidateFiles = chooseCandidateFiles(repoTree, input.plan.filesToChange);
  const fetchedFiles: Array<{ path: string; content: string }> = [];
  for (const path of candidateFiles) {
    try {
      const file = await input.githubClient.getFileContents({ owner: input.owner, repo: input.repo, path, ref: input.baseRef });
      if (file && byteLength(file.content) <= MAX_FILE_BYTES) {
        fetchedFiles.push({ path: file.path, content: file.content });
      }
    } catch (error) {
      console.warn("Failed to read candidate file for implementation codegen", { path, reason: error instanceof Error ? error.name : typeof error });
    }
  }

  const prompt = buildPrompt({ plan: input.plan, signal: input.signal, repoTree, files: fetchedFiles });
  const generate = input.generate ?? defaultGeminiGenerate;
  try {
    const raw = await generate(prompt);
    const parsed = JSON.parse(stripMarkdownFence(raw)) as unknown;
    const response = validateGeminiResponse(parsed);
    const changes = filterGuardrailedChanges(response.changes);
    if (changes.length === 0) {
      return { status: "no_changes", reason: "No valid changes remained after guardrail filtering." };
    }
    return { status: "success", changes, summary: response.summary };
  } catch (error) {
    const missingGeminiApiKey = error instanceof Error && error.name === "MissingGeminiApiKey";
    console.warn("Gemini implementation codegen failed", error instanceof Error ? error.name : typeof error);
    return { status: "failed", reason: missingGeminiApiKey ? "GEMINI_API_KEY is not configured." : "Gemini code generation failed." };
  }
}
