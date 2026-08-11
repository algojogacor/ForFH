import { google } from "googleapis";
import { eq, sum } from "drizzle-orm";
import { db, appConfig, files } from "../db";
import { logger } from "../logger";

const isProduction = process.env.NODE_ENV === "production";

let oauth2ClientInstance: any = null;

const DISALLOWED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".vbs",
  ".ps1",
  ".scr",
  ".msi",
  ".dll",
  ".com",
  ".jar",
  ".jsp",
  ".php",
  ".phtml",
  ".asp",
  ".aspx",
  ".cgi",
];

/**
 * Sanitizes a filename and checks for forbidden executable extensions
 */
export function sanitizeFilename(rawName: string): { sanitized: string; valid: boolean; error?: string } {
  if (!rawName || typeof rawName !== "string") {
    return { sanitized: "", valid: false, error: "Nama file tidak valid." };
  }

  const trimmed = rawName.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    return { sanitized: "", valid: false, error: "Panjang nama file harus antara 1 dan 255 karakter." };
  }

  // Remove dangerous path traversals or control characters
  const cleanName = trimmed.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim();

  // Check file extension
  const dotIndex = cleanName.lastIndexOf(".");
  if (dotIndex !== -1) {
    const ext = cleanName.slice(dotIndex).toLowerCase();
    if (DISALLOWED_EXTENSIONS.includes(ext)) {
      return {
        sanitized: cleanName,
        valid: false,
        error: `Tipe file executable (${ext}) dilarang demi keamanan sistem.`,
      };
    }
  }

  return { sanitized: cleanName, valid: true };
}

export function getDriveOAuthClient() {
  if (oauth2ClientInstance) {
    return oauth2ClientInstance;
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  oauth2ClientInstance = oauth2;
  return oauth2ClientInstance;
}

/**
 * Idempotently bootstrap Google Drive root and user subfolder
 */
export async function getOrCreateUserDriveFolder(
  userId: string,
  category: string = "attachments"
): Promise<string | null> {
  const auth = getDriveOAuthClient();
  if (!auth) {
    if (isProduction) {
      logger.error("Google Drive OAuth credentials are not configured in production.");
      return null;
    }
    // Local dev simulated folder
    return `simulated_folder_${userId}_${category}`;
  }

  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. Get or create root "ForFH College Storage" folder
    let rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) {
      const config = await db.query.appConfig.findFirst({
        where: eq(appConfig.key, "google_drive_root_folder_id"),
      });
      if (config?.value) {
        rootFolderId = config.value;
      } else {
        const rootRes = await drive.files.create({
          requestBody: {
            name: "ForFH College Storage",
            mimeType: "application/vnd.google-apps.folder",
          },
          fields: "id",
        });
        rootFolderId = rootRes.data.id || undefined;
        if (rootFolderId) {
          await db.insert(appConfig).values({
            key: "google_drive_root_folder_id",
            value: rootFolderId,
          });
        }
      }
    }

    if (!rootFolderId) return null;

    // 2. Get or create "users" parent folder
    let usersFolderId: string | undefined;
    const usersSearch = await drive.files.list({
      q: `'${rootFolderId}' in parents and name = 'users' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    if (usersSearch.data.files && usersSearch.data.files.length > 0) {
      usersFolderId = usersSearch.data.files[0].id || undefined;
    } else {
      const usersRes = await drive.files.create({
        requestBody: {
          name: "users",
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
        },
        fields: "id",
      });
      usersFolderId = usersRes.data.id || undefined;
    }

    if (!usersFolderId) return null;

    // 3. Get or create user's UUID folder
    let userFolderId: string | undefined;
    const userSearch = await drive.files.list({
      q: `'${usersFolderId}' in parents and name = '${userId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    if (userSearch.data.files && userSearch.data.files.length > 0) {
      userFolderId = userSearch.data.files[0].id || undefined;
    } else {
      const userRes = await drive.files.create({
        requestBody: {
          name: userId,
          mimeType: "application/vnd.google-apps.folder",
          parents: [usersFolderId],
        },
        fields: "id",
      });
      userFolderId = userRes.data.id || undefined;
    }

    if (!userFolderId) return null;

    // 4. Get or create category subfolder (attachments, courses, notes, readings)
    const categorySearch = await drive.files.list({
      q: `'${userFolderId}' in parents and name = '${category}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    if (categorySearch.data.files && categorySearch.data.files.length > 0) {
      return categorySearch.data.files[0].id || null;
    }

    const catRes = await drive.files.create({
      requestBody: {
        name: category,
        mimeType: "application/vnd.google-apps.folder",
        parents: [userFolderId],
      },
      fields: "id",
    });

    return catRes.data.id || null;
  } catch (err) {
    logger.error("Error creating Google Drive user folder:", err);
    return null;
  }
}

/**
 * Creates Google Drive Resumable Upload Session URL for direct client upload
 */
export async function createResumableUploadSession(options: {
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
}): Promise<{ uploadUrl: string; folderId?: string } | { error: string }> {
  // Validate filename
  const filenameCheck = sanitizeFilename(options.filename);
  if (!filenameCheck.valid) {
    return { error: filenameCheck.error || "Nama file tidak valid." };
  }

  // Validate size
  if (options.sizeBytes <= 0) {
    return { error: "Ukuran file harus lebih besar dari 0 byte." };
  }
  if (options.sizeBytes > 50 * 1024 * 1024) {
    return { error: "Ukuran file melebihi batas maksimum 50 MB." };
  }

  // Check user quota first
  const quota = await getUserStorageQuota(options.userId);
  if (quota.usedBytes + options.sizeBytes > quota.limitBytes) {
    return { error: "Kapasitas penyimpanan ForFH Anda telah penuh." };
  }

  const auth = getDriveOAuthClient();
  if (!auth) {
    if (isProduction) {
      return { error: "Layanan penyimpanan ForFH belum dikonfigurasi pada server ini." };
    }
    // Development-only simulated upload URL
    return {
      uploadUrl: `/api/files/mock-upload?filename=${encodeURIComponent(filenameCheck.sanitized)}`,
      folderId: `dev_folder_${options.userId}`,
    };
  }

  const folderId = await getOrCreateUserDriveFolder(options.userId, options.category || "attachments");
  const token = await auth.getAccessToken();

  try {
    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": options.mimeType,
          "X-Upload-Content-Length": options.sizeBytes.toString(),
        },
        body: JSON.stringify({
          name: filenameCheck.sanitized,
          parents: folderId ? [folderId] : undefined,
        }),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      return { error: `Gagal inisialisasi upload penyimpanan: ${errText}` };
    }

    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      return { error: "Penyimpanan ForFH tidak mengembalikan URL upload." };
    }

    return { uploadUrl, folderId: folderId || undefined };
  } catch (err: any) {
    return { error: err.message || "Gagal membuat sesi upload penyimpanan." };
  }
}

/**
 * Server-side verification of uploaded file against Google Drive API
 */
export async function verifyDriveFileServerSide(params: {
  driveFileId: string;
  expectedName?: string;
  expectedSizeBytes?: number;
}): Promise<{
  verified: boolean;
  name: string;
  mimeType: string;
  sizeBytes: number;
  parentFolderId?: string;
  error?: string;
}> {
  const auth = getDriveOAuthClient();

  if (!auth) {
    if (isProduction) {
      return {
        verified: false,
        name: "",
        mimeType: "",
        sizeBytes: 0,
        error: "Google Drive integration is unconfigured in production.",
      };
    }
    // Dev mock pass
    if (params.driveFileId.startsWith("mock_") || params.driveFileId.startsWith("drive_")) {
      return {
        verified: true,
        name: params.expectedName || "mock_file.pdf",
        mimeType: "application/pdf",
        sizeBytes: params.expectedSizeBytes || 1024,
      };
    }
    return {
      verified: false,
      name: "",
      mimeType: "",
      sizeBytes: 0,
      error: "Invalid mock file ID in development mode.",
    };
  }

  const drive = google.drive({ version: "v3", auth });

  try {
    const fileRes = await drive.files.get({
      fileId: params.driveFileId,
      fields: "id, name, mimeType, size, trashed, parents",
    });

    const file = fileRes.data;

    if (!file || !file.id) {
      return { verified: false, name: "", mimeType: "", sizeBytes: 0, error: "File tidak ditemukan di Google Drive." };
    }

    if (file.trashed) {
      return { verified: false, name: "", mimeType: "", sizeBytes: 0, error: "File telah berada di kotak sampah Google Drive." };
    }

    const actualSize = file.size ? parseInt(file.size, 10) : params.expectedSizeBytes || 0;
    const actualName = file.name || params.expectedName || "unnamed_file";
    const actualMime = file.mimeType || "application/octet-stream";
    const parentFolderId = file.parents?.[0] || undefined;

    return {
      verified: true,
      name: actualName,
      mimeType: actualMime,
      sizeBytes: actualSize,
      parentFolderId,
    };
  } catch (err: any) {
    logger.error("Failed to verify Google Drive file server-side:", err);
    return {
      verified: false,
      name: "",
      mimeType: "",
      sizeBytes: 0,
      error: `Verifikasi berkas gagal: ${err.message || "Akses berkas ditolak."}`,
    };
  }
}

/**
 * Calculates current user storage quota usage
 */
export async function getUserStorageQuota(userId: string): Promise<{
  usedBytes: number;
  limitBytes: number;
  usedPercentage: number;
}> {
  const limitMb = parseInt(process.env.DEFAULT_USER_STORAGE_QUOTA_MB || "250", 10);
  const limitBytes = limitMb * 1024 * 1024;

  const result = await db
    .select({ totalBytes: sum(files.sizeBytes) })
    .from(files)
    .where(eq(files.userId, userId));

  const usedBytes = Number(result[0]?.totalBytes || 0);
  const usedPercentage = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

  return { usedBytes, limitBytes, usedPercentage };
}
