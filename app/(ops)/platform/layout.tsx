import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./platform.css";
export const metadata: Metadata = { title: "GrinFlow Operations | Coordination Platform", description: "Local-first prototype for coordinating surplus resources and available capacity." };
export default function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) { return children; }
