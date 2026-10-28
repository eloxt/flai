-- Let the background memory job read each user's 10 most recently active chats once: their
-- summaries and memories are worth having from day one. Older chats stay marked as done.
UPDATE "conversation" SET "extracted_at" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT cv."id", row_number() OVER (PARTITION BY cv."user_id" ORDER BY cv."updated_at" DESC) AS "recency"
    FROM "conversation" cv
    JOIN "user" u ON u."id" = cv."user_id"
    WHERE cv."deleted_at" IS NULL AND u."deleted_at" IS NULL
  ) ranked
  WHERE "recency" <= 10
);
