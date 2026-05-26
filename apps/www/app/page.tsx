import { fetchPublicListings, fetchTodayParsedCount } from "@/lib/publicListings";
import Home from "@/pages/Home";

export default async function Page() {
  let initialListings: Awaited<ReturnType<typeof fetchPublicListings>> = [];
  let todayCount = 0;
  try {
    [initialListings, todayCount] = await Promise.all([
      fetchPublicListings(),
      fetchTodayParsedCount(),
    ]);
  } catch {
    // Fallback to client-side fetch
  }
  return <Home initialListings={initialListings} todayCount={todayCount} />;
}
