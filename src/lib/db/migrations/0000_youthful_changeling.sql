CREATE TABLE `academic_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `academic_terms_user_id_idx` ON `academic_terms` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`provider` text NOT NULL,
	`account_slot` integer NOT NULL,
	`model` text NOT NULL,
	`request_type` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`error_class` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_at_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_provider_idx` ON `ai_usage` (`provider`);--> statement-breakpoint
CREATE INDEX `ai_usage_account_slot_idx` ON `ai_usage` (`account_slot`);--> statement-breakpoint
CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`class_date` text NOT NULL,
	`status` text DEFAULT 'PRESENT' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_user_course_date_idx` ON `attendance` (`user_id`,`course_id`,`class_date`);--> statement-breakpoint
CREATE INDEX `attendance_course_id_idx` ON `attendance` (`course_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE TABLE `class_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`room` text,
	`online_url` text,
	`valid_from` integer,
	`valid_until` integer,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `class_schedules_user_id_idx` ON `class_schedules` (`user_id`);--> statement-breakpoint
CREATE INDEX `class_schedules_course_id_idx` ON `class_schedules` (`course_id`);--> statement-breakpoint
CREATE INDEX `class_schedules_day_of_week_idx` ON `class_schedules` (`day_of_week`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`academic_term_id` text,
	`name` text NOT NULL,
	`code` text,
	`lecturer` text,
	`credits` integer DEFAULT 2,
	`color` text DEFAULT '#3b82f6',
	`default_room` text,
	`online_url` text,
	`notes` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `courses_user_id_idx` ON `courses` (`user_id`);--> statement-breakpoint
CREATE INDEX `courses_term_id_idx` ON `courses` (`academic_term_id`);--> statement-breakpoint
CREATE TABLE `exam_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exam_topics_exam_id_idx` ON `exam_topics` (`exam_id`);--> statement-breakpoint
CREATE INDEX `exam_topics_user_id_idx` ON `exam_topics` (`user_id`);--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'UTS' NOT NULL,
	`exam_at` integer NOT NULL,
	`location` text,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exams_user_id_idx` ON `exams` (`user_id`);--> statement-breakpoint
CREATE INDEX `exams_exam_at_idx` ON `exams` (`exam_at`);--> statement-breakpoint
CREATE INDEX `exams_course_id_idx` ON `exams` (`course_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`drive_file_id` text NOT NULL,
	`drive_parent_folder_id` text,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`category` text DEFAULT 'assignment' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `files_user_id_idx` ON `files` (`user_id`);--> statement-breakpoint
CREATE INDEX `files_course_id_idx` ON `files` (`course_id`);--> statement-breakpoint
CREATE TABLE `grades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`component_name` text NOT NULL,
	`weight` real,
	`score` real,
	`letter_grade` text,
	`grade_point` real,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grades_user_id_idx` ON `grades` (`user_id`);--> statement-breakpoint
CREATE INDEX `grades_course_id_idx` ON `grades` (`course_id`);--> statement-breakpoint
CREATE TABLE `legal_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`frbr_uri` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`number` text,
	`year` text,
	`user_note` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `legal_bookmarks_user_id_idx` ON `legal_bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `legal_bookmarks_course_id_idx` ON `legal_bookmarks` (`course_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'markdown' NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_course_id_idx` ON `notes` (`course_id`);--> statement-breakpoint
CREATE INDEX `notes_updated_at_idx` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`occurrence_at` integer NOT NULL,
	`offset_minutes` integer NOT NULL,
	`channel` text DEFAULT 'web_push' NOT NULL,
	`status` text DEFAULT 'SENT' NOT NULL,
	`sent_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_idx` ON `notification_deliveries` (`user_id`,`entity_type`,`entity_id`,`occurrence_at`,`offset_minutes`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_user_id_idx` ON `notification_deliveries` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`file_id` text,
	`type` text DEFAULT 'book' NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`source_url` text,
	`start_page` integer,
	`end_page` integer,
	`current_page` integer DEFAULT 0,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`deadline` integer,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `readings_user_id_idx` ON `readings` (`user_id`);--> statement-breakpoint
CREATE INDEX `readings_course_id_idx` ON `readings` (`course_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`estimated_minutes` integer,
	`due_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_task_id_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `subtasks_user_id_idx` ON `subtasks` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_reminders_task_id_idx` ON `task_reminders` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_reminders_user_id_idx` ON `task_reminders` (`user_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'assignment' NOT NULL,
	`due_at` integer,
	`internal_target_at` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`estimated_minutes` integer,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_course_id_idx` ON `tasks` (`course_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_at_idx` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_updated_at_idx` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
	`locale` text DEFAULT 'id-ID' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`default_task_reminders` text DEFAULT '[10080, 4320, 1440, 360, 60]' NOT NULL,
	`default_class_reminders` text DEFAULT '[120, 90, 60, 30, 20]' NOT NULL,
	`primary_class_alert_minutes` integer DEFAULT 240 NOT NULL,
	`deadline_buffer_minutes` integer DEFAULT 720 NOT NULL,
	`ai_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_normalized` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_normalized_unique` ON `users` (`username_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_norm_idx` ON `users` (`username_normalized`);