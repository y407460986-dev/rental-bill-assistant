-- Currency codes are ISO 4217 strings: adding a country must not require a
-- database migration. Existing enum values are preserved by the text cast.
ALTER TABLE "Property" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Property" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
ALTER TABLE "Property" ALTER COLUMN "currency" SET DEFAULT 'EUR';
ALTER TABLE "BillVersion" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
ALTER TABLE "Charge" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
ALTER TABLE "PaymentAttempt" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
ALTER TABLE "Contribution" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
DROP TYPE "Currency";
