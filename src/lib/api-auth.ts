import { NextResponse } from "next/server";

import { AuthContextError, requireAuthContext, type AuthContext, type RequireAuthContextOptions } from "./auth";

export async function requireApiAuthContext(request: Request, options: RequireAuthContextOptions = {}): Promise<AuthContext> {
  return requireAuthContext(request, options);
}

export type ApiAuthErrorResponse = NextResponse<never>;

export function authContextErrorResponse(error: unknown): ApiAuthErrorResponse | null {
  if (!(error instanceof AuthContextError)) return null;

  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
    },
    { status: error.status },
  ) as ApiAuthErrorResponse;
}

export async function getApiAuthContextOrResponse(
  request: Request,
  options: RequireAuthContextOptions = {},
): Promise<AuthContext | ApiAuthErrorResponse> {
  try {
    return await requireApiAuthContext(request, options);
  } catch (error) {
    const response = authContextErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
