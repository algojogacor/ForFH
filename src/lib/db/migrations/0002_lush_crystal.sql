CREATE TABLE `campus_data` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`jenis` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campus_data_user_jenis_idx` ON `campus_data` (`user_id`,`jenis`);