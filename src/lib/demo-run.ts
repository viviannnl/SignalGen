const fallbackComments = [
  "AI写出来会不会很假？",
  "我怕HR一看就是AI",
  "能不能更像我自己写的？",
  "不要那种很generic的模板",
];

export function buildDemoRun(screenshotNames: string[]) {
  const now = new Date().toISOString();

  return {
    source: "dashboard_upload" as const,
    status: "plan_ready" as const,
    createdAt: now,
    updatedAt: now,
    screenshotNames,
    comments: fallbackComments,
    signal: {
      title: "Users worry AI-generated cover letters sound generic",
      summary:
        "The strongest repeated concern is trust and personalization: users want LetterGen output to sound like them, not like a generic AI template.",
      confidence: 0.91,
      evidence: fallbackComments.slice(0, 3),
    },
    plan: {
      recommendedChange:
        "Add a landing-page trust section explaining how LetterGen personalizes each cover letter using the user's resume and target job description.",
      filesToChange: ["app/page.tsx", "components/landing/PersonalizationTrustSection.tsx"],
      guardrails: [
        "Do not touch auth, payment, Stripe, Supabase, environment variables, or API routes.",
        "Only edit landing-page UI/copy files unless the founder explicitly approves more scope.",
        "Create a branch and PR instead of pushing directly to main.",
        "Run the configured build/test command before creating the PR.",
      ],
      acceptanceCriteria: [
        "Explain that LetterGen uses resume and job-description context.",
        "Address the concern that AI-generated cover letters sound generic.",
        "Keep claims realistic and avoid overpromising recruiter outcomes.",
        "Build passes before PR is created.",
      ],
    },
  };
}
