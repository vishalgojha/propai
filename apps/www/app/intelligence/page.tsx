import { fetchLocalityMarketData } from "../../lib/market";
import MarketIntelligence from "@/views/MarketIntelligence";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export default async function IntelligencePage() {
  const data = await fetchLocalityMarketData();

  return <MarketIntelligence initialData={data} />;
}
