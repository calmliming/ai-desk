ALTER TABLE "activity" ADD CONSTRAINT "activity_type_check" CHECK ("type" in ('chat', 'tool', 'compare', 'prompt', 'settings', 'file', 'session', 'project'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_role_check" CHECK ("role" in ('system', 'user', 'assistant'));--> statement-breakpoint
ALTER TABLE "project_logs" ADD CONSTRAINT "project_logs_kind_check" CHECK ("kind" in ('created', 'stage', 'note', 'ai'));--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_status_check" CHECK ("status" in ('todo', 'doing', 'done'));--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_priority_check" CHECK ("priority" in ('low', 'medium', 'high'));