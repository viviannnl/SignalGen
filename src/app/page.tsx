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
    copy: "The agent edits LetterGen on a branch, runs the build, opens a GitHub PR, and links the Vercel preview.",
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
    <main className="min-h-screen bg-[#080b12] text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-10 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400 font-bold text-slate-950">
              SG
            </div>
            <span className="text-lg font-semibold tracking-tight">SignalGen</span>
          </div>
          <a
            href="https://github.com/viviannnl/SignalGen"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
          >
            GitHub
          </a>
        </nav>

        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
              Google Cloud Rapid Agent Hackathon
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                From customer signal to product PR.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                SignalGen is an AI product-iteration agent that turns feedback screenshots into safe,
                reviewable product changes for founder-led products like LetterGen.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#workflow"
                className="rounded-full bg-cyan-300 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                View workflow
              </a>
              <a
                href="#memory"
                className="rounded-full border border-white/15 px-6 py-3 text-center font-semibold text-white transition hover:border-white/30 hover:bg-white/5"
              >
                See memory layer
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/40 backdrop-blur">
            <div className="rounded-[1.5rem] bg-slate-950 p-5">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-slate-400">Current signal</p>
                  <h2 className="text-xl font-semibold">AI cover letters sound generic</h2>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">91%</span>
              </div>
              <div className="space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <p className="font-medium text-white">Evidence</p>
                  <p className="mt-2">“AI写出来会不会很假？”</p>
                  <p>“我怕HR一看就是AI”</p>
                  <p>“能不能更像我自己写的？”</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <p className="font-medium text-white">Recommended change</p>
                  <p className="mt-2">Add a trust section explaining how LetterGen personalizes each cover letter.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/[0.04] p-4">
                    <p className="text-slate-400">Build</p>
                    <p className="mt-1 font-semibold text-emerald-300">Passed</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] p-4">
                    <p className="text-slate-400">PR</p>
                    <p className="mt-1 font-semibold text-cyan-300">Ready</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="workflow" className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Agent workflow</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Human-approved automation with guardrails.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item, index) => (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
                  {index + 1}
                </div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="memory" className="grid gap-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[0.85fr_1.15fr] md:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">MongoDB memory</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">The memory layer of the founder’s product iteration loop.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {memoryItems.map((item) => (
              <div key={item} className="rounded-2xl bg-slate-950/70 p-4 text-sm leading-6 text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
