import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOTS = ["app", "components"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN_IMPORTS = [
  "@/lib/firebase/client",
  "@/lib/supabase/client",
];

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }

      if (entry.isFile() && EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) {
        return [path];
      }

      return [];
    }),
  );

  return files.flat();
}

describe("client components do not import the Firestore browser client", () => {
  it("routes browser data access through API routes", async () => {
    const files = (await Promise.all(ROOTS.map(collectSourceFiles))).flat();
    const violations = [];

    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(file, "utf8");

        for (const importPath of FORBIDDEN_IMPORTS) {
          const pattern = new RegExp(`from\\s+["']${importPath.replaceAll("/", "\\/")}["']`);

          if (pattern.test(source)) {
            violations.push(file);
          }
        }
      }),
    );

    violations.sort();
    assert.deepEqual(violations, []);
  });
});
