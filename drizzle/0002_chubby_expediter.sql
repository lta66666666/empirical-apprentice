CREATE TABLE `model_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_calls_owner_time` ON `model_calls` (`owner`,`created_at`);