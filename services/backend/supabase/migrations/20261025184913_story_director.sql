ALTER TABLE "story_beats" ADD COLUMN "directions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "story_beats" ADD COLUMN "acted_by" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "story_beats" ADD COLUMN "started_tick" integer;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "story_summary" text DEFAULT '' NOT NULL;