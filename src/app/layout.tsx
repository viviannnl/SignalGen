import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppAuthProvider } from "./auth-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppAuthProvider>{children}</AppAuthProvider>
      </body>
    </html>
  );
}
