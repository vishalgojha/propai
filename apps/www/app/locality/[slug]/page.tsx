import Locality from "@/pages/Locality";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Locality slug={slug} />;
}
