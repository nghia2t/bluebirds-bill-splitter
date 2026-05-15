-- 0002_drop_vnd_input_mode.sql
--
-- Remove the per-team `vnd_input_mode` setting.  The app now always parses
-- VND amounts literally; the "k" / "tr" suffix shorthand still works because
-- it's part of the parser, not the mode.

--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "vnd_input_mode";
