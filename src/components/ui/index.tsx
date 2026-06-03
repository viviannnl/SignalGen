"use client";

import * as React from "react";

import type { SignalGenRunStatus, SignalSeverity, SignalType } from "@/lib/types";

type ClassValue = string | false | null | undefined;

function cx(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(" ");
}

function pct(value: number | undefined | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not available";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function labelize(value: string | undefined | null) {
  return value ? value.replaceAll("_", " ") : "Not available";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export type IconName =
  | "arrow"
  | "arrowL"
  | "check"
  | "refresh"
  | "spark"
  | "upload"
  | "branch"
  | "pr"
  | "shield"
  | "file"
  | "eye"
  | "x"
  | "clock"
  | "layers"
  | "bolt";

export function Icon({ name, size = 18, stroke = 2, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    arrowL: <path d="M19 12H5M11 6l-6 6 6 6" />,
    check: <path d="M4 12l5 5L20 6" />,
    refresh: <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
    upload: <path d="M12 16V4M7 9l5-5 5 5M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />,
    branch: <path d="M6 4v12a3 3 0 0 0 3 3h6M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0c0 4-3 5-6 5" />,
    pr: <path d="M6 4v12M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 12a2 2 0 1 0 0 .01M18 20V9a3 3 0 0 0-3-3h-4m0 0l3-3m-3 3l3 3M18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />,
    shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
    file: <path d="M14 3v5h5M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />,
    eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    clock: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />,
    layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
    bolt: <path d="M13 3L4 14h7l-1 7 9-11h-7z" />,
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      {paths[name]}
    </svg>
  );
}

export type ButtonVariant = "primary" | "signal" | "ghost" | "soft" | "success" | "danger" | "rose" | "secondary";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "sg-btn--primary",
  rose: "sg-btn--primary",
  signal: "sg-btn--signal",
  ghost: "sg-btn--ghost",
  secondary: "sg-btn--ghost",
  soft: "sg-btn--soft",
  success: "sg-btn--success",
  danger: "sg-btn--danger",
};

export function Button({ variant = "primary", size = "md", block = false, loading = false, leftIcon, rightIcon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("sg-btn", buttonVariantClass[variant], size !== "md" && `sg-btn--${size}`, block && "sg-btn--block", className)}
    >
      {loading ? (
        <span className="sg-spin" aria-hidden="true" style={{ display: "grid" }}>
          <Icon name="refresh" size={15} />
        </span>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}

export type PillVariant = "success" | "warning" | "error" | "info" | "signal" | "outline";
export type PillProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: PillVariant; dot?: boolean };

export function Pill({ variant = "outline", dot = false, className, children, ...props }: PillProps) {
  return (
    <span {...props} className={cx("sg-pill", `sg-pill--${variant}`, className)}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("sg-card", className)} />;
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("sg-panel", className)} />;
}

export function Eyebrow({ soft = false, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { soft?: boolean }) {
  return <div {...props} className={cx("sg-eyebrow", soft && "soft", className)} />;
}

export type FieldProps = React.HTMLAttributes<HTMLLabelElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
};

export function Field({ label, hint, error, children, className, ...props }: FieldProps) {
  const helpId = React.useId();
  const helpText = error || hint;
  const describedBy = helpText ? `${helpId}-help` : undefined;
  const child = describedBy && React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": cx((children.props as { "aria-describedby"?: string })["aria-describedby"], describedBy),
      })
    : children;

  return (
    <label {...props} className={cx(className)} style={{ display: "grid", gap: 7, ...(props.style ?? {}) }}>
      {label && <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>{label}</span>}
      {child}
      {helpText && <span id={describedBy} style={{ fontSize: 12.5, color: error ? "var(--error)" : "var(--ink-faint)" }}>{helpText}</span>}
    </label>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean };
export function Input({ className, error, ...props }: InputProps) {
  return <input {...props} aria-invalid={error || undefined} className={cx("sg-input", className)} style={{ borderColor: error ? "var(--error)" : undefined, ...(props.style ?? {}) }} />;
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean };
export function Textarea({ className, error, ...props }: TextareaProps) {
  return <textarea {...props} aria-invalid={error || undefined} className={cx("sg-textarea", className)} style={{ borderColor: error ? "var(--error)" : undefined, ...(props.style ?? {}) }} />;
}

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} role={props.role ?? "tablist"} className={cx("sg-tabs", className)} />;
}

export type TabProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean };
export function Tab({ selected = false, className, ...props }: TabProps) {
  return <button {...props} type={props.type ?? "button"} role="tab" aria-selected={selected} className={cx("sg-tab", className)} />;
}

export function MetricTile({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Panel className={className} style={{ padding: 18 }}>
      <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 28, color: "var(--ink)", lineHeight: 1 }}>{value}</div>
      <div className="sg-eyebrow soft" style={{ marginTop: 8 }}>{label}</div>
      {hint && <div style={{ marginTop: 7, color: "var(--ink-soft)", fontSize: 13.5 }}>{hint}</div>}
    </Panel>
  );
}

export function InfoList({ title, items, icon = "check", accent = "var(--signal)", className }: { title?: React.ReactNode; items: React.ReactNode[]; icon?: IconName; accent?: string; className?: string }) {
  return (
    <div className={className}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ color: accent }}><Icon name={icon} size={16} /></span>
          <span className="sg-eyebrow" style={{ color: accent }}>{title}</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, index) => (
          <div key={index} className="sg-inset" style={{ padding: "11px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: accent, marginTop: 2, flex: "none" }}><Icon name="check" size={14} /></span>
            <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InfoCard({ eyebrow, title, description, children, className }: { eyebrow?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <Card className={className} style={{ padding: "var(--pad-card)" }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && <h3 style={{ margin: eyebrow ? "8px 0 6px" : "0 0 6px", fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{title}</h3>}
      {description && <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.55 }}>{description}</p>}
      {children}
    </Card>
  );
}

export function StatGroup({ stats, className }: { stats: Array<{ label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }>; className?: string }) {
  return (
    <div className={className} style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
      {stats.map((stat, index) => (
        <div key={index}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--signal)", lineHeight: 1 }}>{stat.value}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-faint)", marginTop: 5 }}>{stat.label}</div>
          {stat.hint && <div style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 4 }}>{stat.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export type GaugeProps = {
  value?: number;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  animate?: boolean;
  className?: string;
};

export function Gauge({ value = 0.9, size = 120, stroke = 11, label = "signal", sub, animate = true, className }: GaugeProps) {
  const reduced = usePrefersReducedMotion();
  const shouldAnimate = animate && !reduced;
  const safeValue = Math.max(0, Math.min(1, value));
  const [visibleValue, setVisibleValue] = React.useState(shouldAnimate ? 0 : safeValue);
  const reactId = React.useId().replaceAll(":", "");
  const gradientId = `sg-gauge-${reactId}`;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  React.useEffect(() => {
    if (!shouldAnimate) return;
    const timer = window.setTimeout(() => setVisibleValue(safeValue), 80);
    return () => window.clearTimeout(timer);
  }, [safeValue, shouldAnimate]);

  const displayValue = shouldAnimate ? visibleValue : safeValue;

  return (
    <figure
      className={className}
      aria-label={`${label}: ${pct(safeValue)}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue * 100)}
      aria-valuetext={pct(safeValue)}
      style={{ position: "relative", width: size, height: size, flex: "none", margin: 0 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--signal)" />
            <stop offset="1" stopColor="var(--signal-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--rail-off)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - displayValue)}
          style={{ transition: shouldAnimate ? "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" : "none", filter: "drop-shadow(0 0 6px var(--signal-soft))" }}
        />
      </svg>
      <figcaption style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <b style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: size * 0.27, lineHeight: 1, color: "var(--ink)" }}>
          {Math.round(safeValue * 100)}<span style={{ fontSize: size * 0.13, color: "var(--signal)" }}>%</span>
        </b>
        <small style={{ fontFamily: "var(--mono)", fontSize: Math.max(8, size * 0.078), letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-faint)", marginTop: 2, textAlign: "center" }}>{sub || label}</small>
      </figcaption>
    </figure>
  );
}

export function ConfRing(props: GaugeProps) {
  return <Gauge {...props} />;
}

export function StrengthBar({ value = 0.7, label = "strength", className }: { value?: number; label?: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const safeValue = Math.max(0, Math.min(1, value));
  const [width, setWidth] = React.useState(reduced ? safeValue : 0);

  React.useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setWidth(safeValue), 120);
    return () => window.clearTimeout(timer);
  }, [safeValue, reduced]);

  const displayWidth = reduced ? safeValue : width;

  return (
    <div
      className={className}
      aria-label={`${label}: ${pct(safeValue)}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue * 100)}
      aria-valuetext={pct(safeValue)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>{pct(safeValue)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--rail-off)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${displayWidth * 100}%`, borderRadius: 999, background: "linear-gradient(90deg,var(--signal),var(--signal-2))", transition: reduced ? "none" : "width 1s cubic-bezier(.2,.7,.2,1)" }} />
      </div>
    </div>
  );
}

export type SignalStage = {
  key: string;
  short: string;
  label: string;
  icon: IconName;
  gate?: boolean;
};

export const SG_STAGES: readonly SignalStage[] = [
  { key: "uploaded", short: "Upload", label: "Screenshots uploaded", icon: "upload" },
  { key: "extracted", short: "Extract", label: "Comments extracted", icon: "layers" },
  { key: "signal_detected", short: "Signal", label: "Signal detected", icon: "spark" },
  { key: "plan_ready", short: "Plan", label: "Plan generated", icon: "file" },
  { key: "approved", short: "Approve", label: "Founder approval", icon: "shield", gate: true },
  { key: "branch_created", short: "Branch", label: "Branch created", icon: "branch" },
  { key: "checks_running", short: "Checks", label: "Build & tests", icon: "bolt" },
  { key: "pr_created", short: "PR", label: "Pull request opened", icon: "pr" },
  { key: "preview_ready", short: "Preview", label: "Vercel preview", icon: "eye" },
];

const STAGE_KEY_STAGE: Record<string, number> = Object.fromEntries(SG_STAGES.map((stage, index) => [stage.key, index]));

const RUN_STATUS_STAGE: Record<SignalGenRunStatus, number> = {
  uploaded: 0,
  signal_detected: 2,
  plan_ready: 3,
  approved: 4,
  // A rejection is a founder decision at the approval gate; no implementation stages run.
  rejected: 4,
  // Failed runs can happen during extraction/LLM/planning/implementation. Surface them near checks so the rail shows a verification failure endpoint.
  failed: 6,
  pr_created: 7,
  // Human review is another approval-gate state before code is allowed to proceed.
  needs_review: 4,
  // Insufficient evidence means a weak/partial signal was detected but should not advance to planning.
  insufficient_evidence: 2,
};

export function stageIndex(status: SignalGenRunStatus | string | number | null | undefined) {
  if (typeof status === "number") return Math.max(0, Math.min(SG_STAGES.length - 1, status));
  if (!status) return 0;
  return RUN_STATUS_STAGE[status as SignalGenRunStatus] ?? STAGE_KEY_STAGE[status] ?? 2;
}

export function PipelineRail({ status, current, running = false, runningStage = -1, className }: { status?: SignalGenRunStatus | string; current?: number; running?: boolean; runningStage?: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const rawIndex = current ?? stageIndex(status);
  const activeIndex = Math.max(0, Math.min(SG_STAGES.length - 1, rawIndex));
  return (
    <div className={className} role="list" aria-label="Run pipeline" style={{ display: "flex", flexDirection: "column" }}>
      {SG_STAGES.map((stage, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const reached = index <= activeIndex;
        const isRunning = running && index === runningStage;
        const accent = stage.gate ? "var(--signal-2)" : "var(--signal)";
        return (
          <div key={stage.key} role="listitem" aria-current={active ? "step" : undefined} aria-label={`${stage.label}: ${done ? "completed" : active ? "current" : "pending"}`} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span
                aria-hidden="true"
                style={{
                  width: stage.gate ? 40 : 34,
                  height: stage.gate ? 40 : 34,
                  borderRadius: stage.gate ? 12 : "50%",
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  background: reached ? (stage.gate ? "linear-gradient(135deg,var(--signal),var(--signal-2))" : "var(--plum-soft)") : "var(--inset)",
                  border: `1.5px solid ${reached ? accent : "var(--line-2)"}`,
                  color: reached ? (stage.gate ? "#1a0a08" : "var(--signal)") : "var(--ink-faint)",
                  boxShadow: active ? "var(--glow)" : "none",
                  animation: isRunning && !reduced ? "sgGlow 1.1s ease-in-out infinite" : "none",
                  transition: reduced ? "none" : "all .4s",
                }}
              >
                {done ? <Icon name="check" size={stage.gate ? 19 : 16} /> : isRunning ? <span className="sg-spin" style={{ display: "grid" }}><Icon name="refresh" size={15} /></span> : <Icon name={stage.icon} size={stage.gate ? 19 : 15} />}
              </span>
              {index < SG_STAGES.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 16, background: index < activeIndex ? "linear-gradient(var(--signal),var(--signal-2))" : "var(--rail-off)", transition: reduced ? "none" : "background .5s" }} />}
            </div>
            <div style={{ paddingBottom: index < SG_STAGES.length - 1 ? 16 : 0, paddingTop: 5 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: stage.gate ? "var(--signal-2)" : reached ? "var(--signal)" : "var(--ink-faint)", fontWeight: 600 }}>
                {stage.gate ? "Approval gate" : `Stage ${index + 1}`}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: reached ? 700 : 500, color: reached ? "var(--ink)" : "var(--ink-faint)", marginTop: 1 }}>{stage.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineStrip({ status, current, stages = SG_STAGES, labels = true, className }: { status?: SignalGenRunStatus | string; current?: number; stages?: readonly SignalStage[]; labels?: boolean; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const rawIndex = current ?? stageIndex(status);
  const activeIndex = Math.max(0, Math.min(stages.length - 1, rawIndex));
  return (
    <div className={className} role="list" aria-label="Run pipeline summary" style={{ display: "flex", alignItems: "center", width: "100%", minWidth: 0, overflowX: "auto", paddingBottom: 2 }}>
      {stages.map((stage, index) => {
        const reached = index <= activeIndex;
        return (
          <React.Fragment key={stage.key}>
            <div role="listitem" aria-current={index === activeIndex ? "step" : undefined} aria-label={`${stage.label}: ${index < activeIndex ? "completed" : index === activeIndex ? "current" : "pending"}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none" }}>
              <span
                aria-label={`${stage.short}: ${reached ? "reached" : "pending"}`}
                style={{
                  width: stage.gate ? 17 : 13,
                  height: stage.gate ? 17 : 13,
                  borderRadius: stage.gate ? 5 : "50%",
                  background: reached ? (stage.gate ? "var(--signal-2)" : "var(--signal)") : "var(--rail-off)",
                  boxShadow: reached ? "0 0 12px var(--signal-soft)" : "none",
                  transition: reduced ? "none" : "all .4s",
                  flex: "none",
                }}
              />
              {labels && <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: reached ? "var(--ink-soft)" : "var(--ink-faint)", fontWeight: 600, whiteSpace: "nowrap" }}>{stage.short}</span>}
            </div>
            {index < stages.length - 1 && <span style={{ height: 2, flex: "1 1 18px", minWidth: 18, margin: labels ? "0 4px 18px" : "0 4px", background: index < activeIndex ? "linear-gradient(90deg,var(--signal),var(--signal-2))" : "var(--rail-off)", transition: reduced ? "none" : "background .5s" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

type LoopKey = "feedback" | "signal" | "plan" | "gate" | "pr" | "memory";

type LoopNodeModel = {
  key: LoopKey;
  x: number;
  y: number;
  w: number;
  h: number;
  icon: IconName;
  kicker: string;
  title: string;
  sub: string;
  gate?: boolean;
};

const LOOP_NODES: LoopNodeModel[] = [
  { key: "feedback", x: 24, y: 48, w: 150, h: 128, icon: "layers", kicker: "intake", title: "Feedback", sub: "screenshots → comments" },
  { key: "signal", x: 224, y: 48, w: 150, h: 128, icon: "spark", kicker: "detect", title: "Signal", sub: "confidence" },
  { key: "plan", x: 424, y: 48, w: 150, h: 128, icon: "file", kicker: "draft", title: "Plan", sub: "files · guardrails" },
  { key: "gate", x: 612, y: 48, w: 150, h: 128, icon: "shield", kicker: "approval gate", title: "Approve", sub: "human in control", gate: true },
  { key: "pr", x: 806, y: 48, w: 150, h: 128, icon: "pr", kicker: "ship", title: "Safe PR", sub: "branch · checks · preview" },
  { key: "memory", x: 390, y: 318, w: 200, h: 100, icon: "refresh", kicker: "stored", title: "Memory", sub: "informs the next iteration" },
];

const LOOP_ORDER: LoopKey[] = ["feedback", "signal", "plan", "gate", "pr"];

function macroFromStage(stage: number) {
  if (stage <= 1) return 0;
  if (stage === 2) return 1;
  if (stage === 3) return 2;
  if (stage === 4) return 3;
  return 4;
}

function LoopNode({ node, state, value, onNode }: { node: LoopNodeModel; state: "done" | "active" | "pending"; value?: number | null; onNode?: (key: LoopKey) => void }) {
  const active = state === "active";
  const done = state === "done";
  const gateActive = node.gate && active;
  const NodeTag = onNode ? "button" : "article";
  return (
    <NodeTag
      {...(onNode ? { type: "button" as const, onClick: () => onNode?.(node.key) } : {})}
      className={active ? "sg-fadeup" : undefined}
      aria-current={active ? "step" : undefined}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        textAlign: "left",
        cursor: onNode ? "pointer" : "default",
        background: gateActive ? "linear-gradient(135deg,var(--signal),var(--signal-2))" : "var(--node-bg)",
        border: `1.5px solid ${active ? "var(--signal)" : done ? "var(--connector)" : "var(--line-2)"}`,
        borderRadius: 16,
        padding: "13px 15px",
        boxShadow: active ? "var(--glow), var(--shadow-card)" : done ? "var(--shadow-card)" : "none",
        opacity: state === "pending" ? 0.72 : 1,
        transition: "all .4s cubic-bezier(.2,.7,.2,1)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        justifyContent: "center",
        fontFamily: "var(--sans)",
        color: "var(--ink)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", flex: "none", background: gateActive ? "rgba(26,10,8,.18)" : active || done ? "var(--signal-soft)" : "var(--inset)", color: gateActive ? "#1a0a08" : active || done ? "var(--signal)" : "var(--ink-faint)" }}>
          <Icon name={done ? "check" : node.icon} size={16} />
        </span>
        {value != null && <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: gateActive ? "#1a0a08" : "var(--signal)" }}>{Math.round(value)}<span style={{ fontSize: 12 }}>%</span></span>}
        {node.gate && value == null && <span className="sg-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: gateActive ? "rgba(26,10,8,.7)" : "var(--ink-faint)", fontWeight: 600 }}>gate</span>}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600, color: gateActive ? "rgba(26,10,8,.7)" : active ? "var(--signal)" : "var(--ink-faint)" }}>{node.kicker}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: gateActive ? "#1a0a08" : "var(--ink)", lineHeight: 1 }}>{node.title}</div>
      <div style={{ fontSize: 11.5, color: gateActive ? "rgba(26,10,8,.7)" : "var(--ink-soft)", lineHeight: 1.25 }}>{node.sub}</div>
    </NodeTag>
  );
}

export function LoopMap({ stage = 3, signalValue = 91, onNode, title = "Iteration loop", runLabel = "run-8800", className }: { stage?: number | SignalGenRunStatus | string; signalValue?: number; onNode?: (key: LoopKey) => void; title?: string; runLabel?: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const currentStage = stageIndex(stage);
  const macro = macroFromStage(currentStage);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth || element.getBoundingClientRect().width;
      if (width) setScale(Math.min(1, width / 980));
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ResizeObserverCtor = typeof ResizeObserver === "undefined" ? null : ResizeObserver;
    const observer = ResizeObserverCtor ? new ResizeObserverCtor(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const stateFor = (key: LoopKey) => {
    if (key === "memory") return currentStage >= 2 ? "done" : "pending";
    const index = LOOP_ORDER.indexOf(key);
    if (index < macro) return "done";
    if (index === macro) return "active";
    return "pending";
  };
  const reached = (index: number) => index < macro;

  return (
    <Card className={cx("sg-grid-bg-lg sg-ticked", className)} style={{ padding: "22px 24px 18px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6, position: "relative", zIndex: 2 }}>
        <Eyebrow>{title}</Eyebrow>
        <Pill variant="outline">{runLabel}</Pill>
      </div>
      <div ref={wrapRef} style={{ width: "100%", height: 452 * scale, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 980, height: 452, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <svg width="980" height="452" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
            <defs>
              <marker id="lmArrow" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
                <path d="M1 1 L7 4.5 L1 8" fill="none" stroke="var(--connector)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {[[178, 220], [378, 420], [578, 608], [766, 802]].map(([x1, x2], index) => (
              <line key={index} x1={x1} y1={112} x2={x2} y2={112} stroke="var(--connector)" strokeWidth="1.8" className={reached(index) && !reduced ? "sg-flow" : undefined} strokeDasharray="7 7" opacity={reached(index) ? 0.95 : 0.4} markerEnd="url(#lmArrow)" />
            ))}
            <path d="M 881 176 C 881 282, 720 368, 594 368" fill="none" stroke="var(--connector)" strokeWidth="1.8" strokeDasharray="7 7" opacity={macro >= 4 ? 0.95 : 0.4} className={macro >= 4 && !reduced ? "sg-flow" : undefined} markerEnd="url(#lmArrow)" />
            <path d="M 386 368 C 240 368, 99 282, 99 180" fill="none" stroke="var(--connector)" strokeWidth="1.8" strokeDasharray="7 7" opacity=".55" markerEnd="url(#lmArrow)" />
          </svg>
          {LOOP_NODES.map((node) => <LoopNode key={node.key} node={node} state={stateFor(node.key)} value={node.key === "signal" ? signalValue : null} onNode={onNode} />)}
          <div style={{ position: "absolute", left: 150, top: 250, fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-faint)", maxWidth: 150, lineHeight: 1.5 }}>
            stored end-to-end ↺<br />feeds the next loop
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--signal)" }} /> active</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid var(--connector)" }} /> done</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "linear-gradient(135deg,var(--signal),var(--signal-2))" }} /> approval gate · nothing ships without you</span>
      </div>
    </Card>
  );
}

export function Evidence({ e, quote, frequency, severity, confidence, i = 0, className }: { e?: { comment?: string; quote?: string; frequency?: number; severity?: string; confidence?: number }; quote?: string; frequency?: number; severity?: SignalSeverity | string; confidence?: number; i?: number; className?: string }) {
  const text = quote ?? e?.quote ?? e?.comment ?? "Evidence unavailable";
  const count = frequency ?? e?.frequency ?? 0;
  const tone = severity ?? e?.severity ?? "medium";
  const conf = confidence ?? e?.confidence ?? 0;
  return (
    <blockquote className={cx("sg-tune", className)} style={{ animationDelay: `${i * 70}ms`, background: "var(--signal-soft)", borderLeft: "2.5px solid var(--signal)", borderRadius: "0 12px 12px 0", padding: "12px 15px", margin: 0 }}>
      <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.5 }}>“{text}”</div>
      <footer style={{ display: "flex", gap: 12, marginTop: 8, fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", flexWrap: "wrap" }}>
        <span>{count} mentions</span>
        <span aria-hidden="true">·</span>
        <span>{tone} severity</span>
        <span aria-hidden="true">·</span>
        <span>{pct(conf)} conf</span>
      </footer>
    </blockquote>
  );
}

function typeMeta(type?: SignalType | string) {
  const map: Record<string, { variant: PillVariant; label: string }> = {
    feature_request: { variant: "signal", label: "Feature request" },
    friction: { variant: "info", label: "Friction" },
    ux_friction: { variant: "info", label: "UX friction" },
    bug: { variant: "error", label: "Bug" },
    trust_objection: { variant: "warning", label: "Trust objection" },
    pricing: { variant: "warning", label: "Pricing" },
    praise: { variant: "success", label: "Praise" },
    noise: { variant: "outline", label: "Noise" },
  };
  return map[type ?? ""] ?? { variant: "outline", label: labelize(type) };
}

function statusMeta(status?: SignalGenRunStatus | string) {
  const map: Record<string, { variant: PillVariant; label: string }> = {
    approved: { variant: "success", label: "Approved" },
    rejected: { variant: "error", label: "Rejected" },
    failed: { variant: "error", label: "Failed" },
    plan_ready: { variant: "warning", label: "Awaiting approval" },
    needs_review: { variant: "warning", label: "Needs review" },
    signal_detected: { variant: "info", label: "Gathering evidence" },
    insufficient_evidence: { variant: "info", label: "Needs more evidence" },
    pr_created: { variant: "signal", label: "PR open" },
    uploaded: { variant: "outline", label: "Uploaded" },
  };
  return map[status ?? ""] ?? { variant: "outline", label: labelize(status) };
}

export type MemoryEntryProps = {
  s?: {
    title: string;
    type?: SignalType | string;
    status?: SignalGenRunStatus | string;
    pipelineStatus?: SignalGenRunStatus | string;
    updatedAt?: string;
    confidence?: number;
    evidence?: Array<{ frequency?: number }>;
    decision?: { note?: string; action?: string } | null;
    plan?: { filesToChange?: string[] } | null;
  };
  title?: string;
  type?: SignalType | string;
  status?: SignalGenRunStatus | string;
  pipelineStatus?: SignalGenRunStatus | string;
  updatedAt?: string;
  confidence?: number;
  comments?: number;
  clusters?: number;
  files?: number;
  note?: string;
  onOpenSignal?: (signal: MemoryEntryProps["s"]) => void;
};

export function MemoryEntry({ s, title, type, status, pipelineStatus, updatedAt, confidence, comments, clusters, files, note, onOpenSignal }: MemoryEntryProps) {
  const entry = {
    title: title ?? s?.title ?? "Untitled signal",
    type: type ?? s?.type,
    status: status ?? s?.status ?? "signal_detected",
    pipelineStatus: pipelineStatus ?? s?.pipelineStatus ?? status ?? s?.status ?? "signal_detected",
    updatedAt: updatedAt ?? s?.updatedAt,
    confidence: confidence ?? s?.confidence ?? 0,
    comments: comments ?? s?.evidence?.reduce((total, item) => total + (item.frequency ?? 0), 0) ?? 0,
    clusters: clusters ?? s?.evidence?.length ?? 0,
    files: files ?? s?.plan?.filesToChange?.length ?? 0,
    note: note ?? s?.decision?.note,
  };
  const typeInfo = typeMeta(entry.type);
  const statusInfo = statusMeta(entry.status);
  const facts = [[pct(entry.confidence), "confidence"], [`${entry.comments}`, "comments"], [`${entry.clusters}`, "clusters"]];
  if (entry.files > 0) facts.push([`${entry.files}`, "files → PR"]);
  const EntryTag = onOpenSignal ? "button" : "article";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", columnGap: 16 }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        <span style={{ position: "absolute", top: 0, bottom: -2, width: 0, borderLeft: "1.5px dashed var(--connector)", opacity: 0.55 }} />
        <span style={{ position: "relative", marginTop: 22, width: 16, height: 16, borderRadius: "50%", flex: "none", zIndex: 1, background: statusInfo.variant === "outline" ? "var(--inset)" : `var(--${statusInfo.variant})`, border: "2px solid var(--bg)", boxShadow: "0 0 0 1.5px var(--connector)" }} />
      </div>
      <div style={{ paddingBottom: 18 }}>
        <EntryTag {...(onOpenSignal ? { type: "button" as const, onClick: () => onOpenSignal(s) } : {})} className="sg-panel" style={{ width: "100%", textAlign: "left", cursor: onOpenSignal ? "pointer" : "default", border: "1px solid var(--line)", padding: 18, fontFamily: "var(--sans)", color: "var(--ink)", background: "var(--panel-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span className="sg-meta" style={{ fontSize: 11.5 }}>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString("en-US") : "Not dated"}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Pill variant={typeInfo.variant}>{typeInfo.label}</Pill>
              <Pill variant={statusInfo.variant} dot>{statusInfo.label}</Pill>
            </div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{entry.title}</div>
          <div style={{ marginBottom: 14 }}><PipelineStrip current={stageIndex(entry.status)} labels={false} /></div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: entry.note ? 12 : 0 }}>
            {facts.map(([value, label]) => (
              <div key={label}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--ink)" }}>{value}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-faint)" }}>{label}</div>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ color: "var(--signal)", fontWeight: 600, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-end" }}>Open run <Icon name="arrow" size={15} /></span>
          </div>
          {entry.note && <div style={{ borderLeft: `2.5px solid var(--${statusInfo.variant})`, paddingLeft: 12, fontSize: 13.5, color: "var(--ink-soft)" }}><b style={{ color: "var(--ink)" }}>Founder note:</b> {entry.note}</div>}
        </EntryTag>
      </div>
    </div>
  );
}
