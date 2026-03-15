# Ace Markdown Feedback

Annotate Markdown files with structured feedback that LLMs can read and act on.

## The Problem

LLM coding agents generate Markdown artifacts — plans, docs, code explanations. When you want to give feedback, you're stuck writing free-form text or making inline edits that lose context. There's no structured way to say "discuss this", "change that", or "remove this section" in a format the LLM can parse.

## How It Works

Ace adds four annotation types to your Markdown files, all stored as plain-text syntax — no sidecar files, no proprietary format:

| Syntax | Purpose | Preview |
|--------|---------|---------|
| `==highlight this==` | Flag text for discussion | Yellow highlight |
| `%%your note here%%` | Leave a comment for the LLM | Hidden in preview; icon on hover |
| `> [!EDIT] Change X to Y` | Specific edit request | Styled callout block |
| `~~remove this~~` | Suggest deletion | Red strikethrough |

Any LLM can parse these annotations directly from the `.md` source.

## Install

Search "Ace Markdown Feedback" in the VS Code Extensions sidebar, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=AlfredNaayem.ace-markdown-feedback).

## Quick Start

1. Open any `.md` file in VS Code
2. Press `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` to open the Ace preview
3. Select text and annotate:
   - `Cmd+Shift+H` / `Ctrl+Shift+H` — Highlight selection
   - `Cmd+Shift+M` / `Ctrl+Shift+M` — Add comment
   - Right-click for all annotation options
4. Hand the annotated `.md` file back to your LLM

## Workflow

```
LLM generates plan.md
    -> You open in VS Code with Ace preview
    -> Highlight sections, add comments, suggest edits
    -> Annotations are written as plain Markdown syntax
    -> Feed the annotated file back to the LLM
    -> LLM reads the annotations and acts on your feedback
```

## Who It's For

Anyone using LLM coding agents (Claude Code, Codex CLI, Cursor, Copilot) who reviews Markdown output and wants a faster, more structured way to give feedback than rewriting or commenting in chat.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ace.highlightColor` | `#fff3a0` | Background color for highlighted text |
| `ace.showAnnotationGutter` | `true` | Show annotation markers in the gutter |

## Current Scope (v0.1)

This is an early release. The extension handles annotation preview for the four syntax types above. It's not a general Markdown renderer — it's focused on the feedback workflow. Built on [markdown-it](https://github.com/markdown-it/markdown-it).

See [`examples/sample-feedback.md`](examples/sample-feedback.md) for a demo of all annotation types.

## License

[MIT](LICENSE)
