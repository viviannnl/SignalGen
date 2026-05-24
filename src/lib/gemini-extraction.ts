const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 8 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 30_000;
const GEMINI_MODEL = "gemini-2.5-flash";

export class RunCreationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "RunCreationError";
  }
}

export type ScreenshotFile = {
  name: string;
  type: string;
  size: number;
  data: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export function validateScreenshotFile(file: Pick<ScreenshotFile, "name" | "type" | "size">): string | null {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return `Unsupported screenshot type for ${file.name}. Please upload PNG, JPG, or WebP images.`;
  }

  if (file.size > MAX_SCREENSHOT_BYTES) {
    return `${file.name} is too large. Please upload screenshots smaller than 4 MB.`;
  }

  return null;
}

export function validateTotalUploadSize(contentLength: string | null): string | null {
  if (!contentLength) return null;
  const size = Number(contentLength);
  if (Number.isFinite(size) && size > MAX_TOTAL_UPLOAD_BYTES) {
    return "The upload is too large. Please upload at most 8 MB of screenshots at a time.";
  }
  return null;
}

export function isSupportedImageSignature(file: Pick<ScreenshotFile, "type" | "data">): boolean {
  const buffer = Buffer.from(file.data, "base64");

  if (file.type === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (file.type === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }

  if (file.type === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  return false;
}

export function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

function normalizeComment(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }

  if (value && typeof value === "object" && "text" in value) {
    const text = String((value as { text?: unknown }).text ?? "").trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

export function extractCommentsFromGeminiText(text: string): string[] {
  const cleaned = stripMarkdownFence(text);
  let parsed: { comments?: unknown };

  try {
    parsed = JSON.parse(cleaned) as { comments?: unknown };
  } catch {
    throw new RunCreationError("Gemini returned invalid JSON extraction output. Please try again with a clearer screenshot.", 502);
  }

  const rawComments = Array.isArray(parsed.comments) ? parsed.comments : [];
  const seen = new Set<string>();
  const comments: string[] = [];

  for (const rawComment of rawComments) {
    const comment = normalizeComment(rawComment);
    if (!comment || seen.has(comment)) continue;
    seen.add(comment);
    comments.push(comment);
  }

  return comments;
}

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new RunCreationError("Missing GEMINI_API_KEY. Add it locally and in Vercel before uploading screenshots.", 500);
  }
  return key;
}

function buildPrompt() {
  return `You are SignalGen's feedback extraction tool. Read the uploaded screenshots from social media or customer channels.
Extract only user/customer feedback comments that are visible in the screenshots.
Ignore navigation, usernames, timestamps, buttons, ads, and unrelated UI chrome.
Return strict JSON only, with this exact shape:
{"comments":[{"text":"comment text exactly as visible"}]}
If no feedback comments are visible, return {"comments":[]}.`;
}

export async function extractCommentsFromScreenshots(files: ScreenshotFile[]): Promise<string[]> {
  if (files.length === 0) {
    throw new RunCreationError("Upload at least one screenshot before creating a SignalGen run.");
  }

  if (files.length > 5) {
    throw new RunCreationError("Upload at most 5 screenshots per SignalGen run.");
  }

  for (const file of files) {
    const validationError = validateScreenshotFile(file);
    if (validationError) throw new RunCreationError(validationError);
    if (!isSupportedImageSignature(file)) {
      throw new RunCreationError(`${file.name} does not look like a valid ${file.type} image.`);
    }
  }

  const apiKey = getGeminiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt() },
              ...files.map((file) => ({
                inline_data: {
                  mime_type: file.type,
                  data: file.data,
                },
              })),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Gemini screenshot extraction failed", response.status, errorText.slice(0, 500));

      if (response.status === 429) {
        throw new RunCreationError(
          "Gemini quota or billing is unavailable for this API key. Check Google AI Studio billing/credits, then try the upload again.",
          429,
        );
      }

      if (response.status === 400 || response.status === 403) {
        throw new RunCreationError("Gemini rejected the screenshot extraction request. Check the API key, project access, and uploaded image type.", 502);
      }

      throw new RunCreationError("Gemini could not extract comments from the screenshots. Check server logs for details.", 502);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    if (!text) {
      throw new RunCreationError("Gemini returned an empty extraction result.", 502);
    }

    const comments = extractCommentsFromGeminiText(text);
    if (comments.length === 0) {
      throw new RunCreationError("No customer feedback comments were found in the uploaded screenshots.");
    }

    return comments;
  } catch (error) {
    if (error instanceof RunCreationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RunCreationError("Gemini screenshot extraction timed out. Try fewer or smaller screenshots.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
