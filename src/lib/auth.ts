import { DEFAULT_WORKSPACE_ID } from "./workspace";

export type WorkspaceRole = "owner" | "admin" | "member";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  mode: "authenticated" | "demo";
  provider?: "clerk";
};

type ClerkSessionLike = {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
  sessionClaims?: Record<string, unknown> | null;
};

export type AuthProvider = () => Promise<ClerkSessionLike | null> | ClerkSessionLike | null;

export type RequireAuthContextOptions = {
  allowDemo?: boolean;
  authProvider?: AuthProvider;
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

function roleFromClerkOrgRole(value: string | null | undefined): WorkspaceRole {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "member";
  if (normalized === "owner" || normalized === "org:owner") return "owner";
  if (normalized === "admin" || normalized === "org:admin") return "admin";
  if (normalized === "member" || normalized === "org:member") return "member";
  return "member";
}

function readClaimString(claims: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = claims?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

async function readDefaultClerkAuth(): Promise<ClerkSessionLike | null> {
  try {
    const { auth } = await import("@clerk/nextjs/server");
    return await auth();
  } catch (error) {
    console.error("Clerk auth context could not be resolved", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function readClerkContext(provider: AuthProvider): Promise<AuthContext | null> {
  const session = await provider();
  if (!session) return null;

  const userId = session.userId?.trim();
  if (!userId) return null;

  const workspaceId = session.orgId?.trim() ?? readClaimString(session.sessionClaims, "org_id");
  if (!workspaceId) {
    throw new AuthContextError(
      "WORKSPACE_REQUIRED",
      "Choose or create a SignalGen workspace before continuing.",
      403,
    );
  }

  return {
    mode: "authenticated",
    provider: "clerk",
    userId,
    workspaceId,
    role: roleFromClerkOrgRole(session.orgRole ?? readClaimString(session.sessionClaims, "org_role")),
  };
}

export async function requireAuthContext(request: Request, options: RequireAuthContextOptions = {}): Promise<AuthContext> {
  const trustedTestContext = readTrustedTestContext(request);
  if (trustedTestContext) return trustedTestContext;

  const clerkContext = await readClerkContext(options.authProvider ?? readDefaultClerkAuth);
  if (clerkContext) return clerkContext;

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
