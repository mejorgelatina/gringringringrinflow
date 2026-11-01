import { notFound } from "next/navigation";
import { carriersEnabled } from "@/lib/network/features";
import BackhaulView from "./backhaul-view";

/** Backhaul is built but hidden until carriers are validated (NEXT_PUBLIC_GRINFLOW_CARRIERS=on brings it back). */
export default function BackhaulPage() {
  if (!carriersEnabled()) notFound();
  return <BackhaulView />;
}
