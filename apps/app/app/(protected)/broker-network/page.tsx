import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; token?: string }>;
}) {
  const params = await searchParams;
  const tab = params?.tab === 'partners' || params?.tab === 'overlaps' ? params.tab : 'contacts';
  const token = params?.token ? `?token=${encodeURIComponent(params.token)}` : '';
  redirect(`/broker-network/${tab}${token}`);
}
