import { DEFAULT_WORKSPACE_ID } from "./workspace";

export type WorkspaceRole = "owner" | "admin" | "member";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  mode: "authenticated" | "demo";
};

export type RequireAuthContextOptions = {
  allowDemo?: boolean;
};

export class AuthContextError extends Error {
  code: "AUTH_REQUIRED" | "WORKSPACE_REQUIRED" | "INVALID_ROLE";
  status: number;

  constructor(code: AuthContextError["code"], message: string, status = 401) {
    super(message);
    this.name = "AuthContextError";
    this.code = code;
    this.status = status;
  }
}

const DEMO_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const VALID_ROLES = new Set<WorkspaceRole>(["owner", "admin", "member"]);

export function isDemoAuthAllowed(): boolean {
  const value = process.env.SIGNALGEN_ALLOW_DEMO_AUTH?.trim().toLowerCase();
  return value ? DEMO_TRUE_VALUES.has(value) : false;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function roleFromHeader(value: string | null): WorkspaceRole {
  if (!value) return "member";
  if (VALID_ROLES.has(value as WorkspaceRole)) return value as WorkspaceRole;
  throw new AuthContextError("INVALID_ROLE", "Invalid workspace role.", 400);
}

function readTrustedTestContext(request: Request): AuthContext | null {
  if (isProductionRuntime()) return null;

  const userId = request.headers.get("x-signalgen-test-user-id")?.trim();
  const workspaceId = request.headers.get("x-signalgen-test-workspace-id")?.trim();
  if (!userId || !workspaceId) return null;

  return {
    mode: "authenticated",
    userId,
    workspaceId,
    role: roleFromHeader(request.headers.get("x-signalgen-test-role")),
  };
}

export async function requireAuthContext(request: Request, options: RequireAuthContextOptions = {}): Promise<AuthContext> {
  // B2 scaffold: Clerk will be wired here next. Until then, only trusted test
  // headers outside production and explicit demo fallback can produce context.
  const trustedTestContext = readTrustedTestContext(request);
  if (trustedTestContext) return trustedTestContext;

  if (options.allowDemo && isDemoAuthAllowed()) {
    return {
      mode: "demo",
      userId: "demo-user",
      workspaceId: DEFAULT_WORKSPACE_ID,
      role: "owner",
    };
  }

  throw new AuthContextError("AUTH_REQUIRED", "Authentication is required for this SignalGen workspace.");
}
