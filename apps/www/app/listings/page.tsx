import type { Metadata } from "next";
import Listings from "@/pages/Listings";

export const metadata: Metadata = {
  title: "Off-Market Real Estate Listings Mumbai | PropAI Pulse",
  description:
    "Browse real-time off-market properties in Mumbai. Filter by locality, price, and typology. Sourced directly from broker broadcasts.",
};

export default function Page() {
  return <Listings />;
}
