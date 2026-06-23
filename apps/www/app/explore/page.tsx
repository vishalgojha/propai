import { fetchExploreData } from "../../lib/explore";
import LocalityExplore from "@/views/LocalityExplore";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export default async function ExplorePage() {
  const data = await fetchExploreData();
  return <LocalityExplore initialData={data} />;
}
