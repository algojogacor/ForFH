import { sanitizeFilename } from "../lib/drive/client";

export async function runDriveTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 4. Google Drive Storage & Upload Sanitization Tests ---");

  // 1. Valid Academic Filenames
  const validPdf = sanitizeFilename("Silabus_Hukum_Pidana_2026.pdf");
  assert(validPdf.valid === true && validPdf.sanitized === "Silabus_Hukum_Pidana_2026.pdf", "Clean PDF filename accepted");

  const validDocx = sanitizeFilename("Draf Skripsi - Bab 1.docx");
  assert(validDocx.valid === true, "DOCX filename with spaces accepted");

  // 2. Dangerous Path Characters Sanitization
  const pathTraverse = sanitizeFilename("../../../etc/passwd.pdf");
  assert(pathTraverse.valid === true && !pathTraverse.sanitized.includes("/"), "Path traversal slashes sanitized to underscores");

  // 3. Executable Payload Rejection
  const exeFile = sanitizeFilename("malware_payload.exe");
  assert(exeFile.valid === false, "Executable .exe file rejected");

  const batFile = sanitizeFilename("exploit.bat");
  assert(batFile.valid === false, "Script .bat file rejected");

  const shFile = sanitizeFilename("backdoor.sh");
  assert(shFile.valid === false, "Shell script .sh file rejected");

  // 4. Boundary checks
  const emptyName = sanitizeFilename("");
  assert(emptyName.valid === false, "Empty filename rejected");

  const longName = sanitizeFilename("a".repeat(260) + ".pdf");
  assert(longName.valid === false, "Excessively long filename (>255 chars) rejected");
}
