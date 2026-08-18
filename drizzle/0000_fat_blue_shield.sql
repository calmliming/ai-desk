CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"time" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compare_slots" (
	"position" integer PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"reasoning" text,
	"images" jsonb,
	"usage" jsonb,
	"citations" jsonb,
	"model_used" text,
	"created_at" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"time" bigint NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"created_at" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stage" text NOT NULL,
	"milestones" jsonb NOT NULL,
	"archived" boolean,
	"blocked" boolean,
	"deadline" bigint,
	"linked_sessions" jsonb,
	"linked_prompts" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"builtin" boolean,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"system_prompt" text,
	"temperature" real,
	"max_tokens" integer,
	"search" boolean,
	"thinking" boolean,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_logs" ADD CONSTRAINT "project_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_time_idx" ON "activity" USING btree ("time");--> statement-breakpoint
CREATE INDEX "messages_session_idx" ON "messages" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "project_logs_project_idx" ON "project_logs" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id","position");