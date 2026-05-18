import ListingDetail from "@/pages/ListingDetail";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ListingDetail slug={slug} />;
}
