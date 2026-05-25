"use client";

import { useParams } from "@/lib/router";
import { redirect } from "next/navigation";
import { BrokerNetwork } from "@/pages/BrokerNetwork";

const VALID_SECTIONS = new Set(["contacts", "overlaps", "partners"]);

export default function Page() {
  const params = useParams<{ section: string }>();
  const section = String(params.section || "").trim().toLowerCase();

  if (!VALID_SECTIONS.has(section)) {
    redirect("/broker-network/contacts");
  }

  return <BrokerNetwork />;
}
