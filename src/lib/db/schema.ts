import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";

// ----------------------------------------------------
// 1. Users & Authentication
// ----------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    emailNormalized: text("email_normalized"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    usernameNormIdx: uniqueIndex("users_username_norm_idx").on(table.usernameNormalized),
    emailNormIdx: uniqueIndex("users_email_norm_idx").on(table.emailNormalized),
  })
);

// Akun kampus terhubung (Kampus Kita + HE-BAT) — token dienkripsi at-rest,
// password asli TIDAK PERNAH disimpan. jwt_enc = JWT Kampus Kita (~1 tahun),
// hebat_authtoken_enc = kunci kalender HE-BAT (tanpa sesi). Lihat src/lib/campus.
export const campusAccounts = sqliteTable(
  "campus_accounts",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    campusEmail: text("campus_email").notNull(),
    campusNim: text("campus_nim").notNull(),
    jwtEnc: text("jwt_enc").notNull(),
    hebatUserid: text("hebat_userid"),
    hebatAuthtokenEnc: text("hebat_authtoken_enc"),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    lastSyncStatus: text("last_sync_status").notNull().default("never"), // never | ok | error
    lastSyncSummary: text("last_sync_summary"),
    lastSyncError: text("last_sync_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    lastSyncIdx: index("campus_accounts_last_sync_idx").on(table.lastSyncAt),
  })
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt),
  })
);

export const userSettings = sqliteTable(
  "user_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    locale: text("locale").notNull().default("id-ID"),
    theme: text("theme").notNull().default("system"), // system | light | dark
    defaultTaskReminders: text("default_task_reminders").notNull().default("[10080, 4320, 1440, 360, 60]"), // json array of offsets
    defaultClassReminders: text("default_class_reminders").notNull().default("[120, 90, 60, 30, 20]"),
    primaryClassAlertMinutes: integer("primary_class_alert_minutes").notNull().default(240),
    deadlineBufferMinutes: integer("deadline_buffer_minutes").notNull().default(720), // 12 hours
    aiEnabled: integer("ai_enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_settings_user_id_idx").on(table.userId),
  })
);

// ----------------------------------------------------
// 2. Academic Terms & Courses
// ----------------------------------------------------
export const academicTerms = sqliteTable(
  "academic_terms",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Semester 3 2026/2027"
    startDate: integer("start_date", { mode: "timestamp_ms" }),
    endDate: integer("end_date", { mode: "timestamp_ms" }),
    isActive: integer("is_active").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("academic_terms_user_id_idx").on(table.userId),
  })
);

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    academicTermId: text("academic_term_id").references(() => academicTerms.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    code: text("code"),
    lecturer: text("lecturer"),
    credits: integer("credits").default(2), // SKS
    color: text("color").default("#3b82f6"),
    defaultRoom: text("default_room"),
    onlineUrl: text("online_url"),
    notes: text("notes"),
    archived: integer("archived").notNull().default(0),
    externalId: text("external_id"), // dari Kampus Kita (peserta-mata-kuliah / jadwal)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("courses_user_id_idx").on(table.userId),
    termIdIdx: index("courses_term_id_idx").on(table.academicTermId),
    userExternalIdx: index("courses_user_external_idx").on(table.userId, table.externalId),
  })
);

export const classSchedules = sqliteTable(
  "class_schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    startTime: text("start_time").notNull(), // "HH:MM" e.g. "08:00"
    endTime: text("end_time").notNull(), // "HH:MM" e.g. "09:40"
    room: text("room"),
    onlineUrl: text("online_url"),
    validFrom: integer("valid_from", { mode: "timestamp_ms" }),
    validUntil: integer("valid_until", { mode: "timestamp_ms" }),
    enabled: integer("enabled").notNull().default(1),
    externalId: text("external_id"), // dari Kampus Kita (jadwal-kuliah)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("class_schedules_user_id_idx").on(table.userId),
    courseIdIdx: index("class_schedules_course_id_idx").on(table.courseId),
    dayOfWeekIdx: index("class_schedules_day_of_week_idx").on(table.dayOfWeek),
    userExternalIdx: index("class_schedules_user_external_idx").on(table.userId, table.externalId),
  })
);

// ----------------------------------------------------
// 3. Tasks & Subtasks
// ----------------------------------------------------
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("assignment"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    internalTargetAt: integer("internal_target_at", { mode: "timestamp_ms" }),
    priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
    estimatedMinutes: integer("estimated_minutes"),
    status: text("status").notNull().default("NOT_STARTED"), // NOT_STARTED, IN_PROGRESS, REVISION, DONE, OVERDUE
    progress: integer("progress").notNull().default(0), // 0-100
    source: text("source").notNull().default("manual"), // manual, ai, quick_capture, campus
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    externalId: text("external_id"), // dari HE-BAT (UID event iCal)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("tasks_user_id_idx").on(table.userId),
    courseIdIdx: index("tasks_course_id_idx").on(table.courseId),
    dueAtIdx: index("tasks_due_at_idx").on(table.dueAt),
    statusIdx: index("tasks_status_idx").on(table.status),
    updatedAtIdx: index("tasks_updated_at_idx").on(table.updatedAt),
    userExternalIdx: index("tasks_user_external_idx").on(table.userId, table.externalId),
  })
);

export const subtasks = sqliteTable(
  "subtasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: integer("completed").notNull().default(0),
    orderIndex: integer("order_index").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    taskIdIdx: index("subtasks_task_id_idx").on(table.taskId),
    userIdIdx: index("subtasks_user_id_idx").on(table.userId),
  })
);

export const taskReminders = sqliteTable(
  "task_reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    offsetMinutes: integer("offset_minutes").notNull(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    taskIdIdx: index("task_reminders_task_id_idx").on(table.taskId),
    userIdIdx: index("task_reminders_user_id_idx").on(table.userId),
  })
);

// ----------------------------------------------------
// 4. Notes & Readings
// ----------------------------------------------------
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    format: text("format").notNull().default("markdown"),
    pinned: integer("pinned").notNull().default(0),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("notes_user_id_idx").on(table.userId),
    courseIdIdx: index("notes_course_id_idx").on(table.courseId),
    updatedAtIdx: index("notes_updated_at_idx").on(table.updatedAt),
  })
);

export const readings = sqliteTable(
  "readings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    fileId: text("file_id"),
    type: text("type").notNull().default("book"), // book, journal, law, case, module, ppt, other
    title: text("title").notNull(),
    author: text("author"),
    sourceUrl: text("source_url"),
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    currentPage: integer("current_page").default(0),
    status: text("status").notNull().default("NOT_STARTED"), // NOT_STARTED, READING, DONE
    deadline: integer("deadline", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("readings_user_id_idx").on(table.userId),
    courseIdIdx: index("readings_course_id_idx").on(table.courseId),
  })
);

// ----------------------------------------------------
// 5. Exams, Attendance & Grades
// ----------------------------------------------------
export const exams = sqliteTable(
  "exams",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("UTS"), // UTS, UAS, QUIZ, OTHER
    examAt: integer("exam_at", { mode: "timestamp_ms" }).notNull(),
    location: text("location"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("exams_user_id_idx").on(table.userId),
    examAtIdx: index("exams_exam_at_idx").on(table.examAt),
    courseIdIdx: index("exams_course_id_idx").on(table.courseId),
  })
);

export const examTopics = sqliteTable(
  "exam_topics",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: integer("completed").notNull().default(0),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (table) => ({
    examIdIdx: index("exam_topics_exam_id_idx").on(table.examId),
    userIdIdx: index("exam_topics_user_id_idx").on(table.userId),
  })
);

export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    classDate: text("class_date").notNull(), // YYYY-MM-DD
    status: text("status").notNull().default("PRESENT"), // PRESENT, PERMIT, SICK, ABSENT
    notes: text("notes"),
    externalId: text("external_id"), // dari Kampus Kita (presensi-kuliah)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userCourseDateIdx: uniqueIndex("attendance_user_course_date_idx").on(table.userId, table.courseId, table.classDate),
    courseIdIdx: index("attendance_course_id_idx").on(table.courseId),
  })
);

export const grades = sqliteTable(
  "grades",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    componentName: text("component_name").notNull(), // e.g. "Tugas 1", "UTS", "UAS"
    weight: real("weight"), // e.g. 20 (percent)
    score: real("score"), // e.g. 85.5
    letterGrade: text("letter_grade"), // e.g. "A", "B+"
    gradePoint: real("grade_point"), // e.g. 4.0
    externalId: text("external_id"), // dari Kampus Kita (riwayat-khs)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("grades_user_id_idx").on(table.userId),
    courseIdIdx: index("grades_course_id_idx").on(table.courseId),
    userExternalIdx: index("grades_user_external_idx").on(table.userId, table.externalId),
  })
);

// ----------------------------------------------------
// 5b. Campus data (rekap & info kampus dari Kampus Kita)
// ----------------------------------------------------
// Satu baris per (user, jenis). data_json = JSON.stringify baris hasil sync:
// jenis "presensi" = hasil presensiToRecap (agregat per MK), jenis
// "instruksi_tugas" = hasil crawl section summary HE-BAT saat connect (bukan
// dari API KK), lainnya = baris mentah rowsFrom. Data bukan rahasia (mirip
// courses/grades), disimpan plaintext; token kampus tetap terenkripsi.
export const CAMPUS_DATA_JENIS = [
  "presensi",
  "pembayaran",
  "dosen_wali",
  "masa_studi",
  "sks_aktif",
  "hist_her",
  "penyerahan_ktm",
  "kalender_akademik",
  "instruksi_tugas",
] as const;
export type CampusDataJenis = (typeof CAMPUS_DATA_JENIS)[number];

export const campusData = sqliteTable(
  "campus_data",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jenis: text("jenis").notNull(), // CAMPUS_DATA_JENIS
    dataJson: text("data_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userJenisIdx: uniqueIndex("campus_data_user_jenis_idx").on(table.userId, table.jenis),
  })
);

// ----------------------------------------------------
// 6. Files & Google Drive Storage
// ----------------------------------------------------
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    driveFileId: text("drive_file_id").notNull(),
    driveParentFolderId: text("drive_parent_folder_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: text("category").notNull().default("assignment"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("files_user_id_idx").on(table.userId),
    courseIdIdx: index("files_course_id_idx").on(table.courseId),
  })
);

// ----------------------------------------------------
// 7. Notifications & Reminders (Web Push & QStash)
// ----------------------------------------------------
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    userIdIdx: index("push_subscriptions_user_id_idx").on(table.userId),
    endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
  })
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // class, task, exam
    entityId: text("entity_id").notNull(),
    occurrenceAt: integer("occurrence_at", { mode: "timestamp_ms" }).notNull(),
    offsetMinutes: integer("offset_minutes").notNull(),
    channel: text("channel").notNull().default("web_push"),
    status: text("status").notNull().default("SENT"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    dedupeIdx: uniqueIndex("notification_deliveries_dedupe_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
      table.occurrenceAt,
      table.offsetMinutes,
      table.channel
    ),
    userIdIdx: index("notification_deliveries_user_id_idx").on(table.userId),
  })
);

// ----------------------------------------------------
// 8. Legal Bookmarks (Pasal.id)
// ----------------------------------------------------
export const legalBookmarks = sqliteTable(
  "legal_bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
    frbrUri: text("frbr_uri").notNull(),
    title: text("title").notNull(),
    type: text("type"),
    number: text("number"),
    year: text("year"),
    userNote: text("user_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdIdx: index("legal_bookmarks_user_id_idx").on(table.userId),
    courseIdIdx: index("legal_bookmarks_course_id_idx").on(table.courseId),
  })
);

// ----------------------------------------------------
// 9. AI Usage & Rate Limiting
// ----------------------------------------------------
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: text("provider").notNull(), // groq, ollama
    accountSlot: integer("account_slot").notNull(), // 1, 2
    model: text("model").notNull(),
    requestType: text("request_type").notNull(), // task_parse, breakdown, smart_deadline, legal_explain, daily_insight, summary
    status: text("status").notNull(), // SUCCESS, FAILURE
    httpStatus: integer("http_status"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    errorClass: text("error_class"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    createdAtIdx: index("ai_usage_created_at_idx").on(table.createdAt),
    providerIdx: index("ai_usage_provider_idx").on(table.provider),
    accountSlotIdx: index("ai_usage_account_slot_idx").on(table.accountSlot),
  })
);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  blockedUntil: integer("blocked_until", { mode: "timestamp_ms" }),
});

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

// ----------------------------------------------------
// Drizzle Relations definitions
// ----------------------------------------------------
export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  sessions: many(sessions),
  terms: many(academicTerms),
  courses: many(courses),
  tasks: many(tasks),
  notes: many(notes),
  readings: many(readings),
  exams: many(exams),
  files: many(files),
  pushSubscriptions: many(pushSubscriptions),
  legalBookmarks: many(legalBookmarks),
  campusData: many(campusData),
}));

export const campusDataRelations = relations(campusData, ({ one }) => ({
  user: one(users, { fields: [campusData.userId], references: [users.id] }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  user: one(users, {
    fields: [courses.userId],
    references: [users.id],
  }),
  academicTerm: one(academicTerms, {
    fields: [courses.academicTermId],
    references: [academicTerms.id],
  }),
  schedules: many(classSchedules),
  tasks: many(tasks),
  notes: many(notes),
  readings: many(readings),
  exams: many(exams),
  attendance: many(attendance),
  grades: many(grades),
  files: many(files),
  legalBookmarks: many(legalBookmarks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [tasks.courseId],
    references: [courses.id],
  }),
  subtasks: many(subtasks),
  reminders: many(taskReminders),
}));

export const academicTermsRelations = relations(academicTerms, ({ one, many }) => ({
  user: one(users, {
    fields: [academicTerms.userId],
    references: [users.id],
  }),
  courses: many(courses),
}));

export const classSchedulesRelations = relations(classSchedules, ({ one }) => ({
  course: one(courses, {
    fields: [classSchedules.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [classSchedules.userId],
    references: [users.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  course: one(courses, {
    fields: [notes.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
}));

export const readingsRelations = relations(readings, ({ one }) => ({
  course: one(courses, {
    fields: [readings.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [readings.userId],
    references: [users.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  course: one(courses, {
    fields: [attendance.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [attendance.userId],
    references: [users.id],
  }),
}));

export const gradesRelations = relations(grades, ({ one }) => ({
  course: one(courses, {
    fields: [grades.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [grades.userId],
    references: [users.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  course: one(courses, {
    fields: [files.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
}));

export const legalBookmarksRelations = relations(legalBookmarks, ({ one }) => ({
  course: one(courses, {
    fields: [legalBookmarks.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [legalBookmarks.userId],
    references: [users.id],
  }),
}));

export const examTopicsRelations = relations(examTopics, ({ one }) => ({
  exam: one(exams, {
    fields: [examTopics.examId],
    references: [exams.id],
  }),
  user: one(users, {
    fields: [examTopics.userId],
    references: [users.id],
  }),
}));

export const taskRemindersRelations = relations(taskReminders, ({ one }) => ({
  task: one(tasks, {
    fields: [taskReminders.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskReminders.userId],
    references: [users.id],
  }),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, {
    fields: [subtasks.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [subtasks.userId],
    references: [users.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  course: one(courses, {
    fields: [exams.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [exams.userId],
    references: [users.id],
  }),
  topics: many(examTopics),
}));
