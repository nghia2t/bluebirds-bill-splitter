-- 0001_running_ledger.sql
--
-- v2 schema: drop cycles, bills and settlements live directly on the team.
-- This is a destructive migration — bill and settlement data is wiped (the
-- decision was made deliberately while the app is still pre-production).
--
-- Order:
--   1. Drop tables that depend on cycles or on the old bills shape.
--   2. Recreate bills (team_id), bill_participants (PK + index), settlements
--      (team_id, no paid-toggle, with note + settled_on).
--
-- Everything else (users, teams, team_members, team_invites, idempotency_keys)
-- is unchanged and stays put.

--> statement-breakpoint
DROP TABLE IF EXISTS "settlements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "bill_participants" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "bills" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "cycles" CASCADE;
--> statement-breakpoint
CREATE TABLE "bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "occurred_on" date NOT NULL,
  "description" text NOT NULL,
  "total_amount" bigint NOT NULL,
  "currency" text NOT NULL,
  "paid_by" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bills"
  ADD CONSTRAINT "bills_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "bills"
  ADD CONSTRAINT "bills_paid_by_team_members_id_fk"
  FOREIGN KEY ("paid_by") REFERENCES "public"."team_members"("id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "bills"
  ADD CONSTRAINT "bills_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX "bills_team_idx" ON "bills" USING btree ("team_id");
--> statement-breakpoint
CREATE TABLE "bill_participants" (
  "bill_id" uuid NOT NULL,
  "team_member_id" uuid NOT NULL,
  "share_amount" bigint NOT NULL,
  CONSTRAINT "bill_participants_bill_id_team_member_id_pk"
    PRIMARY KEY ("bill_id", "team_member_id")
);
--> statement-breakpoint
ALTER TABLE "bill_participants"
  ADD CONSTRAINT "bill_participants_bill_id_bills_id_fk"
  FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "bill_participants"
  ADD CONSTRAINT "bill_participants_team_member_id_team_members_id_fk"
  FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX "bill_participants_member_idx"
  ON "bill_participants" USING btree ("team_member_id");
--> statement-breakpoint
CREATE TABLE "settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "from_member_id" uuid NOT NULL,
  "to_member_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "currency" text NOT NULL,
  "settled_on" date NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_from_member_id_team_members_id_fk"
  FOREIGN KEY ("from_member_id") REFERENCES "public"."team_members"("id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_to_member_id_team_members_id_fk"
  FOREIGN KEY ("to_member_id") REFERENCES "public"."team_members"("id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX "settlements_team_idx" ON "settlements" USING btree ("team_id");
