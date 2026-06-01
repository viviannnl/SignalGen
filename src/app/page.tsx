import { Button, Card, ConfRing, Eyebrow, MetricTile, Panel, Pill } from "@/components/ui";

const workflow = [
  {
    title: "Upload feedback screenshots",
    copy: "Drop Xiaohongshu, Instagram, Reddit, or app-review screenshots into SignalGen.",
  },
  {
    title: "Detect the product signal",
    copy: "Gemini extracts comments, clusters repeated pain points, and explains the strongest signal with evidence.",
  },
  {
    title: "Approve the implementation plan",
    copy: "Review the proposed product change, affected files, acceptance criteria, and guardrails before code changes happen.",
  },
  {
    title: "Create a safe PR",
    copy: "The agent edits your product repo on a branch, runs the build, opens a GitHub PR, and links the Vercel preview.",
  },
];

const memoryItems = [
  "Original screenshots and extracted comments",
  "Top signal, confidence, and evidence",
  "Generated plan and founder approval decision",
  "Changed files, test result, PR, and preview link",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-16 px-6 py-7 sm:px-10 sm:pb-20 lg:gap-[72px]">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[var(--primary)] text-sm font-extrabold tracking-[-0.02em] text-[var(--primary-ink)] shadow-[var(--shadow-sm)]">
              SG
            </div>
            <span className="text-[19px] font-extrabold tracking-[-0.02em]">SignalGen</span>
          </div>
          <Button href="https://github.com/viviannnl/SignalGen" rel="noreferrer" size="sm" target="_blank" variant="secondary">
            GitHub ↗
          </Button>
        </nav>

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="flex flex-col gap-7">
            <Pill className="self-start px-4 py-[9px] text-[13px]" variant="rose">
              Google Cloud Rapid Agent Hackathon
            </Pill>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-[clamp(3.25rem,9vw,4.75rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
                From customer signal to <span className="text-[var(--primary)]">product&nbsp;PR.</span>
              </h1>
              <p className="max-w-[520px] text-[19px] leading-[1.6] text-[var(--ink-soft)]">
                SignalGen is an AI product-iteration agent that turns feedback screenshots into safe, reviewable product changes — keeping founders in control of every step.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button href="/dashboard" size="lg" variant="primary">
                Open dashboard
              </Button>
              <Button href="#workflow" size="lg" variant="secondary">
                View workflow
              </Button>
            </div>
          </div>

          <Card className="p-[26px]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-[18px]">
              <div>
                <div className="sg-meta">Current signal</div>
                <h2 className="mt-1.5 text-2xl font-extrabold tracking-[-0.02em]">Users need clearer onboarding</h2>
              </div>
              <ConfRing value={0.91} />
            </div>
            <div className="mt-[18px] flex flex-col gap-3.5">
              <Panel className="p-[18px]">
                <div className="text-[13px] font-bold text-[var(--primary)]">Evidence</div>
                <div className="mt-2.5 flex flex-col gap-1.5 text-[14.5px] leading-[1.55] text-[color-mix(in_srgb,var(--ink)_85%,transparent)]">
                  <span>“I got confused during setup”</span>
                  <span>“The first step is unclear”</span>
                  <span>“Where do I even start?”</span>
                </div>
              </Panel>
              <Panel className="p-[18px]" variant="peach">
                <div className="text-[13px] font-bold text-[var(--primary)]">Recommended change</div>
                <p className="mt-2.5 text-[14.5px] leading-[1.55] text-[color-mix(in_srgb,var(--ink)_85%,transparent)]">Add a step-by-step onboarding guide to the product&apos;s getting-started flow.</p>
              </Panel>
              <div className="grid grid-cols-2 gap-3.5">
                <MetricTile label="Build" value={<span className="text-[var(--success)]">Passed</span>} />
                <MetricTile label="PR" value={<span className="text-[var(--rose-hover)]">Ready</span>} />
              </div>
            </div>
          </Card>
        </div>

        <section id="workflow" className="flex flex-col gap-[26px]">
          <div>
            <Eyebrow>Agent workflow</Eyebrow>
            <h2 className="mt-3 text-[clamp(2rem,5vw,2.375rem)] font-extrabold tracking-[-0.025em]">Human-approved automation with guardrails.</h2>
          </div>
          <div className="grid gap-[18px] md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item, index) => (
              <Card key={item.title} className="rounded-[var(--radius-lg)] p-6">
                <div className="mb-[18px] flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[var(--panel)] text-[17px] font-extrabold text-[var(--primary)]">
                  {index + 1}
                </div>
                <h3 className="text-lg font-extrabold tracking-[-0.015em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-[1.55] text-[var(--ink-soft)]">{item.copy}</p>
              </Card>
            ))}
          </div>
        </section>

        <Panel id="memory" className="grid gap-8 p-6 md:grid-cols-[0.85fr_1.15fr] md:p-10 lg:gap-10">
          <div>
            <Eyebrow>MongoDB memory</Eyebrow>
            <h2 className="mt-3 text-[clamp(1.75rem,4vw,2rem)] font-extrabold leading-[1.1] tracking-[-0.025em]">The memory layer of the founder’s product iteration loop.</h2>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {memoryItems.map((item) => (
              <Card key={item} className="rounded-[var(--radius-md)] p-5 text-[14.5px] leading-[1.5] shadow-[var(--shadow-sm)]">
                {item}
              </Card>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}
