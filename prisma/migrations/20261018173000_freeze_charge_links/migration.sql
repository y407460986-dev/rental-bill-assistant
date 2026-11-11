BEGIN;
CREATE OR REPLACE FUNCTION protect_published_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_status text; target_status text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  SELECT status::text INTO version_status FROM "BillVersion" WHERE id=OLD."billVersionId" FOR UPDATE;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  SELECT status::text INTO target_status FROM "BillVersion" WHERE id=NEW."billVersionId" FOR UPDATE;
 END IF;
 IF target_status IN ('PUBLISHED','SUPERSEDED') AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW."billVersionId" IS DISTINCT FROM OLD."billVersionId")) THEN
  RAISE EXCEPTION 'Cannot attach charges to a published version';
 END IF;
 IF version_status IN ('PUBLISHED','SUPERSEDED') THEN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Published charges are immutable'; END IF;
  IF (to_jsonb(NEW)-'confirmedAt') IS DISTINCT FROM (to_jsonb(OLD)-'confirmedAt') THEN RAISE EXCEPTION 'Published charge amounts are immutable'; END IF;
  IF OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN RAISE EXCEPTION 'Charge confirmation is immutable'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE FUNCTION protect_published_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE charge_id text; version_status text;
BEGIN
 FOR charge_id IN SELECT DISTINCT value FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD."chargeId" END,CASE WHEN TG_OP<>'DELETE' THEN NEW."chargeId" END]) value WHERE value IS NOT NULL LOOP
  SELECT v.status::text INTO version_status FROM "Charge" c JOIN "BillVersion" v ON v.id=c."billVersionId" WHERE c.id=charge_id FOR UPDATE OF v;
  IF version_status IN ('PUBLISHED','SUPERSEDED') THEN RAISE EXCEPTION 'Published credits are immutable'; END IF;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER credit_immutable BEFORE INSERT OR UPDATE OR DELETE ON "ChargeCredit" FOR EACH ROW EXECUTE FUNCTION protect_published_credit();
COMMIT;
