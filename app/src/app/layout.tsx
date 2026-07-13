import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Agent ROI Demo",
  description: "Cortex Agent with telemetry, feedback, and ROI measurement",
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
        <nav className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-12 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--foreground)]">Agent ROI</span>
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Demo</span>
              </div>
              <div className="flex items-center gap-0.5">
                <NavLink href="/chat">Chat</NavLink>
                <NavLink href="/dashboard">Dashboard</NavLink>
                <NavLink href="/outcomes">Outcomes</NavLink>
                <NavLink href="/traces">Traces</NavLink>
                <NavLink href="/config">Config</NavLink>
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] rounded-md transition-colors"
    >
      {children}
    </Link>
  );
}
