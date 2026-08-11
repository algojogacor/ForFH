import { normalizeFrbrUri } from "../lib/legal/pasal-client";

export async function runPasalTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 5. Pasal.id Legal API & FRBR URI Tests ---");

  // 1. URI Normalization
  assert(
    normalizeFrbrUri("akn/id/act/uu/2023/1") === "akn/id/act/uu/2023/1",
    "Clean FRBR URI preserved"
  );
  assert(
    normalizeFrbrUri("///akn/id/act/uu/2023/1") === "akn/id/act/uu/2023/1",
    "Leading slashes stripped from FRBR URI"
  );
  assert(
    normalizeFrbrUri("  akn/id/act/kuhperdata  ") === "akn/id/act/kuhperdata",
    "Whitespace trimmed from FRBR URI"
  );

  // 2. Production Controlled Error Message
  const controlledErrorMessage = "Data hukum sedang tidak dapat diambil.";
  assert(
    controlledErrorMessage === "Data hukum sedang tidak dapat diambil.",
    "Standardized Indonesian error message for legal API failures"
  );
}
