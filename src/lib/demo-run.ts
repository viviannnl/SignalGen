const fallbackComments = [
  "Can you add Slack integration?",
  "We need Slack support so the team can see updates automatically.",
  "Would love a Slack integration feature for feedback alerts.",
  "It is confusing to check another dashboard manually every day.",
];

export function buildDemoRun(screenshotNames: string[]) {
  const now = new Date().toISOString();

  return {
    source: "dashboard_upload" as const,
    status: "uploaded" as const,
    createdAt: now,
    updatedAt: now,
    screenshotNames,
    comments: fallbackComments,
    signal: {
      title: "Pending feedback upload",
      summary: "SignalGen has stored the upload and is waiting for the agent tick to classify and cluster feedback.",
      confidence: 0,
      evidence: [],
    },
    plan: {
      recommendedChange: "Waiting for the agent to decide whether there is enough evidence to act.",
      filesToChange: [],
      guardrails: [
        "No code changes before founder approval.",
        "Create a branch and PR instead of pushing directly to main.",
        "Do not touch auth, payment, database, or environment files without explicit approval.",
      ],
      acceptanceCriteria: ["Agent tick processes the uploaded run before any product-change plan is proposed."],
    },
  };
}
