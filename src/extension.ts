import * as vscode from 'vscode';
import { MarkdownPreviewEditorProvider, SidePanelPreviewProvider, clearAllAnnotationsInDocument } from './preview-provider';

let sidePanelProvider: SidePanelPreviewProvider;

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
    vscode.commands.registerCommand('acemd.insertHighlight', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { wrapSelection(editor, '==', '=='); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertComment', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      const comment = await vscode.window.showInputBox({
        prompt: 'Enter your comment (visible to Claude, hidden in preview)',
        placeHolder: 'Your feedback here...',
      });

      if (comment) {
        const position = editor.selection.active;
        editor.edit((editBuilder) => {
          editBuilder.insert(position, ` %%${comment}%% `);
        });
      }
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

      if (suggestion) {
        const position = editor.selection.active;
        editor.edit((editBuilder) => {
          editBuilder.insert(position, `\n\n> [!EDIT] ${suggestion}\n\n`);
        });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acemd.insertDelete', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { wrapSelection(editor, '~~', '~~'); }
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

function wrapSelection(editor: vscode.TextEditor, prefix: string, suffix: string): void {
  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('Ace: Select text first, then apply annotation.');
    return;
  }

  editor.edit((editBuilder) => {
    const selectedText = editor.document.getText(selection);
    editBuilder.replace(selection, `${prefix}${selectedText}${suffix}`);
  });
}

export function deactivate() {
  sidePanelProvider?.dispose();
}
