CREATE TABLE `campus_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`campus_email` text NOT NULL,
	`campus_nim` text NOT NULL,
	`jwt_enc` text NOT NULL,
	`hebat_userid` text,
	`hebat_authtoken_enc` text,
	`last_sync_at` integer,
	`last_sync_status` text DEFAULT 'never' NOT NULL,
	`last_sync_summary` text,
	`last_sync_error` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campus_accounts_last_sync_idx` ON `campus_accounts` (`last_sync_at`);--> statement-breakpoint
ALTER TABLE `attendance` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `class_schedules` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `class_schedules_user_external_idx` ON `class_schedules` (`user_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `courses_user_external_idx` ON `courses` (`user_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `grades` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `grades_user_external_idx` ON `grades` (`user_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `tasks_user_external_idx` ON `tasks` (`user_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_normalized` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_norm_idx` ON `users` (`email_normalized`);