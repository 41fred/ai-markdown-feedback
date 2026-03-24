import * as vscode from 'vscode';
import { MarkdownPreviewEditorProvider, SidePanelPreviewProvider, clearAllAnnotationsInDocument, ensureAnnotationHeader } from './preview-provider';

let sidePanelProvider: SidePanelPreviewProvider;

const AI_INSTRUCTIONS = `# Ace Annotation Rules

When a file contains Ace reviewer annotations, treat them as intentional feedback — not formatting errors.

## Annotation syntax

| Marker | Meaning |
|--------|---------|
| \`==highlighted text==\` | Flagged for discussion or review |
| \`%%comment%%\` | Inline reviewer feedback (hidden in preview, visible in source) |
| \`~~deleted text~~\` | Suggested removal |
| \`> [!EDIT] ...\` | Specific change request |

## Rules

- Do NOT remove, normalize, or "clean up" these markers unless explicitly asked
- Use annotations as guidance for what to change when revising the document
- The file may begin with an instruction header in either format:
  - HTML comment: \`<!-- AI Markdown Feedback: ... -->\`
  - Markdown callout: \`> [!NOTE] **Annotations present.** ...\`
- That header is part of the review system — do not remove it`;

export function activate(context: vscode.ExtensionContext) {
  // Register the custom editor (preview-only mode for .md files)
  const editorProvider = new MarkdownPreviewEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MarkdownPreviewEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: true,
      }
    )
  );

  // Side-panel preview (editor + preview side-by-side)
  sidePanelProvider = new SidePanelPreviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        sidePanelProvider.openPreview(editor.document);
      } else {
        vscode.window.showWarningMessage('Ace: Open a Markdown file first.');
      }
    })
  );

  // Annotation insertion commands (for use from the text editor)
  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertHighlight', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { await wrapSelection(editor, '==', '=='); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertComment', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      const comment = await vscode.window.showInputBox({
        prompt: 'Enter your comment (visible to AI tools, hidden in preview)',
        placeHolder: 'Your feedback here...',
      });

      if (!comment) { return; }

      const position = editor.selection.active;
      await applyEditorAnnotation(editor, (edit) => {
        edit.insert(editor.document.uri, position, ` %%${comment}%% `);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertEdit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      const suggestion = await vscode.window.showInputBox({
        prompt: 'Enter your edit suggestion',
        placeHolder: 'Change X to Y',
      });

      if (!suggestion) { return; }

      const position = editor.selection.active;
      await applyEditorAnnotation(editor, (edit) => {
        edit.insert(editor.document.uri, position, `\n\n> [!EDIT] ${suggestion}\n\n`);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertDelete', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { await wrapSelection(editor, '~~', '~~'); }
    })
  );

  // Clear all annotations (works from editor tab)
  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.clearAllAnnotations', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Ace: Open a Markdown file first.');
        return;
      }
      await clearAllAnnotationsInDocument(editor.document);
    })
  );

  // Copy AI instructions to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.copyAIInstructions', async () => {
      await vscode.env.clipboard.writeText(AI_INSTRUCTIONS);
      vscode.window.showInformationMessage('Ace: AI instructions copied to clipboard. Paste into your CLAUDE.md, .cursorrules, or AI config file.');
    })
  );

  // Auto-open preview
  let lastAutoOpenedKey: string | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || editor.document.languageId !== 'markdown') { return; }

      const config = vscode.workspace.getConfiguration('acemd', editor.document.uri);
      if (!config.get<boolean>('autoOpenPreview', false)) { return; }

      const mode = config.get<'side' | 'replace'>('autoOpenMode', 'side');
      const key = `${mode}:${editor.document.uri.toString()}`;
      if (key === lastAutoOpenedKey) { return; }

      lastAutoOpenedKey = key;

      if (mode === 'replace') {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          editor.document.uri,
          MarkdownPreviewEditorProvider.viewType,
        );
        return;
      }

      await sidePanelProvider.openPreview(editor.document);
    })
  );
}

/**
 * Apply an annotation edit via WorkspaceEdit, ensuring the header is present.
 */
async function applyEditorAnnotation(
  editor: vscode.TextEditor,
  buildEdit: (edit: vscode.WorkspaceEdit) => void,
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  buildEdit(edit);
  ensureAnnotationHeader(editor.document, edit);
  await vscode.workspace.applyEdit(edit);
}

async function wrapSelection(editor: vscode.TextEditor, prefix: string, suffix: string): Promise<void> {
  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('Ace: Select text first, then apply annotation.');
    return;
  }

  const selectedText = editor.document.getText(selection);
  await applyEditorAnnotation(editor, (edit) => {
    edit.replace(editor.document.uri, selection, `${prefix}${selectedText}${suffix}`);
  });
}

export function deactivate() {
  sidePanelProvider?.dispose();
}
