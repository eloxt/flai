ALTER TABLE "conversation" ADD COLUMN "related_chats" jsonb;--> statement-breakpoint
-- Keep the related chats picked so far, as the summaries they have now, in their picked order.
UPDATE "conversation" cv SET "related_chats" = (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o."id",
    'title', o."title",
    'date', to_char(o."updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'summary', o."summary"
  ) ORDER BY array_position(cv."related_chat_ids", o."id")), '[]'::jsonb)
  FROM "conversation" o
  WHERE o."id" = ANY(cv."related_chat_ids") AND o."deleted_at" IS NULL AND o."summary" IS NOT NULL
)
WHERE cv."related_chat_ids" IS NOT NULL;
