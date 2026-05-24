import { describe, expect, it } from "vitest";

import {
  buildMockPostHogEvent,
  buildMockSentryEvent,
  groupEventsByType,
  normalizePostHogEvent,
  normalizeSentryEvent,
  redactPii,
  type SourceEvent,
} from "./source-events";

describe("source events", () => {
  it("redactPii replaces email addresses with [REDACTED]", () => {
    expect(redactPii("Contact founder@example.com for details.")).toBe(
      "Contact [REDACTED] for details.",
    );
  });

  it("redactPii replaces phone numbers with [REDACTED]", () => {
    expect(redactPii("Call 415-555-1234 after the demo.")).toBe(
      "Call [REDACTED] after the demo.",
    );
  });

  it("redactPii leaves non-PII text unchanged", () => {
    const text = "The export button is broken on the dashboard.";

    expect(redactPii(text)).toBe(text);
  });

  it("normalizeSentryEvent maps id, timestamp, title, and tags correctly", () => {
    const event = normalizeSentryEvent(
      buildMockSentryEvent({
        id: "sentry-123",
        timestamp: "2026-05-23T12:00:00Z",
        title: "TypeError: export button failed",
        tags: ["production", "dashboard"],
      }),
      "workspace-1",
    );

    expect(event).toMatchObject({
      workspaceId: "workspace-1",
      provider: "sentry",
      externalId: "sentry-123",
      occurredAt: "2026-05-23T12:00:00Z",
      type: "error",
      title: "TypeError: export button failed",
      tags: ["production", "dashboard"],
      metadata: {},
    });
  });

  it("normalizeSentryEvent applies PII redaction to title and body", () => {
    const event = normalizeSentryEvent(
      buildMockSentryEvent({
        title: "Crash for founder@example.com",
        culprit: "User phone 415 555 1234 in payload",
      }),
      "workspace-1",
    );

    expect(event.title).toBe("Crash for [REDACTED]");
    expect(event.body).toBe("User phone [REDACTED] in payload");
  });

  it("normalizePostHogEvent maps uuid, timestamp, and event correctly", () => {
    const event = normalizePostHogEvent(
      buildMockPostHogEvent({
        uuid: "ph-123",
        timestamp: "2026-05-23T13:00:00Z",
        event: "session_recording_started",
      }),
      "workspace-1",
    );

    expect(event).toMatchObject({
      workspaceId: "workspace-1",
      provider: "posthog",
      externalId: "ph-123",
      occurredAt: "2026-05-23T13:00:00Z",
      type: "session",
      title: "session_recording_started",
      tags: [],
      metadata: {},
    });
  });

  it("normalizePostHogEvent sets type to feedback for $feedback events", () => {
    const event = normalizePostHogEvent(buildMockPostHogEvent({ event: "$feedback" }), "workspace-1");

    expect(event.type).toBe("feedback");
  });

  it("groupEventsByType groups events by provider:type key", () => {
    const sentryEvent = normalizeSentryEvent(buildMockSentryEvent(), "workspace-1");
    const secondSentryEvent = normalizeSentryEvent(
      buildMockSentryEvent({ id: "sentry-002" }),
      "workspace-1",
    );

    const groups = groupEventsByType([sentryEvent, secondSentryEvent]);

    expect(groups["sentry:error"]).toEqual([sentryEvent, secondSentryEvent]);
  });

  it("groupEventsByType handles events from multiple providers", () => {
    const sentryEvent = normalizeSentryEvent(buildMockSentryEvent(), "workspace-1");
    const postHogEvent = normalizePostHogEvent(buildMockPostHogEvent(), "workspace-1");
    const manualEvent: SourceEvent = {
      workspaceId: "workspace-1",
      provider: "manual",
      externalId: "manual-001",
      occurredAt: "2026-05-23T14:00:00Z",
      type: "custom",
      title: "Manual note",
      body: "Founder uploaded feedback manually.",
      tags: ["manual"],
      metadata: {},
    };

    const groups = groupEventsByType([sentryEvent, postHogEvent, manualEvent]);

    expect(Object.keys(groups).sort()).toEqual(["manual:custom", "posthog:feedback", "sentry:error"]);
    expect(groups["posthog:feedback"]).toEqual([postHogEvent]);
    expect(groups["manual:custom"]).toEqual([manualEvent]);
  });
});
