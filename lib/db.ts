import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  rentalPrisma?: PrismaClient;
};

/** Reuse the pool during Next.js hot reload; connect only when a query is made. */
export function getDb(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  globalForPrisma.rentalPrisma ??= new PrismaClient();
  return globalForPrisma.rentalPrisma;
}
