# Guide Studio — design notes

## Saved for later: Instagram post preview

Requested 2 October 2026. Add a Preview button that places the page currently being edited inside an Instagram post mockup: account header, carousel position, familiar post controls, caption area, and realistic on-screen sizing. This is for judging hierarchy and readability in context, particularly for Shaun; editors need not use it. Consider making the same preview available in Tape Type and Event-guide. Keep the mockup outside the exported artwork. This idea is recorded for a later pass, not part of the current cover changes.

## Current direction

- Both series: two images with an active Side by side / Top & bottom layout switch, a dark divider, centred tape headline, and top-right logo. Four-image collages remain disabled in the regular editor.
- Event Guide Picks: light headline tape, yellow date strip and yellow logo/arrow, no supporting copy on the cover.
- What’s New in Dublin: yellow headline tape, light date strip and white logo/arrow. Supporting copy sits at the bottom over the photography.
- Keep alternative collage, divider, logo-position and mark-colour choices visible but disabled for now. Use `?unlocked` for design exploration, following Tape Type’s approach.
- Photo scrim starts at 30%, with an available slider.
- Cover title: Barlow Bold, 196px, −3% tracking (−5.88px), 85% line height (166.6px). Supporting copy: 46px.
- Balance each series’ tape dimensions optically rather than forcing identical rectangles. Shaun’s sizes (2 October), now the defaults around the default headlines: Picks 639 × 601, What’s New 689 × 617, centred, the lettering where it was (X/Y he sent were moved by accident, so not used). Boxes dragged before then were dropped once (`BACKGROUNDS_REVISION` in model.ts).
- The cut’s wider strip (the “extension”) sits at the bottom, under the last line, so the block stands on it. The rough cut is drawn upside down; nothing else about it changed.
- Inside-page body: 38px. Was Medium (500); Regular (400) since 2 October, round 5 (the AD system). Text colour is #4B4A4A on light pages and #C2C2C2 on dark pages (was #d2d2d2).
- Inside-page title: 64px (69px until 5 October), with the same variable Barlow font approach as Event-guide so weight can be finely adjusted. Was 178 (near Black); 168 in capitals since round 6, the story-title weight every AD tool shares. A title of two or more lines breaks into lines as even as they'll go (PRETTY GOOD IMPROV / X FAILED STATE), never one word left on its own.
- Inside titles use full-width (Normal) Barlow with zero tracking. The −3% tracking applies to cover headlines only.
- Trial cover photography: neutral interior and Dublin river photographs. The Late Night Art sample poster is excluded from cover choices, including embedded copies in older backups. Story photos can be marked unsuitable for covers when they contain large type or graphic overlays.

## Typography provenance

The first prototype copied Tape Type’s geometry, photo crop logic and Barlow font assets. It used a 38px Regular body, a 66px static Black inside title and 158px ExtraBold covers; it was not an exact copy of every text setting. Tape Type’s inspected source sets its normal inside body to 38px Regular (400), and its title to Bold (700) at 45–52px. The new guide-specific values above supersede those initial choices. Event-guide supplies the width-pinned variable Barlow GX font; its native weight axis is 22–188, rather than CSS’s usual 100–900 scale.

## Current tuning controls

- Cover → Adjust tape background: move or resize only the headline tape, with eight handles and X/Y/width/height fields measured on the 1080 × 1350 canvas. Copy values for the design discussion. Each issue stores separate Picks and What’s New bounds; Reset returns that series to its automatic optical padding. The editing outline is a DOM overlay and is never part of the PNG/ZIP artwork.
- Cover photos accept direct JPG/PNG/WebP uploads, saved with their own crop independently of story photographs. Backups carry uploaded image data and background bounds.
- Sample text length (Shaun, 2 October): a usual story is about 540 characters in one block (his example: the BINGO BILINGO post), and it fills the page. At the house sizes that is 10 lines, exactly the room under a one-line headline with the 530px picture. Under a two-line headline with two paragraphs, the page holds about 400. The samples: 01 and 03 one block (~515 characters), 02 and 04 two paragraphs under two-line headlines (~390). Since 5 October (see below) the page holds 12 lines under a one-line headline and 10 lines plus a paragraph break under two, and 02 and 04 run to the team's two-paragraph length (~485 and ~525). Sample guides saved with older sample text pick up today’s on load, unless a story was rewritten (`OLD_SAMPLE_TEXT` / `OLD_FILL_OPENINGS` in model.ts).
- Picture height is the house’s on every page (Shaun, 2 October: a per-page height would invite longer text, and the pages should stay scannable). The page’s slider is greyed out and its edge doesn’t drag; `?unlocked` opens both, and a story’s own height stays saved for that (`pictureHeight` in model.ts). Overflowing text blocks export, so the fix is always to shorten it.
- Two Instagram handles: typed with a space (or comma, or &) between them, they stack one to a line in the footer. An import with two Instagram links becomes two handles. Three or more is flagged.
- The page number is set as Tape Type’s inside label: Barlow ExtraBold 38px on yellow tape with the label’s clean cut, lettering on the 56px margin and the tape overhanging it, seated across the foot of the picture.
- Cover safe area matches Tape Type’s covers: logo 210 wide and arrow 100 wide, both 80px in from the edges (was 194 and 120, 56px in); the What’s New line starts 80px in and its last line sits level with the arrow’s foot; the headline’s lettering keeps inside the 80px safe area and its tape clear of both marks. Inside pages keep Tape Type’s 56px page margin. (Event-guide uses 75px sides, 75 top, 60 bottom.)
- House style → Make a full-pages preview still runs a copy of any guide to the very last line (the worst case): whole sentences until the next won’t fit, then short closing lines.
- New guide → “Start from the sample pages” makes a fresh copy of the sample in any browser.

## Editing feel (2 October, round 2)

- The screen keeps your place: rebuilding it keeps the page list’s scroll, the side panel’s scroll (between pages of the same kind, and after any choice), focus, and every picture already drawn. Thumbnails never blank; they redraw a moment later, only when stale, the page being edited first. A page chosen from elsewhere (Overview, a new story, undo) is scrolled into view only when it’s wholly out of view.
- The big canvas redraws on the next frame (with a timer fallback for hidden tabs) instead of waiting for typing or dragging to pause.
- Drag on the canvas, like Tape Type: a photo follows the pointer to reframe it (cover photos and inside pictures); the cover headline moves up and down with its date strip and tape (custom tape boxes travel with it); with `?unlocked`, an inside picture’s bottom edge drags its height in 10px steps. Sliders follow. Dragging a cover photo makes it the one the panel shows. Each drag is one undo step.
- Inside typography then: 69px full-width Barlow titles with zero tracking; 38px Medium body; #4B4A4A body on light pages, #d2d2d2 on dark. (Superseded by the AD system below.)

## The AD system (2 October, rounds 4–7)

Shared with Tape Type, the event guide and Good Eye after the design-system audit.
- Palette #F0F0F0 / #101010 / #FFED1F, grey on black #C2C2C2, details #7F7C7C. Pictures 540. Body Regular 400. All upright text from the variable font (`src/barlow.ts`), italics and letters it lacks from static Barlow.
- Story titles in capitals at 168. One footer style: Bold 31px, line step 35 (Condensed SemiBold 36px, step 40, since 5 October).
- Tags (round 7): every AD tag is ExtraBold capitals on clean-cut tape. The page number already was (Tape Type’s label). The cover date strip is now a tag too: Tape Type’s eyebrow box (padding .45 / .4 / .22 em), the label’s clean cut fitted to it, the cut on the free end and the foot flat, at 166 (was a hand-drawn strip at 178). It keeps its slight turn. Saved House styles take 166 once (brand revision 7); the slider still tunes it.
- Each change reaches saved libraries once through the brand `revision`; later House style edits stick.

## The team's lengths (5 October)

The team settled on longer stories in their Canva pages (the Middle-earth quiz, ~530 characters with italics and bold; Pretty Good Improv x Failed State, ~510 in three paragraphs under a two-line title), and Shaun didn't want to ask them to cut again. Body text stays 38px at 1.3. The room came from:
- the picture, 540 → 500 (its own token, `picture-height-carousel`; Tape Type's inside pictures stay 540);
- the title, 69 → 64px (`story-title-carousel`);
- the title starts 60px under the picture (was 78) and the story 20px under the title's last line (was 30): first 70 and 10, then the title came up 10px to get more room below it (Shaun);
- the story's foot: it used to stop 146px from the bottom whatever the footer held; now it keeps 36px clear of the top of the footer's first line, so a one-line footer gives it about 26px more and a two-line footer about 13px less (`storyLayout` in render.ts, which the sample fill uses too);
- the footer itself, Condensed SemiBold 36px (was Bold 31px at normal width), as the Canva pages set it: details fit one line more often, and they read bigger. Bold at first; a weight down, as Bold read a little heavy.
Under a two-line title and a one-line footer the page now holds 10 lines and a paragraph break: both stories fit, as does the Bingo Bilingo one. Saved House styles take 64 and 500 once (brand revision 8).

## Hosting (2 October)

Prepared for GitHub Pages like the other tools: `vite.config.ts` builds for `/guide-studio/`, `asset()` resolves public files under that path, `.github/workflows/pages.yml` tests, builds and deploys every push to `main`. Checked: the built site renders every page pixel for pixel like the dev server, Backup still embeds the sample photos, and export works in Safari’s engine (WebKit), which refuses canvases that drew SVG images from `data:` URLs (the event guide’s export broke that way on 2 October). The four sample photos are byte-identical to templates already public in Tape Type’s repo.
