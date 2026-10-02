// Copies the shared AD tokens from Tape Type, unchanged: src/ad-tokens.json (the values every AD
// tool shares, and the tokens of the Alternative Dublin design system page), src/adTokens.ts (how
// the tools read them) and src/barlow.ts (the variable font's weight scale it maps with).
//
// Usage: node scripts/sync-tokens.mjs [ref]     (ref defaults to origin/main, what's live)
//   TAPE_REPO=~/tape-generator   where Tape Type lives.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = process.env.TAPE_REPO ?? join(homedir(), "tape-generator");
const ref = process.argv[2] ?? "origin/main";
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
try {
  git("fetch", "--quiet", "origin");
} catch {
  console.warn("Couldn't fetch tape-type; using the refs already here.");
}
for (const file of ["ad-tokens.json", "adTokens.ts", "barlow.ts"]) {
  writeFileSync(fileURLToPath(new URL(`../src/${file}`, import.meta.url)), git("show", `${ref}:src/${file}`));
}
console.log(`src/ad-tokens.json, adTokens.ts and barlow.ts synced from ${repo}@${git("rev-parse", "--short", ref).trim()}`);
