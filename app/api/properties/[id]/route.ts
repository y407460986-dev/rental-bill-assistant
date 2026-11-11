import { api, must } from "@/lib/http";
import { listingDetail } from "@/lib/rental/catalog";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const data = await listingDetail((await params).id);
    must(data, "NOT_FOUND", 404);
    return data;
  });
}
