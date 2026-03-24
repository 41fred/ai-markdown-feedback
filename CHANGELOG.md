# Changelog

## 0.4.1

Fix edit annotation swallowing subsequent content.

- Fix `> [!EDIT]` blockquote not terminating when applied from preview — trailing `\n` changed to `\n\n` so markdown parser correctly closes the block
- Affects both selection and no-selection preview paths (extension.ts editor path was already correct)

## 0.4.0

Better AI enforcement and new "Copy AI Instructions" command.

- Add `acemd.headerFormat` setting: choose between `markdown` (visible callout, new default) or `html` (hidden comment). Markdown headers are much harder for LLMs to ignore.
- Add "Ace: Copy AI Instructions" command: copies LLM-agnostic annotation rules to clipboard for pasting into CLAUDE.md, .cursorrules, or other AI config files
- Fix editor-side annotations (keyboard shortcuts) not inserting the instruction header — previously only preview-originated annotations did this
- Both header formats are correctly detected when clearing annotations, rendering preview, and computing line offsets

## 0.3.1

Bug fixes for preview-to-source annotation mapping.

- Fix table cell annotations picking wrong column when same text appears in multiple cells
- Fix text spanning inline code backticks failing to highlight
- Fix double-click word selection timing (increased debounce, added dblclick handler)
- Fix multi-paragraph selections: each paragraph block now wrapped separately (inline plugins can't span paragraph breaks)
- Fix multi-line selections: normalize newlines to spaces, collapse consecutive whitespace, fix readSourcePoint end-line logic bug
- Fix already-annotated words blocking annotation of other occurrences of the same word
- Fix Clear All not removing multi-line highlight/deletion markers
- Fix mixed typographer transforms (source has em dashes + straight quotes, preview has em dashes + curly quotes)
- Add sub-element column precision via DOM Range offset computation
- Table cell search now uses exact line scope (no buffer) to prevent cross-row interference

## 0.1.0

Initial release.

- Four annotation types: highlight (`==text==`), comment (`%%note%%`), edit suggestion (`> [!EDIT]`), deletion (`~~text~~`)
- Live preview panel with annotation rendering
- Editor commands and context menu for inserting annotations
- Keyboard shortcuts for highlight and comment
- Annotation summary panel in preview
- Configurable highlight color and gutter markers
