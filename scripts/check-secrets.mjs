import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => !f.startsWith("node_modules/"));

const patterns = [
  { name: "OpenAI-like key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "Kimi env with real value", regex: /KIMI_API_KEY\s*=\s*(?!YOUR_|\$\{|"?"?$)[^\s#"']+/g },
  { name: "OpenAI env with real value", regex: /OPENAI_API_KEY\s*=\s*(?!YOUR_|\$\{|"?"?$)[^\s#"']+/g },
];

const hits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const p of patterns) {
    if (p.regex.test(text)) {
      hits.push({ file, name: p.name });
    }
    p.regex.lastIndex = 0;
  }
}

if (hits.length) {
  console.error("Potential secrets detected in tracked files:");
  for (const hit of hits) {
    console.error(`- ${hit.file}: ${hit.name}`);
  }
  process.exit(1);
}

console.log("No obvious secrets found in tracked files.");
