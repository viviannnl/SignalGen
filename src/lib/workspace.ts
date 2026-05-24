export const DEFAULT_WORKSPACE_ID = "demo";

export function resolveWorkspaceId(_request?: Request): string {
  // Production auth-provider integration is gated — see CLAUDE.md safety gates.
  // All requests use the demo workspace until real auth is wired up.
  return DEFAULT_WORKSPACE_ID;
}

export function buildWorkspaceFilter(workspaceId: string): Record<string, unknown> {
  // Include legacy runs (no workspaceId field) alongside workspace-stamped runs
  // so existing MongoDB demo data remains visible in the default workspace.
  return { $or: [{ workspaceId }, { workspaceId: { $exists: false } }] };
}
