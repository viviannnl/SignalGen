import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { signalGenClerkAppearance } from "./clerk-appearance";

describe("SignalGen Clerk appearance", () => {
  it("uses readable text and compact workspace controls on the dark dashboard", () => {
    expect(signalGenClerkAppearance.variables.colorText).toBe("#2A1318");
    expect(signalGenClerkAppearance.variables.colorTextSecondary).toBe("#7B5A60");
    expect(signalGenClerkAppearance.elements.card).toContain("!bg-[var(--panel)]");
    expect(signalGenClerkAppearance.elements.headerTitle).toContain("!text-[var(--ink)]");
    expect(signalGenClerkAppearance.elements.socialButtonsBlockButtonText).toContain("!text-[var(--ink)]");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTrigger).toContain("!rounded-full");
    expect(signalGenClerkAppearance.elements.organizationPreviewMainIdentifier).toContain("!text-[var(--ink)]");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTriggerIcon).toContain("!text-[var(--ink-faint)]");
    expect(signalGenClerkAppearance.elements.userButtonAvatarBox).toContain("!h-10");
  });

  it("keeps Clerk injected class names readable when component styles override Tailwind", () => {
    const globals = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(globals).toContain(".cl-organizationPreviewMainIdentifier");
    expect(globals).toContain(".cl-socialButtonsBlockButtonText");
    expect(globals).toContain("color:var(--ink) !important");
    expect(globals).toContain(".cl-formFieldInput");
    expect(globals).toContain("background:var(--inset) !important");
  });
});
