export type GitHubPrInput = {
  runId: string;
  approved: boolean;
};

export async function createProductPr(input: GitHubPrInput): Promise<{ created: false; reason: string }> {
  if (!input.approved) {
    return { created: false, reason: "Founder approval is required before creating a product PR." };
  }

  return {
    created: false,
    reason: "GitHub PR automation is intentionally disabled in the ADK skeleton. Add it after approval workflow and guardrails are implemented.",
  };
}
