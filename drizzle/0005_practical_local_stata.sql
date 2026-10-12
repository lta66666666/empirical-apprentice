CREATE TABLE `local_pair_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`token_hash` text NOT NULL,
	`owner` text,
	`session_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`body` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_pairings_code_unique` ON `local_pairings` (`code`);
--> statement-breakpoint
CREATE INDEX `local_pairings_session` ON `local_pairings` (`session_id`,`owner`);
--> statement-breakpoint
CREATE TABLE `local_stata_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`pairing_id` text NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pairing_id`) REFERENCES `local_pairings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_stata_tasks_pair_status` ON `local_stata_tasks` (`pairing_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `practical_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practical_messages_session_time` ON `practical_messages` (`session_id`,`created_at`);
