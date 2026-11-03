import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "../tokens.css";
import "./ops.css";
import { PwaShell } from "../pwa-shell";
export const metadata: Metadata = {
  title: "grinflow — intelligence layer for food rescue",
  description: "a verifiable, human-approved coordination demo. synthetic data only.",
  appleWebApp: { capable: true, title: "grinflow", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#10211d" };
export default function OpsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={fontVariables}><body>{children}<PwaShell /></body></html>;
}
