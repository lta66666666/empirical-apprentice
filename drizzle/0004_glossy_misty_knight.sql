CREATE TABLE `model_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_interactions_session_time` ON `model_interactions` (`session_id`,`created_at`);