CREATE TABLE `retention_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`file_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`running` integer DEFAULT 0 NOT NULL
);
