import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./platform.css";
export const metadata: Metadata = { title: "GrinFlow Operations | Coordination Platform", description: "Prototype local-first de coordinación logística de excedentes y capacidad disponible." };
export default function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) { return children; }
