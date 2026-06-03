import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  Spline_Sans_Mono,
} from "next/font/google";
import { AppAuthProvider } from "./auth-provider";
import "./globals.css";
import { ThemeAttributeSetter } from "./theme-attributes";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
  variable: "--font-spline-sans-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const themeNoFlashScript = `
(function () {
  var themeKey = "signalgen:theme";
  var densityKey = "signalgen:density";
  var accentKey = "signalgen:accent";
  var defaultTheme = "light";
  var defaultDensity = "regular";

  function validTheme(value) {
    return value === "light" || value === "dark";
  }

  function validDensity(value) {
    return value === "compact" || value === "regular" || value === "comfy";
  }

  function readAccent(value) {
    if (!value) return null;
    try {
      var parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
        return parsed;
      }
    } catch (error) {}
    return null;
  }

  try {
    var root = document.documentElement;
    var theme = localStorage.getItem(themeKey);
    var density = localStorage.getItem(densityKey);
    var accent = readAccent(localStorage.getItem(accentKey));

    root.setAttribute("data-theme", validTheme(theme) ? theme : defaultTheme);
    root.setAttribute("data-density", validDensity(density) ? density : defaultDensity);
    if (accent) {
      root.style.setProperty("--signal", accent[0]);
      root.style.setProperty("--signal-2", accent[1]);
      root.style.setProperty("--signal-soft", "color-mix(in oklab, " + accent[0] + " 14%, transparent)");
    }
  } catch (error) {}
})();`;

export const metadata: Metadata = {
  title: "SignalGen — From customer signal to product PR",
  description:
    "AI product-iteration agent that turns feedback screenshots into safe, reviewable product PRs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-density="regular"
      suppressHydrationWarning
      className={`${bricolageGrotesque.variable} ${hankenGrotesk.variable} ${splineSansMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeAttributeSetter />
        <AppAuthProvider>{children}</AppAuthProvider>
      </body>
    </html>
  );
}
