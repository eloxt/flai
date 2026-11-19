ALTER TABLE "user_memory" DROP CONSTRAINT "user_memory_source_conversation_id_conversation_id_fk";
--> statement-breakpoint
ALTER TABLE "user_memory" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "user_memory" DROP COLUMN "pinned";--> statement-breakpoint
ALTER TABLE "user_memory" DROP COLUMN "source_conversation_id";