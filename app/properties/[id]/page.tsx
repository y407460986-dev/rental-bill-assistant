import ListingDetail from "@/components/ListingDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ListingDetail id={(await params).id} />;
}
