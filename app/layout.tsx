import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeus AI Coding Workspace",
  description: "Local-first coding agent workspace powered by OpenCode.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
