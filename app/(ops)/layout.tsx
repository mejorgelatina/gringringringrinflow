import type { Metadata } from "next";
import "./ops.css";
export const metadata: Metadata = { title: "GrinFlow — Intelligence layer for food rescue", description: "A verifiable, human-approved coordination demo. Synthetic data only." };
export default function OpsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
