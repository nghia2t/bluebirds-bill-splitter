-- 0003_bills_note.sql
--
-- Add an optional `note` column to bills so the create/edit dialog can
-- capture a short detail line ("paid on 14th, split with Linh + Minh") that
-- doesn't fit the bill description.

--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "note" text;
