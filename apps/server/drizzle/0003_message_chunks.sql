CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "message_chunk" (
	"message_id" text NOT NULL,
	"index" integer NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"model" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	CONSTRAINT "message_chunk_message_id_index_pk" PRIMARY KEY("message_id","index")
);
--> statement-breakpoint
ALTER TABLE "message_chunk" ADD CONSTRAINT "message_chunk_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_chunk_user_idx" ON "message_chunk" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_chunk_embedding_idx" ON "message_chunk" USING hnsw ("embedding" vector_cosine_ops);