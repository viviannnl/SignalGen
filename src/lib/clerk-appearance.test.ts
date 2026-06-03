import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { signalGenClerkAppearance } from "./clerk-appearance";

describe("SignalGen Clerk appearance", () => {
  it("uses readable text and compact workspace controls on the dark dashboard", () => {
    expect(signalGenClerkAppearance.variables.colorText).toBe("#f8fafc");
    expect(signalGenClerkAppearance.variables.colorTextSecondary).toBe("#cbd5e1");
    expect(signalGenClerkAppearance.elements.card).toContain("!bg-[#101522]");
    expect(signalGenClerkAppearance.elements.headerTitle).toContain("!text-slate-100");
    expect(signalGenClerkAppearance.elements.socialButtonsBlockButtonText).toContain("!text-slate-100");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTrigger).toContain("!rounded-full");
    expect(signalGenClerkAppearance.elements.organizationPreviewMainIdentifier).toContain("!text-slate-100");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTriggerIcon).toContain("!text-slate-300");
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
