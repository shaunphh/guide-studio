// Copies what Guide Studio shares with Tape Type, unchanged: the AD tokens, src/ad-tokens.json (the
// values every AD tool shares, and the tokens of the Alternative Dublin design system page),
// src/adTokens.ts (how the tools read them) and src/barlow.ts (the variable font's weight scale it
// maps with); and the tape engine, src/tape/geometry.ts, settings.ts, types.ts and photo.ts (the
// cuts and the photo crop). The engine's settings.ts reads the tokens from './adTokens', as it does
// in Tape Type; src/tape/adTokens.ts is a hand-written line that points it at the copy above, and
// is never overwritten. Before 18 Oct 2026 only the tokens were synced, and the engine stayed at
// Tape Type's 0615b68 (its eyebrow tags were still plain rectangles).
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
for (const file of ["geometry.ts", "settings.ts", "types.ts", "photo.ts"]) {
  writeFileSync(fileURLToPath(new URL(`../src/tape/${file}`, import.meta.url)), git("show", `${ref}:src/${file}`));
}
const commit = git("rev-parse", "--short", ref).trim();
console.log(`src/ad-tokens.json, adTokens.ts, barlow.ts and src/tape/ synced from ${repo}@${commit}. Name the commit in notes/guide-studio.md (Reused foundations).`);
