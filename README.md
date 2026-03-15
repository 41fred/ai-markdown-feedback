# Ace Markdown Feedback

A VS Code extension for annotating Markdown files with structured feedback for LLMs. Review AI-generated code and docs, mark up what needs changing, and hand the annotated file back to Claude, Codex, or any LLM — all annotations are stored as plain Markdown syntax that models can read and act on.

## Why

LLM coding agents (Claude Code, Codex, etc.) generate Markdown artifacts — plans, docs, code explanations. When you want to give feedback, you're stuck writing free-form text or making inline edits that lose context. Ace gives you a structured annotation toolkit that produces machine-readable Markdown, so the LLM knows exactly what to fix.

## Annotation Syntax

| Syntax | Purpose | Preview |
|--------|---------|---------|
| `==highlight this==` | Flag text for discussion | Yellow highlight |
| `%%your note here%%` | Leave a comment for the LLM | Hidden in preview; icon on hover |
| `> [!EDIT] Change X to Y` | Specific edit request | Styled callout block |
| `~~remove this~~` | Suggest deletion | Red strikethrough |

All annotations live in the `.md` source as plain text — no sidecar files, no proprietary format. Any LLM can parse them directly.

## Quick Start

1. Open any `.md` file in VS Code
2. Press `Ctrl+Shift+V` (`Cmd+Shift+V` on Mac) to open the Ace preview
3. Select text and annotate:
   - `Ctrl+Shift+H` — Highlight selection
   - `Ctrl+Shift+M` — Add comment
4. Right-click selected text for more annotation options
5. Hand the annotated `.md` file back to your LLM

## Workflow

```
LLM generates plan.md
    → You open in VS Code with Ace preview
    → Highlight sections, add comments, suggest edits
    → Annotations are written as plain Markdown syntax
    → Feed the annotated file back to the LLM
    → LLM reads the annotations and acts on your feedback
```

## Architecture

```
src/
├── extension.ts              # Extension entry, command registration
├── preview-provider.ts       # Webview panel, markdown rendering
├── plugins/
│   ├── highlight.ts          # ==highlight== inline plugin
│   ├── comment.ts            # %%comment%% inline plugin
│   ├── edit-suggestion.ts    # > [!EDIT] block plugin
│   ├── deletion.ts           # ~~deletion~~ enhancement plugin
│   └── index.ts              # Plugin barrel export
└── webview/
    └── template.ts           # HTML/CSS/JS for preview webview
```

Built on [markdown-it](https://github.com/markdown-it/markdown-it).

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

See [`examples/sample-feedback.md`](examples/sample-feedback.md) for a demo of all annotation types.

## License

[MIT](LICENSE)
