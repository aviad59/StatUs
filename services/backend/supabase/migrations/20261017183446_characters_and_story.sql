CREATE TYPE "public"."story_beat_status" AS ENUM('pending', 'active', 'done');--> statement-breakpoint
CREATE TABLE "character_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"content" text NOT NULL,
	"importance" smallint DEFAULT 5 NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_memories_importance_range" CHECK ("character_memories"."importance" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "character_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"persona" text NOT NULL,
	"secrets" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_character_id_target_account_id_unique" UNIQUE("character_id","target_account_id"),
	CONSTRAINT "relationships_score_range" CHECK ("relationships"."score" between -100 and 100)
);
--> statement-breakpoint
ALTER TABLE "relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_beats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL,
	"status" "story_beat_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "story_beats_world_id_key_unique" UNIQUE("world_id","key")
);
--> statement-breakpoint
ALTER TABLE "story_beats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_flags" (
	"world_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_flags_world_id_key_pk" PRIMARY KEY("world_id","key")
);
--> statement-breakpoint
ALTER TABLE "story_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "character_memories" ADD CONSTRAINT "character_memories_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_beats" ADD CONSTRAINT "story_beats_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_flags" ADD CONSTRAINT "story_flags_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_memories_character_id_created_at_index" ON "character_memories" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "character_memories_embedding_index" ON "character_memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "relationships_target_account_id_index" ON "relationships" USING btree ("target_account_id");--> statement-breakpoint
CREATE INDEX "story_beats_world_id_position_index" ON "story_beats" USING btree ("world_id","position");--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "persona";