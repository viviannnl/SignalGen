"use client";

import { useEffect } from "react";

type SignalGenTheme = "light" | "dark";
type SignalGenDensity = "compact" | "regular" | "comfy";
type SignalGenAccent = [string, string];

declare global {
  interface Window {
    setSignalGenTheme?: (next: {
      theme?: SignalGenTheme;
      density?: SignalGenDensity;
      accent?: SignalGenAccent;
    }) => void;
  }
}

const STORAGE_KEYS = {
  theme: "signalgen:theme",
  density: "signalgen:density",
  accent: "signalgen:accent",
} as const;

const DEFAULT_THEME: SignalGenTheme = "light";
const DEFAULT_DENSITY: SignalGenDensity = "regular";

const THEMES = new Set<SignalGenTheme>(["light", "dark"]);
const DENSITIES = new Set<SignalGenDensity>(["compact", "regular", "comfy"]);

function isTheme(value: string | null): value is SignalGenTheme {
  return value === "light" || value === "dark";
}

function isDensity(value: string | null): value is SignalGenDensity {
  return value === "compact" || value === "regular" || value === "comfy";
}

function parseAccent(value: string | null): SignalGenAccent | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    return null;
  }

  return null;
}

function applyThemeSettings({
  theme = DEFAULT_THEME,
  density = DEFAULT_DENSITY,
  accent,
}: {
  theme?: SignalGenTheme;
  density?: SignalGenDensity;
  accent?: SignalGenAccent | null;
}) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-density", density);

  if (accent) {
    root.style.setProperty("--signal", accent[0]);
    root.style.setProperty("--signal-2", accent[1]);
    root.style.setProperty(
      "--signal-soft",
      `color-mix(in oklab, ${accent[0]} 14%, transparent)`,
    );
  } else {
    root.style.removeProperty("--signal");
    root.style.removeProperty("--signal-2");
    root.style.removeProperty("--signal-soft");
  }
}

function readStoredSettings() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme);
  const density = localStorage.getItem(STORAGE_KEYS.density);
  const accent = localStorage.getItem(STORAGE_KEYS.accent);

  return {
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    density: isDensity(density) ? density : DEFAULT_DENSITY,
    accent: parseAccent(accent),
  };
}

export function ThemeAttributeSetter() {
  useEffect(() => {
    function setSignalGenTheme(next: {
      theme?: SignalGenTheme;
      density?: SignalGenDensity;
      accent?: SignalGenAccent;
    }) {
      const current = readStoredSettings();
      const theme = next.theme && THEMES.has(next.theme) ? next.theme : current.theme;
      const density =
        next.density && DENSITIES.has(next.density) ? next.density : current.density;
      const accent = next.accent === undefined ? current.accent : next.accent;

      applyThemeSettings({ theme, density, accent });
      localStorage.setItem(STORAGE_KEYS.theme, theme);
      localStorage.setItem(STORAGE_KEYS.density, density);
      if (accent) {
        localStorage.setItem(STORAGE_KEYS.accent, JSON.stringify(accent));
      } else {
        localStorage.removeItem(STORAGE_KEYS.accent);
      }
    }

    applyThemeSettings(readStoredSettings());
    window.setSignalGenTheme = setSignalGenTheme;

    function handleStorage(event: StorageEvent) {
      if (Object.values(STORAGE_KEYS).includes(event.key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS])) {
        applyThemeSettings(readStoredSettings());
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      delete window.setSignalGenTheme;
    };
  }, []);

  return null;
}
