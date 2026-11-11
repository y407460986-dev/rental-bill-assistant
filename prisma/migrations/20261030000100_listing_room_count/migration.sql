ALTER TABLE "Property" ADD COLUMN "roomCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Property" ADD CONSTRAINT "Property_room_count" CHECK ("roomCount" >= 1 AND "roomCount" <= 20);
