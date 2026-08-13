CREATE TABLE `ai_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`jenis` text NOT NULL,
	`cache_key` text NOT NULL,
	`result_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cache_user_jenis_key_idx` ON `ai_cache` (`user_id`,`jenis`,`cache_key`);--> statement-breakpoint
ALTER TABLE `campus_accounts` ADD `sync_state` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_accounts` ADD `sync_step` text;--> statement-breakpoint
ALTER TABLE `campus_accounts` ADD `sync_started_at` integer;