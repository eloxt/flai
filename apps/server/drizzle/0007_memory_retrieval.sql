CREATE TABLE "memory_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"memory_id" text NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"before" text,
	"after" text,
	"conversation_id" text,
	"note" text,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_job" (
	"user_id" text PRIMARY KEY NOT NULL,
	"consolidated_at" timestamp with time zone,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_event" ADD CONSTRAINT "memory_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_job" ADD CONSTRAINT "memory_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_event_user_idx" ON "memory_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "memory_event_memory_idx" ON "memory_event" USING btree ("memory_id");