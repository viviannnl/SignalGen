"use client";

import * as React from "react";
import Link from "next/link";

import { ThemeMenu } from "@/components/theme-menu";

import {
  Card,
  Evidence,
  Eyebrow,
  Gauge,
  InfoCard,
  LoopMap,
  Panel,
  Pill,
  PipelineStrip,
  StatGroup,
} from "@/components/ui";

const SG_WORKFLOW = [
  {
    n: 1,
    title: "Collect customer signals",
    copy: "Connect your social media / customer channels or upload feedback screenshots so SignalGen can watch for useful product evidence.",
  },
  {
    n: 2,
    title: "Detect the product signal",
    copy: "Event-driven and periodic runs extract comments, cluster repeated pain points, and explain the strongest signal with evidence.",
  },
  {
    n: 3,
    title: "Approve the implementation plan",
    copy: "Review the proposed product change, affected files, acceptance criteria, and guardrails before code changes happen.",
  },
  {
    n: 4,
    title: "Create a safe PR",
    copy: "The agent edits your product repo on a branch, runs verification, opens a reviewable GitHub PR, and links real previews only when available.",
  },
];

const SG_MEMORY = [
  "Original feedback source and extracted customer comments",
  "Top signal, confidence, evidence, and founder decision",
  "Generated plan, guardrails, and approval history",
  "Changed files, verification result, PR, and preview link when real",
];

const sampleEvidence = [
  "I got confused during setup.",
  "Where do I even start?",
];

function useRevealOnScroll() {
  const ref = React.useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const reducedTimer = window.setTimeout(() => setRevealed(true), 0);
      return () => window.clearTimeout(reducedTimer);
    }

    const element = ref.current;
    const fallback = window.setTimeout(() => setRevealed(true), 900);

    if (!element || typeof IntersectionObserver === "undefined") {
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevealed(true);
      },
      { threshold: 0.05, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return { ref, revealed };
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-full text-[var(--ink)] no-underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-[var(--signal-soft)]">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--signal),var(--signal-2))] font-[var(--display)] text-base font-extrabold text-[#1a0a08] shadow-[var(--glow)]">
        SG
      </span>
      <span className="text-lg font-extrabold tracking-[-0.02em]">SignalGen</span>
    </Link>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ThemeMenu />
          <a className="sg-btn sg-btn--ghost sg-btn--sm" href="https://github.com/viviannnl/SignalGen">
            GitHub
          </a>
          <a className="sg-btn sg-btn--primary sg-btn--sm" href="/dashboard">
            Open dashboard
          </a>
        </div>
      </div>
    </header>
  );
}

function HeroCard() {
  return (
    <Card className="sg-fadeup relative overflow-hidden bg-[var(--hero-grad)] p-[var(--pad-card)]">
      <div className="flex flex-col items-start justify-between gap-5 md:flex-row">
        <div>
          <Eyebrow>Illustrative Signal Room</Eyebrow>
          <h2 className="sg-display mt-2 max-w-[360px] text-[clamp(1.8rem,4vw,2.25rem)] leading-[1.04]">
            Users need clearer onboarding
          </h2>
          <p className="mt-3 max-w-[360px] text-sm leading-6 text-[var(--ink-soft)]">
            Sample UI only: this card shows how a signal, evidence, and pipeline feel in the product.
          </p>
        </div>
        <Gauge value={0.74} size={104} stroke={10} label="illustrative confidence" sub="example" />
      </div>

      <div className="mt-6">
        <Eyebrow soft className="mb-3">Evidence format</Eyebrow>
        <div className="grid gap-2">
          {sampleEvidence.map((quote, index) => (
            <Evidence key={quote} quote={quote} frequency={0} severity="sample" confidence={0.74} i={index} />
          ))}
        </div>
      </div>

      <Panel className="mt-5 p-4">
        <Eyebrow soft className="mb-2">Recommended change format</Eyebrow>
        <p className="m-0 text-[15px] leading-6 text-[var(--ink)]">
          Draft a reviewable improvement for your product&apos;s getting-started flow, then wait for founder approval before any code changes ship.
        </p>
      </Panel>

      <div className="mt-5">
        <PipelineStrip current={3} labels={false} />
      </div>
    </Card>
  );
}

function Hero() {
  return (
    <section className="sg-hero mx-auto grid max-w-[1200px] items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-[72px]">
      <div>
        <Pill variant="signal" className="mb-6">Google Cloud Rapid Agent Hackathon</Pill>
        <h1 className="sg-display m-0 text-[clamp(3rem,7vw,5.25rem)] leading-[0.96]">
          From customer<br />signal to<br />
          <span className="text-[var(--signal)]">product PR.</span>
        </h1>
        <p className="mb-8 mt-6 max-w-[500px] text-[19px] leading-[1.55] text-[var(--ink-soft)]">
          SignalGen is an event-driven and periodic AI product-iteration agent that turns feedback from your social media / customer channels into safe, reviewable product changes — keeping founders in control of every step.
        </p>
        <div className="flex flex-wrap gap-3">
          <a className="sg-btn sg-btn--signal sg-btn--lg" href="/dashboard">
            Open dashboard
          </a>
          <a className="sg-btn sg-btn--ghost sg-btn--lg" href="#workflow">
            View workflow
          </a>
        </div>
      </div>
      <HeroCard />
    </section>
  );
}

function Workflow() {
  const { ref, revealed } = useRevealOnScroll();
  const revealStyle = (delay = 0): React.CSSProperties => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? "none" : "translateY(16px)",
    transition: revealed ? `opacity .55s cubic-bezier(.2,.7,.2,1) ${delay}ms, transform .55s cubic-bezier(.2,.7,.2,1) ${delay}ms` : "none",
  });

  return (
    <section id="workflow" ref={ref} className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
      <Eyebrow>Agent workflow</Eyebrow>
      <h2 className="sg-display mb-2 mt-3 text-[clamp(2rem,4vw,3.25rem)] leading-[1.04]">
        Human-approved automation,<br />with guardrails.
      </h2>
      <p className="mb-9 max-w-[620px] text-[17px] leading-7 text-[var(--ink-soft)]">
        The signal travels one visible loop — and never crosses the approval gate without you. Each run is stored, closing back into the next product iteration.
      </p>

      <div className="mb-10" style={revealStyle()}>
        <LoopMap stage={4} signalValue={74} runLabel="sample flow" title="Illustrative product iteration loop" />
      </div>

      <div className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-4">
        {SG_WORKFLOW.map((step, index) => (
          <div key={step.n} style={revealStyle(index * 120)}>
            <InfoCard className="h-full p-6" eyebrow={`Step ${step.n}`} title={step.title} description={step.copy}>
              <span className="mt-5 grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--signal)] bg-[var(--signal-soft)] font-[var(--display)] text-lg font-extrabold text-[var(--signal)]">
                {step.n}
              </span>
            </InfoCard>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemoryTeaser() {
  return (
    <section id="memory" className="mx-auto max-w-[1200px] px-5 pb-24 pt-5 sm:px-8">
      <Card className="grid items-center gap-8 p-[clamp(1.75rem,4vw,3.25rem)] md:grid-cols-2 md:gap-12">
        <div>
          <Eyebrow>MongoDB memory</Eyebrow>
          <h2 className="sg-display mb-4 mt-3 text-[clamp(1.9rem,3.5vw,2.75rem)] leading-[1.04]">
            The memory layer of the founder&apos;s product iteration loop.
          </h2>
          <p className="max-w-[460px] text-base leading-7 text-[var(--ink-soft)]">
            SignalGen stores the path from customer evidence to founder approval to reviewable change, so future product decisions can learn from earlier runs.
          </p>
          <StatGroup
            className="mt-7"
            stats={[
              { label: "loop", value: "Evidence" },
              { label: "gate", value: "Approval" },
              { label: "memory", value: "Trace" },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SG_MEMORY.map((item, index) => (
            <Panel key={item} className="flex items-start gap-3 p-4">
              <span className="sg-mono mt-0.5 text-[11px] font-semibold text-[var(--signal)]">{String(index + 1).padStart(2, "0")}</span>
              <span className="text-sm leading-6 text-[var(--ink)]">{item}</span>
            </Panel>
          ))}
        </div>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-7 sm:px-8">
        <Logo />
        <span className="sg-meta">From customer signal to product PR · Built for the Google Cloud Rapid Agent Hackathon</span>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <TopBar />
      <Hero />
      <Workflow />
      <MemoryTeaser />
      <Footer />
    </main>
  );
}
