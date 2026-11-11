import { api } from "@/lib/http";
import { catalog } from "@/lib/rental/catalog";
export async function GET() {
  return api(catalog);
}
