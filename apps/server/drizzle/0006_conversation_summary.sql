CREATE TABLE "memory_embedding" (
	"memory_id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summary_embedding" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "summary_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('zhcfg', coalesce(summary, ''))) STORED;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "job_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_embedding" ADD CONSTRAINT "memory_embedding_memory_id_user_memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."user_memory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_embedding" ADD CONSTRAINT "summary_embedding_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summary_embedding_user_idx" ON "summary_embedding" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "summary_embedding_embedding_idx" ON "summary_embedding" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "conversation_summary_tsv_idx" ON "conversation" USING gin ("summary_tsv");--> statement-breakpoint
-- Start the background memory job from now on: existing chats aren't mined retroactively.
UPDATE "conversation" SET "extracted_at" = "updated_at";
