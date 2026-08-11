# ForFH V4 - Database Schema & Migration Guide

## 1. Database Engine & Connection

ForFH utilizes **Turso (LibSQL)** for distributed SQLite database performance at the edge.

- **Connection Protocol**: LibSQL HTTP/WebSocket client (`@libsql/client`).
- **ORM**: Drizzle ORM (`drizzle-orm/libsql`).
- **Local Development**: `file:forfh-local.db`.
- **Production Target**: `libsql://<database-name>-<org>.turso.io` with token authentication.

---

## 2. Schema Architecture (22 Tables)

### 2.1 Core Identity & Security
1. **`users`**: Core user accounts.
   - `id` (TEXT PK UUID), `username` (TEXT UNIQUE), `username_normalized` (TEXT UNIQUE), `password_hash` (TEXT), `display_name` (TEXT), `email` (TEXT), `phone` (TEXT), `created_at`, `updated_at`.
2. **`sessions`**: Active authentication sessions.
   - `id` (TEXT PK UUID), `user_id` (FK -> users.id), `token_hash` (TEXT UNIQUE SHA-256), `created_at`, `expires_at`, `last_seen_at`.
3. **`user_settings`**: Per-user preferences and notification configurations.
   - `id` (TEXT PK), `user_id` (FK UNIQUE), `timezone`, `locale`, `theme`, `default_task_reminders`, `default_class_reminders`, `primary_class_alert_minutes`, `deadline_buffer_minutes`, `ai_enabled`, `created_at`, `updated_at`.
4. **`auth_rate_limits`**: Sliding window IP and username rate limiting.
   - `key_hash` (TEXT PK SHA-256), `window_start`, `attempt_count`, `blocked_until`.

### 2.2 Academic Organization
5. **`academic_terms`**: Semesters (e.g. Semester Genap 2025/2026).
   - `id` (PK), `user_id` (FK), `name`, `start_date`, `end_date`, `is_active`, `created_at`, `updated_at`.
6. **`courses`**: Academic subjects (Mata Kuliah).
   - `id` (PK), `user_id` (FK), `academic_term_id` (FK), `name`, `code`, `lecturer`, `credits`, `color`, `default_room`, `online_url`, `notes`, `archived`, `created_at`, `updated_at`.
7. **`class_schedules`**: Recurring weekly lecture slots.
   - `id` (PK), `user_id` (FK), `course_id` (FK), `day_of_week` (0-6), `start_time` (HH:MM), `end_time` (HH:MM), `room`, `online_url`, `enabled`, `created_at`, `updated_at`.
8. **`tasks`**: Academic assignments and tasks.
   - `id` (PK), `user_id` (FK), `course_id` (FK), `title`, `description`, `type`, `due_at`, `internal_target_at`, `priority`, `estimated_minutes`, `actual_minutes`, `status`, `source`, `completed_at`, `deleted_at`, `created_at`, `updated_at`.
9. **`subtasks`**: Task checklist items.
   - `id` (PK), `user_id` (FK), `task_id` (FK), `title`, `completed`, `order_index`, `created_at`, `updated_at`.
10. **`notes`**: Lecture and study notes.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `title`, `content`, `format`, `pinned`, `version`, `deleted_at`, `created_at`, `updated_at`.
11. **`readings`**: Legal textbooks and case law reading tracker.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `title`, `author`, `type`, `start_page`, `end_page`, `current_page`, `source_url`, `status`, `deadline`, `notes`, `created_at`, `updated_at`.
12. **`exams`**: Midterm (UTS) and Final (UAS) exams.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `name`, `type`, `exam_at`, `location`, `notes`, `created_at`, `updated_at`.
13. **`exam_topics`**: Specific syllabus topics to prepare per exam.
    - `id` (PK), `user_id` (FK), `exam_id` (FK), `title`, `completed`, `order_index`, `created_at`.
14. **`attendance`**: Class attendance records.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `class_date`, `status` (PRESENT / ABSENT / PERMIT / SICK), `notes`, `created_at`.
15. **`grades`**: Academic evaluation components (Tugas, UTS, UAS, Quiz).
    - `id` (PK), `user_id` (FK), `course_id` (FK), `component_name`, `weight`, `score`, `letter_grade`, `grade_point`, `created_at`, `updated_at`.

### 2.3 Legal Vault & File Storage
16. **`legal_bookmarks`**: Saved statutes and court decisions from Pasal.id.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `frbr_uri`, `title`, `type`, `number`, `year`, `user_note`, `created_at`.
17. **`files`**: Google Drive metadata registry.
    - `id` (PK), `user_id` (FK), `course_id` (FK), `drive_file_id`, `drive_parent_folder_id`, `name`, `mime_type`, `size_bytes`, `category`, `drive_web_view_link`, `created_at`.

### 2.4 Notifications, AI & System Auditing
18. **`push_subscriptions`**: Web Push VAPID endpoints.
    - `id` (PK), `user_id` (FK), `endpoint`, `p256dh`, `auth`, `created_at`, `last_used_at`.
19. **`notification_deliveries`**: Reminder deduplication log.
    - `id` (PK), `user_id` (FK), `entity_type`, `entity_id`, `occurrence_at`, `offset_minutes`, `channel`, `status`, `sent_at`.
20. **`ai_usage`**: AI provider audit ledger (tokens, latencies, HTTP statuses).
    - `id` (PK), `user_id` (FK), `provider`, `account_slot`, `model`, `request_type`, `status`, `http_status`, `input_tokens`, `output_tokens`, `latency_ms`, `error_class`, `created_at`.
21. **`app_config`**: Server-wide configuration parameters (e.g. root drive folder id).
    - `key` (TEXT PK), `value` (TEXT), `updated_at`.
22. **`system_audit_log`**: Security event ledger.
    - `id` (PK), `user_id` (FK), `action`, `entity_type`, `entity_id`, `ip_address`, `details`, `created_at`.

---

## 3. Database Migration Management

### 3.1 Generating Migrations
```bash
npm run db:generate
```
Outputs standard SQL migration scripts to `src/lib/db/migrations/`.

### 3.2 Running Migrations Against Turso
```bash
npm run db:migrate
```
Executes migrations sequentially against the target Turso instance using `src/lib/db/migrate.ts`.
