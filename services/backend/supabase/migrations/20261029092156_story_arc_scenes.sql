CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"beat_id" uuid,
	"place" text NOT NULL,
	"text" text NOT NULL,
	"recap" text NOT NULL,
	"image_url" text,
	"image_description" text,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen" text,
	"chosen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "arc_act" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "arc_act_beats" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_beat_id_story_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."story_beats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_world_id_created_at_index" ON "scenes" USING btree ("world_id","created_at");