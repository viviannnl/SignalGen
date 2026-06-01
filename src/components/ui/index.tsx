"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SVGAttributes,
  TextareaHTMLAttributes,
} from "react";
import { forwardRef } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "rose" | "secondary" | "soft" | "success" | "danger";
export type ButtonSize = "sm" | "lg";

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

type ButtonAsButtonProps = ButtonOwnProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsAnchorProps = ButtonOwnProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    disabled?: boolean;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsAnchorProps;

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size,
    loading = false,
    className,
    children,
    disabled,
    ...rest
  } = props;
  const isDisabled = Boolean(disabled || loading);
  const classes = cx("sg-btn", `sg-btn--${variant}`, size && `sg-btn--${size}`, className);
  const content = (
    <>
      {loading ? <span aria-hidden="true" className="sg-spin size-4 rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </>
  );

  if ("href" in props && props.href) {
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        {...anchorProps}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        className={classes}
        href={props.href}
        onClick={(event) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }
          anchorProps.onClick?.(event);
        }}
        tabIndex={isDisabled ? -1 : anchorProps.tabIndex}
      >
        {content}
      </a>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      className={classes}
      disabled={isDisabled}
      type={buttonProps.type ?? "button"}
    >
      {content}
    </button>
  );
}

export type PillVariant = "success" | "warning" | "error" | "info" | "rose" | "outline";

export type PillProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: PillVariant;
  dot?: boolean;
};

export function Pill({ variant, dot = false, className, children, ...props }: PillProps) {
  return (
    <span {...props} className={cx("sg-pill", variant && `sg-pill--${variant}`, className)}>
      {dot ? <span aria-hidden="true" className="sg-dot" /> : null}
      {children}
    </span>
  );
}

export type EyebrowProps = HTMLAttributes<HTMLDivElement> & {
  soft?: boolean;
};

export function Eyebrow({ soft = false, className, ...props }: EyebrowProps) {
  return <div {...props} className={cx("sg-eyebrow", soft && "sg-eyebrow--soft", className)} />;
}

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div {...props} className={cx("sg-card", className)} />;
}

export type PanelVariant = "cream" | "peach";
export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  variant?: PanelVariant;
};

export function Panel({ variant, className, ...props }: PanelProps) {
  return <div {...props} className={cx("sg-panel", variant && `sg-panel--${variant}`, className)} />;
}

export type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Field({ label, hint, error, children, className, ...props }: FieldProps) {
  return (
    <label {...props} className={cx("block", className)}>
      <span className="block text-[13.5px] font-bold text-[var(--ink)]">{label}</span>
      {hint ? <span className="mt-1 block text-sm text-[var(--ink-soft)]">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
      {error ? <span className="mt-2 block text-sm font-semibold text-[var(--error)]">{error}</span> : null}
    </label>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input {...props} ref={ref} className={cx("sg-input", className)} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea {...props} ref={ref} className={cx("sg-textarea", className)} />;
});

export type TabsProps = HTMLAttributes<HTMLDivElement>;

export function Tabs({ className, ...props }: TabsProps) {
  return <div {...props} className={cx("sg-tabs", className)} role={props.role ?? "tablist"} />;
}

export type TabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function Tab({ selected = false, className, type, ...props }: TabProps) {
  return (
    <button
      {...props}
      aria-selected={selected}
      className={cx("sg-tab", className)}
      role="tab"
      type={type ?? "button"}
    />
  );
}

export type MetricTileProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
};

export function MetricTile({ label, value, className, ...props }: MetricTileProps) {
  return (
    <div {...props} className={cx("rounded-[var(--radius-md)] bg-[var(--bg-alt)] px-[18px] py-4", className)}>
      <Eyebrow soft className="text-[10.5px]">
        {label}
      </Eyebrow>
      <div className="mt-2 break-words text-[15px] font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
}

export type InfoListProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  items?: ReactNode[];
  accent?: boolean;
  emptyLabel?: ReactNode;
};

export function InfoList({
  title,
  items,
  accent = false,
  emptyLabel = "No items yet.",
  className,
  ...props
}: InfoListProps) {
  const hasItems = Boolean(items?.length);
  return (
    <Panel {...props} className={cx("bg-[var(--bg-alt)] p-[18px]", className)}>
      {title ? (
        <div className={cx("text-[13px] font-bold", accent ? "text-[var(--rose)]" : "text-[var(--ink)]")}>
          {title}
        </div>
      ) : null}
      <ul className={cx("m-0 flex list-none flex-col gap-2 p-0", title && "mt-3")}>
        {hasItems ? (
          items?.map((item, index) => (
            <li key={index} className="flex gap-[9px] text-[13.5px] leading-[1.5] text-[color-mix(in_srgb,var(--ink)_85%,transparent)]">
              <span aria-hidden="true" className="shrink-0 text-[var(--rose)]">
                •
              </span>
              <span>{item}</span>
            </li>
          ))
        ) : (
          <li className="text-[13.5px] text-[var(--ink-faint)]">{emptyLabel}</li>
        )}
      </ul>
    </Panel>
  );
}

export type InfoCardProps = Omit<InfoListProps, "className"> & {
  className?: string;
};

export function InfoCard({ className, ...props }: InfoCardProps) {
  return <InfoList {...props} className={cx("sg-card", className)} />;
}

export type ConfRingProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  value?: number;
  size?: number;
  label?: string;
  svgProps?: SVGAttributes<SVGSVGElement>;
};

export function ConfRing({ value = 0, size = 56, label, className, svgProps, ...props }: ConfRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct / 100);

  return (
    <div
      {...props}
      aria-label={label ?? `Confidence ${pct}%`}
      className={cx("relative shrink-0", className)}
      role="img"
    >
      <svg
        {...svgProps}
        className={cx("-rotate-90", svgProps?.className)}
        height={size}
        width={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="var(--rose-soft)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--success)"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          strokeWidth="6"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold text-[var(--success)]">
        {pct}%
      </span>
    </div>
  );
}

export type StatGroupItem = {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
};

export type StatGroupProps = HTMLAttributes<HTMLDivElement> & {
  items: StatGroupItem[];
};

export function StatGroup({ items, className, ...props }: StatGroupProps) {
  return (
    <div {...props} className={cx("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item, index) => (
        <div key={index} className="sg-panel sg-panel--cream p-4">
          <div className="sg-meta">{item.label}</div>
          <div className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-[var(--ink)]">{item.value}</div>
          {item.meta ? <div className="mt-1 text-sm text-[var(--ink-soft)]">{item.meta}</div> : null}
        </div>
      ))}
    </div>
  );
}
