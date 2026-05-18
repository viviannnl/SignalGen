export async function lookupVercelPreview(branchName: string): Promise<{ previewUrl?: string; status: "not_implemented" }> {
  void branchName;
  return { status: "not_implemented" };
}
