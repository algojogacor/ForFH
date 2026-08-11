import { rawClient } from "./index";

let isInitialized = false;

export async function initializeDatabaseSchema() {
  if (process.env.NODE_ENV === "production" || isInitialized) {
    return;
  }
  isInitialized = true;
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_username_norm_idx ON users(username_normalized);`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);`,
    `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);`,
    `CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);`,

    `CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
      locale TEXT NOT NULL DEFAULT 'id-ID',
      theme TEXT NOT NULL DEFAULT 'system',
      default_task_reminders TEXT NOT NULL DEFAULT '[10080, 4320, 1440, 360, 60]',
      default_class_reminders TEXT NOT NULL DEFAULT '[120, 90, 60, 30, 20]',
      primary_class_alert_minutes INTEGER NOT NULL DEFAULT 240,
      deadline_buffer_minutes INTEGER NOT NULL DEFAULT 720,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings(user_id);`,

    `CREATE TABLE IF NOT EXISTS academic_terms (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date INTEGER,
      end_date INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS academic_terms_user_id_idx ON academic_terms(user_id);`,

    `CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      academic_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT,
      lecturer TEXT,
      credits INTEGER DEFAULT 2,
      color TEXT DEFAULT '#3b82f6',
      default_room TEXT,
      online_url TEXT,
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS courses_user_id_idx ON courses(user_id);`,
    `CREATE INDEX IF NOT EXISTS courses_term_id_idx ON courses(academic_term_id);`,

    `CREATE TABLE IF NOT EXISTS class_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT,
      online_url TEXT,
      valid_from INTEGER,
      valid_until INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS class_schedules_user_id_idx ON class_schedules(user_id);`,
    `CREATE INDEX IF NOT EXISTS class_schedules_course_id_idx ON class_schedules(course_id);`,
    `CREATE INDEX IF NOT EXISTS class_schedules_day_of_week_idx ON class_schedules(day_of_week);`,

    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'assignment',
      due_at INTEGER,
      internal_target_at INTEGER,
      priority TEXT NOT NULL DEFAULT 'medium',
      estimated_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      progress INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      completed_at INTEGER,
      deleted_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);`,
    `CREATE INDEX IF NOT EXISTS tasks_course_id_idx ON tasks(course_id);`,
    `CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON tasks(due_at);`,
    `CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);`,
    `CREATE INDEX IF NOT EXISTS tasks_updated_at_idx ON tasks(updated_at);`,

    `CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER,
      due_at INTEGER,
      deleted_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS subtasks_task_id_idx ON subtasks(task_id);`,
    `CREATE INDEX IF NOT EXISTS subtasks_user_id_idx ON subtasks(user_id);`,

    `CREATE TABLE IF NOT EXISTS task_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      offset_minutes INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS task_reminders_task_id_idx ON task_reminders(task_id);`,
    `CREATE INDEX IF NOT EXISTS task_reminders_user_id_idx ON task_reminders(user_id);`,

    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'markdown',
      pinned INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);`,
    `CREATE INDEX IF NOT EXISTS notes_course_id_idx ON notes(course_id);`,
    `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at);`,

    `CREATE TABLE IF NOT EXISTS readings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      file_id TEXT,
      type TEXT NOT NULL DEFAULT 'book',
      title TEXT NOT NULL,
      author TEXT,
      source_url TEXT,
      start_page INTEGER,
      end_page INTEGER,
      current_page INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      deadline INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS readings_user_id_idx ON readings(user_id);`,
    `CREATE INDEX IF NOT EXISTS readings_course_id_idx ON readings(course_id);`,

    `CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'UTS',
      exam_at INTEGER NOT NULL,
      location TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS exams_user_id_idx ON exams(user_id);`,
    `CREATE INDEX IF NOT EXISTS exams_exam_at_idx ON exams(exam_at);`,
    `CREATE INDEX IF NOT EXISTS exams_course_id_idx ON exams(course_id);`,

    `CREATE TABLE IF NOT EXISTS exam_topics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE INDEX IF NOT EXISTS exam_topics_exam_id_idx ON exam_topics(exam_id);`,
    `CREATE INDEX IF NOT EXISTS exam_topics_user_id_idx ON exam_topics(user_id);`,

    `CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      class_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PRESENT',
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS attendance_user_course_date_idx ON attendance(user_id, course_id, class_date);`,
    `CREATE INDEX IF NOT EXISTS attendance_course_id_idx ON attendance(course_id);`,

    `CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      component_name TEXT NOT NULL,
      weight REAL,
      score REAL,
      letter_grade TEXT,
      grade_point REAL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS grades_user_id_idx ON grades(user_id);`,
    `CREATE INDEX IF NOT EXISTS grades_course_id_idx ON grades(course_id);`,

    `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      drive_file_id TEXT NOT NULL,
      drive_parent_folder_id TEXT,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'assignment',
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS files_user_id_idx ON files(user_id);`,
    `CREATE INDEX IF NOT EXISTS files_course_id_idx ON files(course_id);`,

    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      last_used_at INTEGER
    );`,
    `CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions(endpoint);`,

    `CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      occurrence_at INTEGER NOT NULL,
      offset_minutes INTEGER NOT NULL,
      channel TEXT NOT NULL DEFAULT 'web_push',
      status TEXT NOT NULL DEFAULT 'SENT',
      sent_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_dedupe_idx ON notification_deliveries(
      user_id, entity_type, entity_id, occurrence_at, offset_minutes, channel
    );`,
    `CREATE INDEX IF NOT EXISTS notification_deliveries_user_id_idx ON notification_deliveries(user_id);`,

    `CREATE TABLE IF NOT EXISTS legal_bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      frbr_uri TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      number TEXT,
      year TEXT,
      user_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS legal_bookmarks_user_id_idx ON legal_bookmarks(user_id);`,
    `CREATE INDEX IF NOT EXISTS legal_bookmarks_course_id_idx ON legal_bookmarks(course_id);`,

    `CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      account_slot INTEGER NOT NULL,
      model TEXT NOT NULL,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER,
      error_class TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`,
    `CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage(created_at);`,
    `CREATE INDEX IF NOT EXISTS ai_usage_provider_idx ON ai_usage(provider);`,
    `CREATE INDEX IF NOT EXISTS ai_usage_account_slot_idx ON ai_usage(account_slot);`,

    `CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key_hash TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      blocked_until INTEGER
    );`,

    `CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );`
  ];

  for (const sqlQuery of ddlStatements) {
    await rawClient.execute(sqlQuery);
  }
}
