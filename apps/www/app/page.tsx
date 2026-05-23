import { fetchPublicListings } from "@/lib/publicListings";
import Home from "@/pages/Home";

export default async function Page() {
  let initialListings: Awaited<ReturnType<typeof fetchPublicListings>> = [];
  try {
    initialListings = await fetchPublicListings();
  } catch {
    // Fallback to client-side fetch
  }
  return <Home initialListings={initialListings} />;
}
