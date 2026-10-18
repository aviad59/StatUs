CREATE TYPE "public"."gender" AS ENUM('female', 'male');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "gender" "gender";--> statement-breakpoint
-- Hand-added: the player is male by default and can switch to female on the profile page.
UPDATE "accounts" SET "gender" = 'male' WHERE "kind" = 'human' AND "gender" IS NULL;
