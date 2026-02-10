CREATE TABLE "public"."conversation" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" text COLLATE "pg_catalog"."default" NOT NULL,
  "title" text COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamp(6) NOT NULL,
  "updated_at" timestamp(6) NOT NULL,
  "deleted_at" timestamp(6),
  "icon" text COLLATE "pg_catalog"."default",
  "favourite" int2,
  CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
)
;

CREATE TABLE "public"."file" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" text COLLATE "pg_catalog"."default" NOT NULL,
  "hash" text COLLATE "pg_catalog"."default",
  "file_name" text COLLATE "pg_catalog"."default",
  "mime_type" text COLLATE "pg_catalog"."default",
  "size" int4,
  "path" text COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL,
  "public_url" text COLLATE "pg_catalog"."default",
  CONSTRAINT "file_pkey" PRIMARY KEY ("id")
)
;

CREATE TABLE "public"."mcp" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" text COLLATE "pg_catalog"."default",
  "name" text COLLATE "pg_catalog"."default",
  "connection_type" text COLLATE "pg_catalog"."default",
  "endpoint" text COLLATE "pg_catalog"."default",
  "headers" jsonb,
  "tools" jsonb,
  "created_at" timestamp(6),
  "updated_at" timestamp(6),
  "deleted_at" timestamp(6),
  "is_active" int2,
  CONSTRAINT "mcp_pkey" PRIMARY KEY ("id")
)
;

CREATE TABLE "public"."message" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "conversation_id" text COLLATE "pg_catalog"."default",
  "parent_id" text COLLATE "pg_catalog"."default" NOT NULL,
  "content" jsonb,
  "created_at" timestamp(6) NOT NULL,
  "deleted_at" timestamp(6),
  "role" text COLLATE "pg_catalog"."default",
  "meta_info" jsonb,
  "tsv_content" tsvector GENERATED ALWAYS AS (
jsonb_to_tsvector('zhcfg'::regconfig, content, '["string"]'::jsonb)
) STORED,
  CONSTRAINT "message_pkey" PRIMARY KEY ("id")
)
;

CREATE INDEX "idx_gin_zh_search" ON "public"."message" USING gin (
  "tsv_content" "pg_catalog"."tsvector_ops"
);

CREATE TABLE "public"."provider" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "name" text COLLATE "pg_catalog"."default" NOT NULL,
  "api_key" text COLLATE "pg_catalog"."default" NOT NULL,
  "provider_type" text COLLATE "pg_catalog"."default" NOT NULL,
  "base_url" text COLLATE "pg_catalog"."default",
  "model" jsonb,
  "created_at" timestamp(6),
  "updated_at" timestamp(6),
  "deleted_at" timestamp(6),
  "logo" text COLLATE "pg_catalog"."default",
  "is_active" int2,
  CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
)
;

CREATE TABLE "public"."share" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "user_id" text COLLATE "pg_catalog"."default" NOT NULL,
  "conversation" jsonb,
  "message" jsonb,
  "created_at" timestamp(6) NOT NULL,
  "deleted_at" timestamp(6),
  "expires_at" timestamp(6),
  CONSTRAINT "share_pkey" PRIMARY KEY ("id")
)
;

CREATE TABLE "public"."system_config" (
  "key" text COLLATE "pg_catalog"."default" NOT NULL,
  "value" jsonb,
  CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
)
;

CREATE TABLE "public"."user" (
  "id" text COLLATE "pg_catalog"."default" NOT NULL,
  "email" text COLLATE "pg_catalog"."default" NOT NULL,
  "username" text COLLATE "pg_catalog"."default" NOT NULL,
  "password" text COLLATE "pg_catalog"."default" NOT NULL,
  "role" text COLLATE "pg_catalog"."default" NOT NULL,
  "is_active" int2 NOT NULL,
  "created_at" timestamp(6) NOT NULL,
  "updated_at" timestamp(6) NOT NULL,
  "deleted_at" timestamp(6),
  "avatar" bytea,
  "preference" jsonb,
  CONSTRAINT "user_pkey" PRIMARY KEY ("id")
)
;
