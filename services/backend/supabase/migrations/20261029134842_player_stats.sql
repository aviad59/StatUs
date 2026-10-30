CREATE TABLE "player_stats" (
	"world_id" uuid PRIMARY KEY NOT NULL,
	"aura" smallint DEFAULT 50 NOT NULL,
	"humor" smallint DEFAULT 50 NOT NULL,
	"drama" smallint DEFAULT 50 NOT NULL,
	"last_change" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_stats_aura_range" CHECK ("player_stats"."aura" between 0 and 100),
	CONSTRAINT "player_stats_humor_range" CHECK ("player_stats"."humor" between 0 and 100),
	CONSTRAINT "player_stats_drama_range" CHECK ("player_stats"."drama" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "player_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;