import { describe, expect, it } from "vitest";

import { signalGenClerkAppearance } from "./clerk-appearance";

describe("SignalGen Clerk appearance", () => {
  it("uses light text for workspace/profile controls on the dark dashboard", () => {
    expect(signalGenClerkAppearance.variables.colorText).toBe("#e2e8f0");
    expect(signalGenClerkAppearance.variables.colorTextSecondary).toBe("#94a3b8");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTrigger).toContain("text-slate-100");
    expect(signalGenClerkAppearance.elements.organizationPreviewMainIdentifier).toContain("text-slate-100");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTriggerIcon).toContain("text-slate-300");
    expect(signalGenClerkAppearance.elements.userButtonPopoverActionButtonText).toContain("text-slate-100");
  });
});
