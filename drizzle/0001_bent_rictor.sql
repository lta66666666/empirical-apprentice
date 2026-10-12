CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`input_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_owner_session` ON `jobs` (`owner`,`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_expiry` ON `jobs` (`last_activity`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_owner_activity` ON `sessions` (`owner`,`last_activity`);