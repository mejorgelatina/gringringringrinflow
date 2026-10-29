import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import "../tokens.css";
import "./ops.css";
export const metadata: Metadata = { title: "grinflow — intelligence layer for food rescue", description: "a verifiable, human-approved coordination demo. synthetic data only." };
export default function OpsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={fontVariables}><body>{children}</body></html>;
}
