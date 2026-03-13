# Ace Feedback Reader

A lightweight VS Code extension for annotating AI-generated Markdown files. Provides a read-focused preview with built-in annotation capabilities — highlight text, leave comments, suggest edits, and mark deletions — all stored as plain Markdown syntax that Claude can read.

## Annotation Syntax

| Syntax | Purpose | Preview Rendering |
|--------|---------|-------------------|
| `==highlight this==` | Flag text for discussion | Yellow highlighted text |
| `%%your note here%%` | Leave a comment for Claude | Hidden; shows 💬 icon on hover |
| `> [!EDIT] Change X to Y` | Specific edit request | Styled callout block |
| `~~remove this~~` | Suggest deletion | Red strikethrough with 🗑️ icon |

## Usage

1. Open any `.md` file in VS Code
2. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac) to open the Ace preview
3. Use the toolbar buttons in the preview or the keyboard shortcuts:
   - `Ctrl+Shift+H` — Highlight selected text
   - `Ctrl+Shift+M` — Add comment at cursor
4. Right-click selected text for annotation options in the context menu

## How It Works

**For the human reviewer:**
- Open the Markdown preview alongside the source
- Select text and apply annotations via toolbar, shortcuts, or context menu
- Annotations render visually in the preview (highlights, callouts, icons)
- An annotation summary appears at the bottom of the preview

**For the AI (Claude):**
- All annotations are stored as plain Markdown syntax in the source file
- `==highlighted==` text indicates areas needing attention
- `%%comments%%` contain direct feedback (hidden in preview, visible in source)
- `> [!EDIT]` callouts contain specific change requests
- `~~strikethrough~~` marks text suggested for removal

## Architecture

```
src/
├── extension.ts              # Extension entry point, command registration
├── preview-provider.ts       # Webview panel management, markdown rendering
├── plugins/
│   ├── highlight.ts          # ==highlight== inline plugin
│   ├── comment.ts            # %%comment%% inline plugin
│   ├── edit-suggestion.ts    # > [!EDIT] block plugin
│   ├── deletion.ts           # ~~deletion~~ enhancement plugin
│   └── index.ts              # Plugin barrel export
└── webview/
    └── template.ts           # HTML/CSS/JS template for preview webview
```

Built on **markdown-it** (lightweight, extensible) instead of heavier engines like Crossnote/Mume.

## Development

```bash
npm install
npm run compile    # or: npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host and test.
