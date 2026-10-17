ALTER TABLE "worlds" ADD COLUMN "tick" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "energy" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "energy_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "last_tick_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "ticking_since" timestamp with time zone;