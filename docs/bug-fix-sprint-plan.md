# Ace Markdown Feedback: Bug-Fix Sprint Plan

**Created:** 2026-04-08
**Status:** PLANNED (not started)
**Source:** Codex planning session (2 rounds) + mark-sharp competitive analysis

## Context

Most open bugs trace to one architectural bottleneck: **text-to-source mapping** — browser selections in the rendered preview don't correctly map back to source text positions. The planned full sourcemap rewrite (Issue #8 Phase 1) is deferred in favor of targeted incremental fixes.

### Key Finding: Dead Sourcemap Code

`data-source-pos` attributes set on markdown-it `text` tokens in `src/plugins/source-map.ts:136-141` are **dead code**. Plain `text` tokens don't emit HTML elements in markdown-it's default renderer — the attributes are set on the token object but silently dropped during rendering because there's no `<span>` or other element to attach them to.

Making this work would require custom renderer rules that wrap text in `<span data-source-pos="...">` elements, which increases DOM size 3-5x and can fragment browser selections. This is the right long-term direction but not the sprint's opening move.

### Competitive Context

mark-sharp (https://github.com/jonathanyeung/mark-sharp) solves position mapping by using Lexical (Meta's rich text framework) which maintains a full document model with bidirectional sync. Their approach is architecturally different (WYSIWYG editor vs annotation layer) and not applicable to Ace's markdown-it architecture. Full evaluation at: `Alcanah AI/Workspace Development/evaluations/mark-sharp-wysiwyg-markdown-editor.md`

## Sprint Sequence

| # | Issue | Fix | Complexity | Risk | Files |
|---|-------|-----|-----------|------|-------|
| 1 | **#14/#5: Dual-editor** | Consolidate auto-open into single 3-way setting; fix standalone preview save | S-M | Low | `extension.ts`, `package.json` |
| 2 | **#13: Double-click selection** | Strip invisible Unicode in `cleanSelectionText`; tune DBLCLICK_DELAY only if needed | S | Low | `preview-provider.ts`, `webview/template.ts` |
| 3 | **#12: Backtick boundaries** | Fix `stripMarkdownWithMap` to handle code_inline boundaries properly | M | Med | `preview-provider.ts` |
| 4 | **#11: Table cell wrong column** | Use cell-bounded offsets from source-map instead of fuzzy hint tolerance | M | Med | `preview-provider.ts`, `source-map.ts` |
| 5 | **#6: Cross-block highlight** | Block-aware normalization in the search slice (strip heading markers, collapse blank lines, maintain rawIndexMap) | M-L | Med-High | `preview-provider.ts` |
| 6 | **Save flash bug** (new) | Key `activeWebviews` by document URI, not global Set | S | Low | `preview-provider.ts` |

## Detailed Approach Per Issue

### 1. Dual-editor (#14/#5)

**Problem:** VS Code opens both source code AND Ace preview for every .md file. Can't close the source editor and still annotate.

**Root cause:** `onDidChangeActiveTextEditor` (extension.ts:135) fires after a text editor already exists. `vscode.openWith` reopens the file in Ace but can't close the original. The custom editor uses `priority: "option"` so it's never the default opener.

**Fix:**
- Keep `priority: "option"` — don't force Ace as default for all users
- Replace `autoOpenPreview` (boolean) + `autoOpenMode` (side/replace) with a single setting: `acemd.openMode: "off" | "side" | "preview"`
  - `off` (default): source editor only, Ace via "Open With..." or command
  - `side`: auto-open side panel alongside source editor
  - `preview`: auto-open Ace custom editor (replaces source tab)
- Remove the `replace` branch in extension.ts:147-154 that races with `onDidChangeActiveTextEditor`
- `CustomTextEditorProvider` keeps the backing `TextDocument` alive regardless of visible editors. `applyWorkspaceEditAndSave` (preview-provider.ts:24-42) should work without a source tab — verify this.

**Why NOT change priority to "default":** Forces ALL users into annotation-first UX. Users who primarily edit markdown lose one-click source access. The 3-way setting gives users control.

**Why NOT rewrite to CustomDocument API:** Too much rewrite for save/backup/revert/undo handling. CustomTextEditorProvider already works.

**Acceptance:**
- Opening .md defaults to source editor
- Setting `"preview"` opens Ace custom editor
- "Open With..." works in all modes
- Annotations save without a source tab open

### 2. Selection hygiene (#13)

**Problem:** Double-click word selection sometimes doesn't highlight. DBLCLICK_DELAY is 80ms.

**Root cause:** Browser selection may include invisible characters — zero-width spaces, NBSP, BOM, soft hyphens, bidi marks — that prevent text matching in `findTextInSource`.

**Fix:** Add to `cleanSelectionText` (preview-provider.ts:77-88):
- Strip `\u00A0` (NBSP)
- Strip `\u200B` (zero-width space)
- Strip `\u200C`/`\u200D` (ZWJ)
- Strip `\uFEFF` (BOM)
- Strip `\u00AD` (soft hyphen)
- Strip `\u200E`/`\u200F` (bidi marks)

Only adjust DBLCLICK_DELAY if invisible char stripping doesn't fully fix the issue.

**Acceptance:**
- Double-click + H highlights the word consistently
- No "Could not find selected text" from invisible chars

### 3. Backtick boundaries (#12)

**Problem:** Selecting text spanning inline code backtick boundaries fails. Preview shows "some code here" but source has "some \`code\` here".

**Root cause:** `stripMarkdownWithMap` (preview-provider.ts:117-153) skips single backticks unconditionally (line 133). This breaks position mapping when the selection spans from normal text into inline code.

**Fix:** Track backtick boundaries in the raw index map so the match can reconstruct the full code span including delimiters. Integrate with `expandToBalancedBackticks` (preview-provider.ts:178-209) which already handles some cases.

**Acceptance:**
- Selecting "some \`code\` here" produces correct annotation spanning the full text including backticks
- Selecting across plain text + inline code matches the correct source substring

### 4. Table cell disambiguation (#11)

**Problem:** Same text in multiple table cells on one row — highlighting picks the wrong column.

**Root cause:** Current hint tolerance (`variant.length + 20` at preview-provider.ts:277) is arbitrary. The hintOffset approach (preview-provider.ts:365-374) gives approximate position but the tolerance window is fragile.

**Fix:**
- Use actual cell boundaries from `data-source-pos` on `td_open`/`th_open` tokens (source-map.ts:45-78)
- When the webview sends a selection from a table cell, pass the cell's `data-source-pos` column range as strict bounds, not just a hint offset
- Search ONLY within those column bounds when matching within a table row

**Acceptance:**
- In `| foo | foo | bar |`, highlighting second "foo" annotates column 2, not column 1
- Repeated text on neighboring rows doesn't steal the match

### 5. Cross-block highlight (#6)

**Problem:** Selections spanning different markdown blocks (heading into paragraph) produce incorrect annotations. Source has `# Heading\n\nParagraph text` but selection text is `Heading Paragraph text`.

**Root cause:** `findTextInSource` (preview-provider.ts:256-318) searches a ±2 line range using `indexOf`. When selection spans blocks, the source has markdown syntax (#, **, blank lines) that the preview strips. The fuzzy line range is insufficient.

**Fix:** Build a block-aware normalized search slice from the exact source lines covered by the selection:
1. Take `sourceRange.start.line` to `sourceRange.end.line` from the webview, plus at most 1-line guard on each side
2. Normalize the slice:
   - Strip heading markers (`# `, `## `, etc.)
   - Collapse blank lines/newlines to single spaces
   - Strip inline markers (same as `stripMarkdownWithMap`)
   - Maintain rawIndexMap back to original positions
3. Search the normalized slice for the cleaned selection text
4. Map match back to raw offsets and apply annotation

This replaces the current `±2 line buffer` approach for cross-block selections.

**Why NOT use DOM-side source spans (option c):** More invasive, couples matching to DOM structure. Server-side normalization is sufficient.

**Acceptance:**
- Selecting from heading into paragraph produces correct `==` annotation in source
- Works across blank-line separators
- Repeated heading/paragraph text elsewhere doesn't steal the match (search constrained to selection window)

### 6. Save flash bug (new, discovered during planning)

**Problem:** `activeWebviews` (preview-provider.ts:22) is a global `Set<vscode.Webview>`. Save flash broadcasts to ALL open Ace previews regardless of which file was saved.

**Fix:** Change `activeWebviews` from `Set<vscode.Webview>` to `Map<string, Set<vscode.Webview>>` keyed by `document.uri.toString()`. Only flash previews for the saved document.

**Acceptance:**
- Save on file A flashes Ace previews for file A only
- Ace previews for file B don't flash

## Trade-offs & Decisions

| Decision | Rationale |
|----------|-----------|
| Keep priority "option" | Preserves source-editing as default; annotation-first users opt in via setting |
| Defer full sourcemap wrapping | Text span wrapping increases DOM 3-5x, can fragment selections; block-aware normalization addresses the main failure |
| Block-aware normalization over DOM-side mapping | Less invasive; keeps matching logic server-side; doesn't couple to DOM structure |
| Fix incremental before architectural | Each bug ships independently; architectural refactor carries regression risk |
| Suggest mode postponed | Prerequisite sourcemap infrastructure not ready; focus on fixing what exists |

## Open Questions

1. **Setting names** — `acemd.openMode: "off" | "side" | "preview"` — good terminology?
2. **Sprint split** — all 6 in one sprint, or break into two (1-3 first, then 4-6)?
3. **Dead sourcemap code** (source-map.ts:136-141 text token attrs) — remove to reduce confusion, or leave as scaffolding for future wrapping?

## Related

- mark-sharp evaluation: `Alcanah AI/Workspace Development/evaluations/mark-sharp-wysiwyg-markdown-editor.md`
- v1.0 vision (suggest mode): GitHub Issue #8
- Prototype notes: a previous suggest-mode prototype was attempted but was "very broken and a way different tool" — postponed
