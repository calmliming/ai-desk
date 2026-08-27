ALTER TABLE "sessions" ADD COLUMN "pinned" boolean;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "favorite" boolean;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "group_name" text;