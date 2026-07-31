PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cron_expression` text NOT NULL,
	`timezone` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`overlap_policy` text DEFAULT 'skip' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflows_overlap_policy_check" CHECK("__new_workflows"."overlap_policy" IN ('skip'))
);
--> statement-breakpoint
INSERT INTO `__new_workflows`("id", "project_id", "name", "description", "cron_expression", "timezone", "enabled", "overlap_policy", "created_at", "updated_at") SELECT "id", "project_id", "name", "description", "cron_expression", "timezone", "enabled", "overlap_policy", "created_at", "updated_at" FROM `workflows`;--> statement-breakpoint
DROP TABLE `workflows`;--> statement-breakpoint
ALTER TABLE `__new_workflows` RENAME TO `workflows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workflows_project_id_idx` ON `workflows` (`project_id`);--> statement-breakpoint
CREATE TABLE `__new_workflow_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`step_key` text NOT NULL,
	`type` text NOT NULL,
	`position` integer NOT NULL,
	`configuration` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflow_steps_type_check" CHECK("__new_workflow_steps"."type" IN ('signin', 'insert', 'read', 'update', 'delete', 'invoke_function', 'wait', 'signout')),
	CONSTRAINT "workflow_steps_position_check" CHECK("__new_workflow_steps"."position" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_workflow_steps`("id", "workflow_id", "step_key", "type", "position", "configuration", "enabled", "created_at", "updated_at") SELECT "id", "workflow_id", "step_key", "type", "position", "configuration", "enabled", "created_at", "updated_at" FROM `workflow_steps`;--> statement-breakpoint
DROP TABLE `workflow_steps`;--> statement-breakpoint
ALTER TABLE `__new_workflow_steps` RENAME TO `workflow_steps`;--> statement-breakpoint
CREATE INDEX `workflow_steps_workflow_id_idx` ON `workflow_steps` (`workflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_steps_workflow_id_step_key_unique` ON `workflow_steps` (`workflow_id`,`step_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_steps_workflow_id_position_unique` ON `workflow_steps` (`workflow_id`,`position`);--> statement-breakpoint
CREATE TABLE `__new_workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflow_runs_trigger_type_check" CHECK("__new_workflow_runs"."trigger_type" IN ('manual', 'scheduled')),
	CONSTRAINT "workflow_runs_status_check" CHECK("__new_workflow_runs"."status" IN ('pending', 'running', 'success', 'failed', 'cancelled', 'skipped'))
);
--> statement-breakpoint
INSERT INTO `__new_workflow_runs`("id", "workflow_id", "trigger_type", "status", "started_at", "finished_at", "error", "created_at") SELECT "id", "workflow_id", "trigger_type", "status", "started_at", "finished_at", "error", "created_at" FROM `workflow_runs`;--> statement-breakpoint
DROP TABLE `workflow_runs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_runs` RENAME TO `workflow_runs`;--> statement-breakpoint
CREATE INDEX `workflow_runs_workflow_id_idx` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `__new_step_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`workflow_step_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`input_snapshot` text,
	`output` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_step_id`) REFERENCES `workflow_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "step_runs_status_check" CHECK("__new_step_runs"."status" IN ('pending', 'running', 'success', 'failed', 'cancelled', 'skipped')),
	CONSTRAINT "step_runs_position_check" CHECK("__new_step_runs"."position" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_step_runs`("id", "workflow_run_id", "workflow_step_id", "position", "status", "input_snapshot", "output", "error", "started_at", "finished_at", "created_at") SELECT "id", "workflow_run_id", "workflow_step_id", "position", "status", "input_snapshot", "output", "error", "started_at", "finished_at", "created_at" FROM `step_runs`;--> statement-breakpoint
DROP TABLE `step_runs`;--> statement-breakpoint
ALTER TABLE `__new_step_runs` RENAME TO `step_runs`;--> statement-breakpoint
CREATE INDEX `step_runs_workflow_run_id_idx` ON `step_runs` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `step_runs_workflow_step_id_idx` ON `step_runs` (`workflow_step_id`);