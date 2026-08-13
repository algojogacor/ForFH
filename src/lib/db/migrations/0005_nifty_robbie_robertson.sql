ALTER TABLE `campus_accounts` RENAME COLUMN "jwt_enc" TO "jwt";--> statement-breakpoint
ALTER TABLE `campus_accounts` RENAME COLUMN "hebat_authtoken_enc" TO "hebat_authtoken";--> statement-breakpoint
ALTER TABLE `sessions` RENAME COLUMN "token_hash" TO "token";--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN "password_hash" TO "password";--> statement-breakpoint
DROP INDEX IF EXISTS `sessions_token_hash_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `sessions_token_hash_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_idx` ON `sessions` (`token`);--> statement-breakpoint
DROP INDEX IF EXISTS "academic_terms_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_cache_user_jenis_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_usage_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_usage_provider_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ai_usage_account_slot_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_user_course_date_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "campus_accounts_last_sync_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "campus_data_user_jenis_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "class_schedules_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "class_schedules_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "class_schedules_day_of_week_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "class_schedules_user_external_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "courses_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "courses_term_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "courses_user_external_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "exam_topics_exam_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "exam_topics_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "exams_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "exams_exam_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "exams_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "files_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "files_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "grades_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "grades_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "grades_user_external_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "legal_bookmarks_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "legal_bookmarks_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notes_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notes_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notes_updated_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notification_deliveries_dedupe_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notification_deliveries_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "push_subscriptions_endpoint_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "push_subscriptions_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "push_subscriptions_endpoint_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "readings_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "readings_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_token_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_token_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_expires_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subtasks_task_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subtasks_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "task_reminders_task_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "task_reminders_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_course_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_due_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_updated_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_user_external_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_settings_user_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "user_settings_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "users_username_normalized_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_username_norm_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_norm_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_phone_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_lid_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_jid_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_phone_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_lid_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "wa_bindings_jid_idx";--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN "password" text;--> statement-breakpoint
CREATE INDEX `academic_terms_user_id_idx` ON `academic_terms` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_cache_user_jenis_key_idx` ON `ai_cache` (`user_id`,`jenis`,`cache_key`);--> statement-breakpoint
CREATE INDEX `ai_usage_created_at_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_provider_idx` ON `ai_usage` (`provider`);--> statement-breakpoint
CREATE INDEX `ai_usage_account_slot_idx` ON `ai_usage` (`account_slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_user_course_date_idx` ON `attendance` (`user_id`,`course_id`,`class_date`);--> statement-breakpoint
CREATE INDEX `attendance_course_id_idx` ON `attendance` (`course_id`);--> statement-breakpoint
CREATE INDEX `campus_accounts_last_sync_idx` ON `campus_accounts` (`last_sync_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `campus_data_user_jenis_idx` ON `campus_data` (`user_id`,`jenis`);--> statement-breakpoint
CREATE INDEX `class_schedules_user_id_idx` ON `class_schedules` (`user_id`);--> statement-breakpoint
CREATE INDEX `class_schedules_course_id_idx` ON `class_schedules` (`course_id`);--> statement-breakpoint
CREATE INDEX `class_schedules_day_of_week_idx` ON `class_schedules` (`day_of_week`);--> statement-breakpoint
CREATE INDEX `class_schedules_user_external_idx` ON `class_schedules` (`user_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `courses_user_id_idx` ON `courses` (`user_id`);--> statement-breakpoint
CREATE INDEX `courses_term_id_idx` ON `courses` (`academic_term_id`);--> statement-breakpoint
CREATE INDEX `courses_user_external_idx` ON `courses` (`user_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `exam_topics_exam_id_idx` ON `exam_topics` (`exam_id`);--> statement-breakpoint
CREATE INDEX `exam_topics_user_id_idx` ON `exam_topics` (`user_id`);--> statement-breakpoint
CREATE INDEX `exams_user_id_idx` ON `exams` (`user_id`);--> statement-breakpoint
CREATE INDEX `exams_exam_at_idx` ON `exams` (`exam_at`);--> statement-breakpoint
CREATE INDEX `exams_course_id_idx` ON `exams` (`course_id`);--> statement-breakpoint
CREATE INDEX `files_user_id_idx` ON `files` (`user_id`);--> statement-breakpoint
CREATE INDEX `files_course_id_idx` ON `files` (`course_id`);--> statement-breakpoint
CREATE INDEX `grades_user_id_idx` ON `grades` (`user_id`);--> statement-breakpoint
CREATE INDEX `grades_course_id_idx` ON `grades` (`course_id`);--> statement-breakpoint
CREATE INDEX `grades_user_external_idx` ON `grades` (`user_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `legal_bookmarks_user_id_idx` ON `legal_bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `legal_bookmarks_course_id_idx` ON `legal_bookmarks` (`course_id`);--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_course_id_idx` ON `notes` (`course_id`);--> statement-breakpoint
CREATE INDEX `notes_updated_at_idx` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_idx` ON `notification_deliveries` (`user_id`,`entity_type`,`entity_id`,`occurrence_at`,`offset_minutes`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_user_id_idx` ON `notification_deliveries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `readings_user_id_idx` ON `readings` (`user_id`);--> statement-breakpoint
CREATE INDEX `readings_course_id_idx` ON `readings` (`course_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `subtasks_task_id_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `subtasks_user_id_idx` ON `subtasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_reminders_task_id_idx` ON `task_reminders` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_reminders_user_id_idx` ON `task_reminders` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_user_id_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_course_id_idx` ON `tasks` (`course_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_at_idx` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_updated_at_idx` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE INDEX `tasks_user_external_idx` ON `tasks` (`user_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_normalized_unique` ON `users` (`username_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_norm_idx` ON `users` (`username_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_norm_idx` ON `users` (`email_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_phone_unique` ON `wa_bindings` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_lid_unique` ON `wa_bindings` (`lid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_jid_unique` ON `wa_bindings` (`jid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_user_id_idx` ON `wa_bindings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_phone_idx` ON `wa_bindings` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_lid_idx` ON `wa_bindings` (`lid`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_bindings_jid_idx` ON `wa_bindings` (`jid`);