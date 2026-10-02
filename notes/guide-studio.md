# Alternative Dublin Guide Studio

A working prototype for Event Guide Picks and What’s New in Dublin. Both series use one renderer with shared typography, spacing and colour controls. Like Tape Type and the event guide, it is built to live on GitHub Pages at https://shaunphh.github.io/guide-studio/ (see Hosting).

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5193 (keep this exact address: saved guides belong to it, and `localhost` or another port starts an empty library). `npm run build` checks types and creates `dist`; `npm test` verifies importing, saved project validation and the ZIP format. Dependencies are the project’s own (`package-lock.json`, since 2 October; before that node_modules was a link into a temporary Tape Type folder). If `npm install` stops with “Cannot read properties of null (reading 'edgesOut')”, that is an npm 10 bug: run `npm install --legacy-peer-deps`.

## Hosting

The repo deploys itself: every push to `main` runs `.github/workflows/pages.yml` (install, tests, build) and publishes `dist` to GitHub Pages, as the event guide does. The build is served from `/guide-studio/` (the repo’s name; `vite.config.ts`, override with `BASE_PATH`), so files from `public/` are reached through `asset()` in `render.ts`, while saved pages keep root paths such as `/photos/pub.jpg`. `npm run build` then `npx vite preview` serves the build the same way locally, at http://127.0.0.1:4173/guide-studio/.

The hosted site keeps its own library, separate from the local one at 127.0.0.1:5193 (saving is per browser and per site). To move a guide across, use Backup on one and Restore on the other.

## Try

- Start with the clearly labelled sample guide. Sample stories/photos are layout examples; replace them before publishing.
- Switch Picks / What’s New. Story content, crops and event details survive either direction.
- Edit the cover and date. Use two photos side by side or top and bottom, each with its own crop. The scrim starts at 30% and remains adjustable.
- Picks omits supporting copy; What’s New places it at the bottom over the photos. Both use a dark divider and a top-right logo. Logo and arrow are yellow for Picks, white for What’s New.
- Four-photo, logo-position, mark-colour, divider-colour and subtitle-position alternatives stay visible but disabled. Add `?unlocked` to the local URL for design exploration. These are editorial guardrails, not access controls. Hidden photo slots and supporting copy stay saved.
- Select a story to edit its title, copy, emphasis, photo, footer and picture height. Reorder, duplicate and add stories.
- ↑ and ↓ step through the pages in the sidebar's order, as clicking them does, except while typing in a field, on a slider, in a dialog, or nudging the tape box.
- Upload a cover image directly into either photo slot, or use an eligible story image. Uploads and cover crops stay independent of inside pages.
- Adjust tape background opens a temporary bounding box. Drag the box or its handles, enter exact X/Y/width/height, and copy the values. Each series keeps its own dimensions per guide. The outline never exports; the adjusted background does.
- The sample stories run about as long as a real one (~520 characters, which fills a page under a one-line headline). My guides → New guide → “Start from the sample pages” makes a fresh copy. House style → Make a full-pages preview runs a copy of the open guide to the very last line, using the renderer’s actual wrapping to stop above the footer.
- Drag on the page itself: photos to reframe them, the cover headline up and down. The sliders follow along; each drag is one undo step. Every inside picture is the house height (House style); `?unlocked` lets a page change its own, by slider or by dragging the picture’s bottom edge.
- Two Instagram handles: type them with a space between, and they stack in the footer.
- Cover choices omit the Late Night Art demo poster. New sample covers use the neutral interior and Dublin river photos. On any story, turn off “Offer this photo for the cover” for posters or graphics; the inside page keeps its image.
- House style controls update all locally saved drafts. A custom story picture height is retained.
- Import copy: labelled plain-text sections separated by `---`, Markdown headings, or CSV with Title/Name, Body/Description, Handle/Instagram Link, Date, Time and Venue/Location columns. Review before creating a new guide or appending stories. Existing manual edits are never overwritten by an import.
- Export one PNG or an ordered carousel ZIP, at 1× or 2×. Missing photos/content and overflowing pages block export and take you to the page needing attention.

## Saving

The complete library, including uploaded image data and separate crops, is saved in IndexedDB. Save failures are visible. This is local to the browser and origin (including port): there are no accounts, cloud storage or cross-device collaboration. Use Backup for a portable `.guide.json` containing the complete issue, actual image data and house styles. Restore creates a new issue and explicitly lets you choose whether to apply its saved styles globally. Undo/redo is available during a session; it is not a persistent version history. Browser storage clearing removes local drafts, so keep backups for important work. Avoid editing the same local library in multiple tabs simultaneously.

## The shared AD tokens

The house style starts from the values every Alternative Dublin tool shares: `src/ad-tokens.json`, copied unchanged from Tape Type with `src/adTokens.ts` (how the tools read it) by `node scripts/sync-tokens.mjs`. The colours, type sizes and weights, margins, picture height, safe area and mark sizes come from it; House style edits still adjust a library's own copy. To change a shared value, change it in Tape Type, then sync.

## Reused foundations

- `src/tape/geometry.ts`, `types.ts`, `settings.ts`, `photo.ts`: copied from Tape Type (`0615b68`) for seeded tape geometry and crop calculations. The existing tools are untouched.
- `src/event-source.js`: Event-guide’s CSV parser. The new importer supports undated stories and longer descriptions instead of enforcing the weekly event schema.
- Barlow fonts, logo and swipe arrow: Tape Type’s bundled assets.
- `BarlowGX-Normal.ttf`: Event-guide’s width-pinned variable Barlow, using its native 22–188 weight axis. All upright text is drawn from it (`src/barlow.ts`). Inside titles start at 168, the story-title weight every AD tool shares, and the cover date at 166, ExtraBold, the weight of every AD tag; both keep fine weight controls in House style.
- Sample photography: existing Tape Type templates.

The prototype uses the same canvas drawing for previews, thumbnails and exported PNGs. Fonts and images are local; export has no network service dependency. `src/zip.ts` writes stored ZIP records (PNG is already compressed).

Approved type defaults: covers 196px Bold, −3% tracking and 85% line height; supporting copy 46px Medium; the cover date a tag, ExtraBold capitals on clean-cut tape (Tape Type’s eyebrow); inside body 38px Regular (400); inside titles 69px capitals at the variable font’s 168, Normal width, zero tracking; footer Bold 31px. Body colours are #4B4A4A on light and #C2C2C2 on dark; the AD palette is #F0F0F0 / #101010 / #FFED1F. The two tape backgrounds have different padding for optical balance: around the default headlines, Picks is 639 × 601 and What’s New 689 × 617, centred, with the cut’s wider strip at the bottom. Earlier prototype libraries receive these typography defaults once; subsequent adjustments, copy, photos and crops are preserved.

## Deliberately deferred

Direct Google Docs/Sheets connections; automatic source refresh and conflict resolution; shared team saving and accounts; persistent version history; publishing global brand updates to the existing tools. This trial establishes the editor, page rendering and saved issue format before those integrations.

The Instagram post mockup preview idea is recorded in `notes/decisions.md` for a later pass across this tool, Tape Type and Event-guide.
