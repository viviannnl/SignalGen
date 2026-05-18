export type ScreenshotExtractionInput = {
  screenshotNames: string[];
};

export type ScreenshotExtractionResult = {
  comments: string[];
  warning?: string;
};

export async function extractCommentsFromScreenshots(input: ScreenshotExtractionInput): Promise<ScreenshotExtractionResult> {
  return {
    comments: [],
    warning: `OCR/Gemini multimodal extraction is not implemented yet. Received ${input.screenshotNames.length} screenshot name(s).`,
  };
}
