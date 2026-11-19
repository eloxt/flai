ALTER TABLE "user_memory" ADD COLUMN "kind" text DEFAULT 'topic' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN "points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Fold each user's flat memories into topics: pinned (core) facts become their profile, the rest
-- go into "Saved memories" topics of at most 20 points. Consolidation later regroups and summarizes them.
INSERT INTO "user_memory" ("id", "user_id", "content", "kind", "title", "summary", "points", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "user_id", '',
  CASE WHEN "pinned" THEN 'profile' ELSE 'topic' END,
  CASE WHEN "pinned" THEN 'Profile' WHEN "chunk" = 0 THEN 'Saved memories' ELSE 'Saved memories ' || ("chunk" + 1) END,
  '', jsonb_agg("content" ORDER BY "created_at", "id"), min("created_at"), max("updated_at")
FROM (
  SELECT *, CASE WHEN "pinned" THEN 0 ELSE (row_number() OVER (PARTITION BY "user_id", "pinned" ORDER BY "created_at", "id") - 1) / 20 END AS "chunk"
  FROM "user_memory" WHERE "title" = ''
) legacy
GROUP BY "user_id", "pinned", "chunk";--> statement-breakpoint
-- The review log describes the old single-fact memories, which are gone; their vectors go with them.
DELETE FROM "memory_event";--> statement-breakpoint
DELETE FROM "user_memory" WHERE "title" = '';--> statement-breakpoint
-- Have the next consolidation pass organize every migrated user's topics.
UPDATE "memory_job" SET "consolidated_at" = NULL;
