"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { SignalGenRun } from "@/lib/types";

type ApiRun = SignalGenRun & { _id: string };

export default function DashboardPage() {
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRun = runs[0];
  const fileNames = useMemo(() => files.map((file) => file.name), [files]);

  async function loadRuns() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load SignalGen runs.");
      }
      const data = (await response.json()) as { runs: ApiRun[] };
      setRuns(data.runs);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function createRun() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshotNames: fileNames }),
      });

      if (!response.ok) {
        throw new Error("Could not create a SignalGen run.");
      }

      const data = (await response.json()) as { run: ApiRun };
      setRuns((currentRuns) => [data.run, ...currentRuns]);
      setFiles([]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/runs", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load SignalGen runs.");
        }
        return response.json() as Promise<{ runs: ApiRun[] }>;
      })
      .then((data) => {
        if (isMounted) {
          setRuns(data.runs);
          setError(null);
        }
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#080b12] px-6 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <nav className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Link href="/" className="text-sm text-cyan-200 hover:text-cyan-100">
              ← SignalGen home
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Founder signal dashboard</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Upload feedback screenshots, generate a first product signal, and store the run in MongoDB as the memory layer.
            </p>
          </div>
          <button
            onClick={() => void loadRuns()}
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-100"
          >
            Refresh runs
          </button>
        </nav>

        {error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">New run</p>
            <h2 className="mt-3 text-2xl font-semibold">Upload screenshots</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This first version stores the uploaded screenshot names and creates a demo signal run in MongoDB. Next, we will connect OCR and Gemini.
            </p>

            <label className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-cyan-300/30 bg-cyan-300/5 p-6 text-center transition hover:border-cyan-200/60 hover:bg-cyan-300/10">
              <span className="text-lg font-semibold">Drop or choose screenshots</span>
              <span className="mt-2 text-sm text-slate-300">PNG, JPG, or WebP comment screenshots</span>
              <input
                multiple
                accept="image/png,image/jpeg,image/webp"
                type="file"
                className="sr-only"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>

            {fileNames.length > 0 ? (
              <div className="mt-5 rounded-2xl bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-white">Selected screenshots</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {fileNames.map((name) => (
                    <li key={name}>• {name}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              onClick={() => void createRun()}
              disabled={isCreating}
              className="mt-6 w-full rounded-full bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Creating run..." : "Create SignalGen run"}
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Latest memory</p>
            {isLoading ? (
              <p className="mt-5 text-slate-300">Loading MongoDB runs...</p>
            ) : latestRun ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-3 rounded-3xl bg-slate-950/70 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Top signal</p>
                    <h2 className="mt-2 text-2xl font-semibold">{latestRun.signal.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{latestRun.signal.summary}</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    {Math.round(latestRun.signal.confidence * 100)}%
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <InfoCard title="Evidence" items={latestRun.signal.evidence} />
                  <InfoCard title="Guardrails" items={latestRun.plan.guardrails} />
                  <InfoCard title="Files to change" items={latestRun.plan.filesToChange} />
                  <InfoCard title="Acceptance criteria" items={latestRun.plan.acceptanceCriteria} />
                </div>

                <div className="rounded-3xl bg-slate-950/70 p-5">
                  <p className="text-sm text-slate-400">Recommended product change</p>
                  <p className="mt-2 text-slate-100">{latestRun.plan.recommendedChange}</p>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-slate-300">No runs yet. Create the first SignalGen run.</p>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Run history</p>
              <h2 className="mt-3 text-2xl font-semibold">MongoDB product-iteration memory</h2>
            </div>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm text-slate-300">{runs.length} runs</span>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            {runs.length > 0 ? (
              <div className="divide-y divide-white/10">
                {runs.map((run) => (
                  <div key={run._id} className="grid gap-3 bg-slate-950/50 p-4 md:grid-cols-[1fr_1.3fr_0.7fr] md:items-center">
                    <div>
                      <p className="font-semibold">{run.signal.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(run.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-slate-300">{run.plan.recommendedChange}</p>
                    <div className="flex justify-start md:justify-end">
                      <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-sm text-cyan-200">{run.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-slate-300">No run history yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-slate-950/70 p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
