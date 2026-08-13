# ForFH V4 — Production Hardening Audit Report

**Date:** 2026-08-11  
**Target:** Production Readiness (Vercel + Turso + Web/PWA + Multi-User + AI + Google Drive + Pasal.id + QStash)  
**Status:** Audit Completed — Initiating Immediate Remediation Pass

---

## 1. System Architecture Overview

| Component | Current Implementation | Target Production State |
| :--- | :--- | :--- |
| **Framework** | Next.js 15.1.7 (App Router), React 19, TypeScript 5.7 | Next.js 15 on Vercel Serverless |
| **Database** | LibSQL / Turso via `@libsql/client` & `drizzle-orm` | Hosted Turso DB with Drizzle Migrations |
| **Authentication** | High-entropy session tokens disimpan RAW di DB (nilai asli = nilai tersimpan, tanpa hashing), login hanya via verifikasi Kampus Kita (password tidak pernah disimpan), HttpOnly cookies | Hardened session isolation, tanpa secret tambahan (SESSION_SECRET/PASSWORD_PEPPER dihapus 2026-08) |
| **AI Routing** | Groq (`openai/gpt-oss-120b`, 2 key slots) &rarr; Ollama Cloud (`gpt-oss:120b-cloud`, 2 key slots) &rarr; MiniMax M3 Cloud fallback | Strict Zod validation, single-attempt JSON repair guard, circuit breaker cooldown, graceful app degradation |
| **Google Drive** | Centralized Google Drive (OAuth2 refresh token) with per-user folder hierarchy | Resumable direct upload, server-side Drive API verification, strict quota and user isolation |
| **Legal Engine** | Pasal.id REST API (`/search`, `/laws/{frbr_uri}`) | Fail-closed in production, zero mock fallback in prod, Indonesian error messaging |
| **Reminders** | Upstash QStash &rarr; Web Push worker (`web-push`, VAPID) | Fail-closed signature verification, idempotency deduplication, stale subscription cleanup |
| **Offline / PWA** | Service Worker (`public/sw.js`) + IndexedDB (`idb`) | User-namespaced cache isolation, clear sensitive data on logout, no cross-user data leakage |

---

## 2. Categorized Vulnerability & Issue Audit

### 🔴 CRITICAL ISSUES

1. **Production Database Must Fail Fast (No Silent SQLite Fallback in Production)**
   - *Findings:* `src/lib/env.ts` defaults `TURSO_DATABASE_URL` to `"file:forfh-local.db"`, and `src/lib/db/index.ts` silently creates a local file database if environment variables are missing.
   - *Risk:* In production on Vercel, serverless instances write to ephemeral local SQLite files that discard data upon container recycling.
   - *Required Fix:* In production (`NODE_ENV === "production"`), if `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` is missing, throw an immediate fatal error and fail fast.

2. **Runtime Random Secret Generation in Production** — *RESOLVED 2026-08*
   - *Findings:* `src/lib/env.ts` lines 79–99 fallback to `crypto.randomBytes(32)` if `SESSION_SECRET` or `PASSWORD_PEPPER` is not defined or is too short.
   - *Risk:* Each Vercel serverless worker generates a distinct in-memory secret; user sessions created on Worker A are invalidated on Worker B, and user passwords hashed on one instance become unverifiable on another.
   - *Required Fix:* Fail fast immediately on server boot if `SESSION_SECRET` or `PASSWORD_PEPPER` is missing in production.
   - *2026-08:* `SESSION_SECRET` & `PASSWORD_PEPPER` **dihapus total** (app pribadi — tidak ada enkripsi at-rest/hashing password). Penyimpanan = nilai asli; risiko item ini tidak lagi berlaku.

3. **Cross-User Authorization Vulnerabilities Across Entity Endpoints**
   - *Findings:*
     - `POST /api/tasks` & `PUT /api/tasks/[id]`: accepts `courseId` without verifying `courses.userId === user.id`.
     - `POST /api/notes` & `PUT /api/notes/[id]`: accepts `courseId` without verifying ownership.
     - `POST /api/exams`: accepts `courseId` without verifying ownership.
     - `POST /api/attendance`: accepts `courseId` without verifying ownership; updates record without scoped `userId`.
     - `POST /api/grades`: accepts `courseId` without verifying ownership.
     - `POST /api/readings`: accepts `courseId` without verifying ownership.
     - `POST /api/courses`: accepts `academicTermId` without verifying term ownership.
     - `POST /api/legal/bookmarks`: accepts `courseId` without verifying ownership.
     - `POST /api/files/record`: accepts `courseId` without verifying ownership.
   - *Risk:* Malicious or bug-induced requests can associate objects across different user accounts, leaking course and entity relationships.
   - *Required Fix:* Enforce strict `AND userId = authenticatedUserId` for all mutations and verify parent foreign key ownership before every write.

4. **Unverified Server-Side Google Drive Ingestion & Production Upload Mocks**
   - *Findings:* `POST /api/files/record` blindly trusts browser-supplied `driveFileId`, `sizeBytes`, `mimeType`, and `name`. Furthermore, `src/lib/drive/client.ts` fabricates mock folder IDs and simulated upload URLs if Drive credentials are missing.
   - *Risk:* Attackers can insert arbitrary or non-existent file metadata into the database; missing credentials silently create fake success states in production.
   - *Required Fix:* Query the Google Drive API server-side to verify that the file actually exists, belongs to the app root/user folder, matches the declared MIME type and size, and is not trashed. Fail with an explicit integration error if Drive credentials are not configured in production.

5. **Pasal.id Mock Fallback in Production**
   - *Findings:* `src/lib/legal/pasal-client.ts` falls back to `MOCK_LAWS` if API calls fail or credentials are unset.
   - *Risk:* Users in production may receive hardcoded demo law data instead of live regulatory information, causing legal inaccuracy and hallucinations.
   - *Required Fix:* Disable mock fallbacks when `NODE_ENV === "production"`. Return controlled error: `"Data hukum sedang tidak dapat diambil."`

6. **QStash Signature Bypass (Fail-Open in Production)**
   - *Findings:* `src/app/api/internal/reminders/process/route.ts` only verifies signatures `if (currentKey && nextKey)`. If signing keys are omitted, verification is completely skipped.
   - *Risk:* Anyone on the public internet can send POST requests to trigger massive reminder broadcasts and exhaust notification quotas.
   - *Required Fix:* Fail closed in production. If signing keys are missing or invalid in production, reject immediately with `401 Unauthorized`.

7. **AI Structured Output Bypass & Unbounded Repair Loops**
   - *Findings:*
     - `src/lib/ai/groq.ts`: on Zod parsing failure, executes `parsedData = rawJson`, trusting raw unvalidated model output.
     - `src/lib/ai/ollama.ts`: repair mechanism lacks a strict single-attempt guard parameter, risking infinite recursive repair.
   - *Required Fix:* Implement strict parse &rarr; validate &rarr; single repair attempt &rarr; validate &rarr; controlled failure pipeline. Never trust unvalidated JSON.

8. **Runtime DDL Schema Bootstrap on Normal Requests**
   - *Findings:* `initializeDatabaseSchema()` executes 20+ `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` queries inside `register`, `login`, `session`, `rate-limit`, `worker`, etc.
   - *Risk:* Massively degrades latency on serverless instances and stresses Turso connection limits.
   - *Required Fix:* Delegate schema management to Drizzle migrations; disable runtime DDL during normal production operations.

---

### 🟠 HIGH ISSUES

9. **Offline Data Multi-User Cross-Contamination**
   - *Findings:* `src/lib/offline/idb.ts` uses a single un-namespaced IndexedDB database (`forfh-local-db`).
   - *Risk:* When User A logs out and User B logs in on the same browser/device, User A's cached offline courses, tasks, and notes remain accessible.
   - *Required Fix:* Scope IndexedDB stores or records by `userId`, and automatically purge cached user data on logout.

10. **Build Linting Shortcut in Next.js Config**
    - *Findings:* `next.config.ts` contains `eslint: { ignoreDuringBuilds: true }`.
    - *Required Fix:* Remove `ignoreDuringBuilds` and ensure full ESLint pass.

11. **Notification Idempotency & Stale Push Subscription Handling**
    - *Findings:* `worker.ts` notification dispatch needs strict deduplication and stale subscription pruning on `404`/`410` HTTP responses.
    - *Required Fix:* Verify unique compound index in `notification_deliveries` and ensure inactive/expired endpoints are removed from DB.

12. **Secret Redaction in Logging**
    - *Findings:* Direct `console.error` in network and auth modules could inadvertently print tokens or authorization headers.
    - *Required Fix:* Introduce centralized logging sanitizer that redacts keys, auth tokens, session IDs, and peppers.

---

### 🟡 MEDIUM ISSUES

13. **Misleading Google Drive UI Copy**
    - *Findings:* UI states "Kapasitas Google Drive Anda" and "Unggah Berkas ke Google Drive Anda".
    - *Fix:* Clarify UI text to "Penyimpanan ForFH" / "Unggah Berkas" as users do not link their private Google Drive.

14. **Centralized Environment Schema Validation**
    - *Fix:* Create a unified `src/lib/env.ts` with strict Zod parsing, separate server-only secrets from client-safe variables, and export type-safe config.

15. **Standardized API Error Response Contract**
    - *Fix:* Standardize `{ error: { code: string, message: string } }` across all `/api/*` endpoints with error codes (`UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFIGURATION_ERROR`, `AI_UNAVAILABLE`, `DRIVE_UNAVAILABLE`, `PASAL_UNAVAILABLE`, `RATE_LIMITED`, `INTERNAL_ERROR`).

16. **HTTP Security Headers**
    - *Fix:* Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` to `next.config.ts`.

---

### 🟢 LOW ISSUES

17. **Drizzle Migration Files & Documentation**
    - *Fix:* Generate production Drizzle SQL migration files in `src/lib/db/migrations` and document migration workflows in `docs/DATABASE.md`.

18. **Package Quality Scripts**
    - *Fix:* Ensure `typecheck`, `lint`, `test`, `build`, and `quality` npm scripts are configured.

19. **Comprehensive Automated Test Coverage**
    - *Fix:* Write robust automated test suites verifying Auth, Cross-User authorization, AI circuit breaking and repair, QStash fail-closed behavior, Google Drive verification, and Pasal.id error handling.

---

## 3. Immediate Action Plan

1. **Step 1 — Environment & Database Configuration**: Fix `src/lib/env.ts` and `src/lib/db/index.ts` to enforce Turso in production, fail fast on missing secrets (2026-08: `SESSION_SECRET`/`PASSWORD_PEPPER` sudah dihapus — tidak relevan lagi), and separate client/server envs.
2. **Step 2 — Drizzle Migrations & Remove Runtime DDL**: Generate migration files, remove repeated `initializeDatabaseSchema()` calls from production runtime paths.
3. **Step 3 — Cross-User Authorization Pass**: Update all API routes (`courses`, `tasks`, `subtasks`, `notes`, `exams`, `attendance`, `grades`, `readings`, `terms`, `files`, `legal`) to enforce ownership and parent validation.
4. **Step 4 — Google Drive Hardening**: Implement server-side file metadata verification against Google Drive API; eliminate mock upload URLs in production; update UI copy.
5. **Step 5 — Pasal.id & AI Hardening**: Eliminate production mock law data; harden Groq structured output validation; enforce strict single-attempt repair guard in Ollama; harden circuit breaker.
6. **Step 6 — QStash & Web Push Hardening**: Fail closed on missing signing keys in production; harden reminder deduplication window; prune dead push subscriptions.
7. **Step 7 — PWA & Offline Isolation**: Isolate IndexedDB by user ID and ensure logout clears cached user data.
8. **Step 8 — Quality Gate Verification**: Add comprehensive test suites, run `typecheck`, `lint`, `test`, and `build` until 100% passing.
