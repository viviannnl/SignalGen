const PLACEHOLDER_ENV_VALUES = new Set(["", "***", "changeme", "change-me", "replace-me"]);

export function hasUsableClerkPublishableKey(value = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return Boolean(normalized) && !PLACEHOLDER_ENV_VALUES.has(normalized);
}
