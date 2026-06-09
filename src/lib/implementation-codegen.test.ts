import { describe, expect, it } from "vitest";

import { MockGitHubClient } from "./github-client";
import { generateImplementationChanges, type GeminiGenerate } from "./implementation-codegen";

const baseInput = {
  plan: {
    recommendedChange: "Add a clear empty-state message for uploaded feedback.",
    filesToChange: ["src/app/page.tsx"],
    guardrails: ["Do not touch secrets, auth, billing, or database migrations."],
    acceptanceCriteria: ["Empty state explains what to upload next."],
  },
  signal: {
    title: "Users are confused after upload",
    summary: "Feedback says the empty state is unclear.",
    evidence: ["I don't know what to upload next"],
  },
  owner: "viviannnl",
  repo: "signalgen",
  baseRef: "main",
};

function mockClient() {
  return new MockGitHubClient({
    fileLists: {
      "viviannnl/signalgen/main": [
        "src/app/page.tsx",
        "src/lib/feedback.ts",
        ".github/workflows/ci.yml",
        "package-lock.json",
      ],
    },
    files: {
      "viviannnl/signalgen/main/src/app/page.tsx": {
        path: "src/app/page.tsx",
        content: "export default function Page() { return <main />; }\n",
        sha: "sha-page",
      },
      "viviannnl/signalgen/main/src/lib/feedback.ts": {
        path: "src/lib/feedback.ts",
        content: "export const feedback = [];\n",
        sha: "sha-feedback",
      },
    },
  });
}

describe("generateImplementationChanges", () => {
  it("returns valid whole-file changes and reads plan-hinted files from GitHub", async () => {
    const generate: GeminiGenerate = async (prompt) => {
      expect(prompt).toContain("Users are confused after upload");
      expect(prompt).toContain("src/app/page.tsx");
      expect(prompt).toContain("export default function Page");
      return JSON.stringify({
        summary: "Updated the upload empty state copy.",
        changes: [{ path: "src/app/page.tsx", content: "export default function Page() { return <main>Upload CSV feedback</main>; }\n" }],
      });
    };

    const client = mockClient();
    const result = await generateImplementationChanges({ ...baseInput, githubClient: client, generate });

    expect(result).toEqual({
      status: "success",
      summary: "Updated the upload empty state copy.",
      changes: [{ path: "src/app/page.tsx", content: "export default function Page() { return <main>Upload CSV feedback</main>; }\n" }],
    });
    expect(client.calls.map((call) => call.method)).toEqual(["listFiles", "getFileContents"]);
  });

  it("filters unsafe changes, caps valid changes at five files, and rejects oversized content", async () => {
    const largeContent = "x".repeat(64 * 1024 + 1);
    const generate: GeminiGenerate = async () => JSON.stringify({
      summary: "Mixed safe and unsafe changes.",
      changes: [
        { path: ".github/workflows/ci.yml", content: "name: ci\n" },
        { path: "/absolute.ts", content: "export {};\n" },
        { path: "src/../evil.ts", content: "export {};\n" },
        { path: "src/auth/login.ts", content: "export {};\n" },
        { path: "src/authentication.ts", content: "export {};\n" },
        { path: "src/oauth/callback.ts", content: "export {};\n" },
        { path: "src/payments/stripe.ts", content: "export {};\n" },
        { path: "src/db/migrations/001.sql", content: "select 1;\n" },
        { path: "migrations/001.sql", content: "select 1;\n" },
        { path: "package.json", content: "{\"scripts\":{}}\n" },
        { path: "src/lib/large.ts", content: largeContent },
        { path: "src/lib/safe-1.ts", content: "export const one = 1;\n" },
        { path: "src/lib/safe-2.ts", content: "export const two = 2;\n" },
        { path: "src/lib/safe-3.ts", content: "export const three = 3;\n" },
        { path: "src/lib/safe-4.ts", content: "export const four = 4;\n" },
        { path: "src/lib/safe-5.ts", content: "export const five = 5;\n" },
        { path: "src/lib/safe-6.ts", content: "export const six = 6;\n" },
      ],
    });

    const result = await generateImplementationChanges({ ...baseInput, githubClient: mockClient(), generate });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.changes.map((change) => change.path)).toEqual([
        "src/lib/safe-1.ts",
        "src/lib/safe-2.ts",
        "src/lib/safe-3.ts",
        "src/lib/safe-4.ts",
        "src/lib/safe-5.ts",
      ]);
    }
  });

  it("returns no_changes when the model returns no valid changes", async () => {
    const generate: GeminiGenerate = async () => JSON.stringify({
      summary: "Only unsafe changes.",
      changes: [
        { path: "pnpm-lock.yaml", content: "lockfileVersion: 9\n" },
        { path: "src/empty.ts", content: "" },
      ],
    });

    const result = await generateImplementationChanges({ ...baseInput, githubClient: mockClient(), generate });

    expect(result.status).toBe("no_changes");
    if (result.status === "no_changes") {
      expect(result.reason).toContain("No valid changes");
    }
  });

  it("returns failed without throwing when generation fails", async () => {
    const generate: GeminiGenerate = async () => {
      throw new Error("model unavailable");
    };

    const result = await generateImplementationChanges({ ...baseInput, githubClient: mockClient(), generate });

    expect(result).toEqual({ status: "failed", reason: "Gemini code generation failed." });
  });

  it("returns failed without throwing when GEMINI_API_KEY is missing and no generator is injected", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const result = await generateImplementationChanges({ ...baseInput, githubClient: mockClient() });
      expect(result).toEqual({ status: "failed", reason: "GEMINI_API_KEY is not configured." });
    } finally {
      if (previous === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previous;
      }
    }
  });
});
