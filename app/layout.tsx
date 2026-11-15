import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeus API Playground",
  description: "Test API endpoints, models, parameters, and integrations in one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
