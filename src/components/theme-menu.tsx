"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  ACCENTS,
  applyThemeSettings,
  persistThemeSettings,
  readStoredSettings,
  type SignalGenAccent,
  type SignalGenDensity,
  type SignalGenTheme,
  type SignalGenThemeSettings,
} from "@/app/theme-attributes";
import { Icon } from "@/components/ui";

const THEME_OPTIONS: Array<{ value: SignalGenTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DENSITY_OPTIONS: Array<{ value: SignalGenDensity; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "regular", label: "Regular" },
  { value: "comfy", label: "Comfy" },
];

const DEFAULT_SETTINGS: SignalGenThemeSettings = {
  theme: "light",
  density: "regular",
  accent: null,
};

function accentsEqual(a: SignalGenAccent | null, b: SignalGenAccent | null) {
  return a?.[0].toLowerCase() === b?.[0].toLowerCase() && a?.[1].toLowerCase() === b?.[1].toLowerCase();
}

function readLiveSettings(): SignalGenThemeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  const root = document.documentElement;
  const stored = readStoredSettings();
  const liveTheme = root.getAttribute("data-theme");
  const liveDensity = root.getAttribute("data-density");

  return {
    theme: liveTheme === "dark" || liveTheme === "light" ? liveTheme : stored.theme,
    density: liveDensity === "compact" || liveDensity === "regular" || liveDensity === "comfy" ? liveDensity : stored.density,
    accent: stored.accent,
  };
}

function useMountedThemeSettings() {
  const [settings, setSettings] = useState<SignalGenThemeSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const sync = () => setSettings(readLiveSettings());
    const syncStored = () => {
      const stored = readStoredSettings();
      applyThemeSettings(stored);
      setSettings(stored);
    };

    sync();
    window.addEventListener("storage", syncStored);
    window.addEventListener("signalgen:themechange", sync);
    return () => {
      window.removeEventListener("storage", syncStored);
      window.removeEventListener("signalgen:themechange", sync);
    };
  }, []);

  return [settings, setSettings] as const;
}

export function ThemeMenu({ align = "right" }: { align?: "left" | "right" }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useMountedThemeSettings();

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });

    function closeMenu(restoreFocus = false) {
      setOpen(false);
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu(true);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function updateSettings(next: Partial<SignalGenThemeSettings>) {
    const merged: SignalGenThemeSettings = { ...readLiveSettings(), ...next };
    applyThemeSettings(merged);
    persistThemeSettings(merged);
    setSettings(merged);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        className="sg-btn sg-btn--ghost sg-btn--sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Open theme, density, and accent settings"
        onClick={() => setOpen((current) => !current)}
        style={{ paddingInline: 12 }}
      >
        <Icon name="sliders" size={16} />
        <span className="max-sm:hidden">Theme</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="dialog"
          aria-label="Theme, density, and accent settings"
          className="sg-card sg-fadeup"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            [align]: 0,
            zIndex: 60,
            width: 292,
            maxWidth: "calc(100vw - 32px)",
            padding: 14,
            background: "color-mix(in oklab, var(--panel) 94%, transparent)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <div className="sg-eyebrow soft" style={{ marginBottom: 8 }}>Surface</div>
          <div role="group" aria-label="Theme" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {THEME_OPTIONS.map((option) => {
              const active = settings.theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={`sg-btn ${active ? "sg-btn--primary" : "sg-btn--soft"} sg-btn--sm`}
                  onClick={() => updateSettings({ theme: option.value })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="sg-eyebrow soft" style={{ marginBottom: 8, marginTop: 16 }}>Density</div>
          <div role="group" aria-label="Density" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {DENSITY_OPTIONS.map((option) => {
              const active = settings.density === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={`sg-btn ${active ? "sg-btn--primary" : "sg-btn--soft"} sg-btn--sm`}
                  onClick={() => updateSettings({ density: option.value })}
                  style={{ paddingInline: 10 }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="sg-eyebrow soft" style={{ marginBottom: 8, marginTop: 16 }}>Signal accent</div>
          <div role="group" aria-label="Signal accent" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            <button
              type="button"
              aria-label="Use default accent"
              aria-pressed={settings.accent === null}
              className="sg-btn sg-btn--soft sg-btn--sm"
              onClick={() => updateSettings({ accent: null })}
              style={{
                minWidth: 0,
                height: 38,
                padding: 0,
                border: settings.accent === null ? "2px solid var(--signal)" : "1px solid var(--line-2)",
              }}
            >
              Auto
            </button>
            {ACCENTS.map((accent, index) => {
              const active = accentsEqual(settings.accent, accent);
              return (
                <button
                  key={accent.join(":")}
                  type="button"
                  aria-label={`Use accent ${index + 1}`}
                  aria-pressed={active}
                  onClick={() => updateSettings({ accent })}
                  style={{
                    minWidth: 0,
                    height: 38,
                    borderRadius: "var(--rad-sm)",
                    border: active ? "2px solid var(--ink)" : "1px solid var(--line-2)",
                    background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`,
                    boxShadow: active ? "0 0 0 4px var(--signal-soft)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <span className="sr-only">Accent {index + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
