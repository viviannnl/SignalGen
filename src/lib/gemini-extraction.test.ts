import { describe, expect, it } from "vitest";

import {
  extractCommentsFromGeminiText,
  isSupportedImageSignature,
  RunCreationError,
  validateScreenshotFile,
  validateTotalUploadSize,
  type ScreenshotFile,
} from "./gemini-extraction";

const PNG_SIGNATURE_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString("base64");

function screenshot(overrides: Partial<ScreenshotFile> = {}): ScreenshotFile {
  return {
    name: "feedback.png",
    type: "image/png",
    size: 1024,
    data: PNG_SIGNATURE_BASE64,
    ...overrides,
  };
}

describe("Gemini screenshot extraction helpers", () => {
  it("parses structured Gemini JSON into unique comment text", () => {
    const comments = extractCommentsFromGeminiText(
      JSON.stringify({
        comments: [
          { text: "Can you add Slack integration?" },
          { text: "Can you add Slack integration?" },
          { text: "The dashboard is confusing." },
          { text: "" },
        ],
      }),
    );

    expect(comments).toEqual(["Can you add Slack integration?", "The dashboard is confusing."]);
  });

  it("parses markdown-fenced JSON from Gemini", () => {
    const comments = extractCommentsFromGeminiText(`Here is the JSON:\n\n\`\`\`json\n{"comments":["Checkout is broken","Need export feature"]}\n\`\`\``);

    expect(comments).toEqual(["Checkout is broken", "Need export feature"]);
  });

  it("returns an empty list when Gemini finds no comments", () => {
    expect(extractCommentsFromGeminiText('{"comments":[]}')).toEqual([]);
  });

  it("throws a stable error when Gemini returns invalid JSON", () => {
    expect(() => extractCommentsFromGeminiText("not json")).toThrow(RunCreationError);
    expect(() => extractCommentsFromGeminiText("not json")).toThrow(/invalid JSON/);
  });

  it("accepts supported screenshot mime types", () => {
    expect(validateScreenshotFile(screenshot({ type: "image/png" }))).toBeNull();
    expect(validateScreenshotFile(screenshot({ type: "image/jpeg" }))).toBeNull();
    expect(validateScreenshotFile(screenshot({ type: "image/webp" }))).toBeNull();
  });

  it("rejects unsupported file types before Gemini is called", () => {
    expect(validateScreenshotFile(screenshot({ name: "notes.txt", type: "text/plain" }))).toMatch(/Unsupported screenshot type/);
  });

  it("rejects oversized total uploads before parsing multipart bodies", () => {
    expect(validateTotalUploadSize(String(9 * 1024 * 1024))).toMatch(/too large/);
    expect(validateTotalUploadSize(String(1024))).toBeNull();
  });

  it("checks image magic bytes in addition to mime type", () => {
    expect(isSupportedImageSignature(screenshot())).toBe(true);
    expect(isSupportedImageSignature(screenshot({ data: Buffer.from("fake-image").toString("base64") }))).toBe(false);
  });
});
