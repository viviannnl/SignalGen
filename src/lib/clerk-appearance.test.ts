import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { signalGenClerkAppearance } from "./clerk-appearance";

describe("SignalGen Clerk appearance", () => {
  it("uses readable text and compact workspace controls on the light Soft Studio theme", () => {
    expect(signalGenClerkAppearance.variables.colorPrimary).toBe("#7A3B4E");
    expect(signalGenClerkAppearance.variables.colorBackground).toBe("#FFFFFF");
    expect(signalGenClerkAppearance.variables.colorText).toBe("#3A2A30");
    expect(signalGenClerkAppearance.variables.colorTextSecondary).toBe("#94787F");
    expect(signalGenClerkAppearance.variables.fontFamily).toContain("Hanken Grotesk");
    expect(signalGenClerkAppearance.elements.card).toContain("!bg-[#FFFFFF]");
    expect(signalGenClerkAppearance.elements.headerTitle).toContain("!text-[#3A2A30]");
    expect(signalGenClerkAppearance.elements.socialButtonsBlockButtonText).toContain("!text-[#3A2A30]");
    expect(signalGenClerkAppearance.elements.formButtonPrimary).toContain("!bg-[#7A3B4E]");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTrigger).toContain("!rounded-full");
    expect(signalGenClerkAppearance.elements.organizationPreviewMainIdentifier).toContain("!text-[#3A2A30]");
    expect(signalGenClerkAppearance.elements.organizationSwitcherTriggerIcon).toContain("!text-[#B6A2A8]");
    expect(signalGenClerkAppearance.elements.userButtonAvatarBox).toContain("!h-10");
  });

  it("keeps Clerk injected class names readable when component styles override Tailwind", () => {
    const globals = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(globals).toContain(".cl-organizationPreviewMainIdentifier");
    expect(globals).toContain(".cl-socialButtonsBlockButtonText");
    expect(globals).toContain("color: var(--ink) !important");
    expect(globals).toContain(".cl-formFieldInput");
    expect(globals).toContain("color: var(--ink) !important");
    expect(globals).not.toContain("prefers-color-scheme: dark");
  });
});
