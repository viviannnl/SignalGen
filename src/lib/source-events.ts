export type SourceEventProvider = "sentry" | "posthog" | "manual";

export type SourceEvent = {
  _id?: string;
  workspaceId: string;
  provider: SourceEventProvider;
  externalId: string;
  occurredAt: string;
  type: "error" | "session" | "feedback" | "custom";
  title: string;
  body: string;
  tags: string[];
  userId?: string; // after PII redaction, this should be a hash or omitted
  metadata: Record<string, unknown>;
};

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // email
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // phone
  /\b(?:\d[ -]?){13,16}\b/g, // credit card-ish
];

export function redactPii(text: string): string {
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function normalizeSentryEvent(raw: Record<string, unknown>, workspaceId: string): SourceEvent {
  return {
    workspaceId,
    provider: "sentry",
    externalId: String(raw.id ?? ""),
    occurredAt: String(raw.timestamp ?? new Date().toISOString()),
    type: "error",
    title: redactPii(String(raw.title ?? raw.message ?? "")),
    body: redactPii(String(raw.culprit ?? raw.message ?? "")),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]).map(String) : [],
    metadata: {},
  };
}

export function normalizePostHogEvent(raw: Record<string, unknown>, workspaceId: string): SourceEvent {
  return {
    workspaceId,
    provider: "posthog",
    externalId: String(raw.uuid ?? raw.id ?? ""),
    occurredAt: String(raw.timestamp ?? new Date().toISOString()),
    type: raw.event === "$feedback" ? "feedback" : "session",
    title: redactPii(String(raw.event ?? "")),
    body: redactPii(JSON.stringify(raw.properties ?? {})),
    tags: [],
    metadata: {},
  };
}

export function groupEventsByType(events: SourceEvent[]): Record<string, SourceEvent[]> {
  const groups: Record<string, SourceEvent[]> = {};
  for (const event of events) {
    const key = `${event.provider}:${event.type}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }
  return groups;
}

// Mock factory for tests
export function buildMockSentryEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "sentry-001",
    timestamp: "2026-05-23T00:00:00Z",
    title: "TypeError: Cannot read property 'x' of undefined",
    culprit: "app/components/Dashboard.tsx",
    tags: ["production", "critical"],
    ...overrides,
  };
}

export function buildMockPostHogEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    uuid: "ph-001",
    timestamp: "2026-05-23T00:00:00Z",
    event: "$feedback",
    properties: { feedback: "The export button is broken." },
    ...overrides,
  };
}
