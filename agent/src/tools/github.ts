export type GitHubPrInput = {
  runId: string;
  approved: boolean;
};

export type GitHubPrResult = { created: false; reason: string };

export async function createProductPr<T extends GitHubPrInput>(input: T): Promise<{ created: false; reason: string }> {
  if (!input.approved) {
    return { created: false, reason: "Founder approval is required before creating a product PR." };
  }
  return {
    created: false,
    reason:
      "GitHub PR automation is intentionally disabled until workspace, repository connection, and approval gates are implemented.",
  };
}
