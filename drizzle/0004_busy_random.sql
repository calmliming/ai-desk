ALTER TABLE "messages" ADD COLUMN "tool_calls" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tools" boolean;