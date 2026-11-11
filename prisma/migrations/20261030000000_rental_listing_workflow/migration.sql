-- Additive rental metadata; existing tenancies and payments are preserved.
ALTER TABLE "Property"
 ADD COLUMN "city" TEXT, ADD COLUMN "neighborhood" TEXT,
 ADD COLUMN "description" TEXT, ADD COLUMN "sizeM2" INTEGER,
 ADD COLUMN "furnished" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "availableFrom" DATE,
 ADD COLUMN "imageKey" TEXT NOT NULL DEFAULT 'living-room',
 ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RentalApplication" ADD COLUMN "agreement" JSONB;
ALTER TABLE "Property" ADD CONSTRAINT "Property_size_positive" CHECK ("sizeM2" IS NULL OR "sizeM2" > 0);
