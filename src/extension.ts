import * as vscode from 'vscode';
import { AcePreviewProvider } from './preview-provider';

let previewProvider: AcePreviewProvider;

export function activate(context: vscode.ExtensionContext) {
  previewProvider = new AcePreviewProvider(context.extensionUri);

  // Open preview command
  context.subscriptions.push(
    vscode.commands.registerCommand('ace.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        previewProvider.openPreview(editor.document);
      } else {
        vscode.window.showWarningMessage('Ace: Open a Markdown file first.');
      }
    })
  );

  // Annotation insertion commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ace.insertHighlight', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { wrapSelection(editor, '==', '=='); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ace.insertComment', async () => {
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
    vscode.commands.registerCommand('ace.insertEdit', async () => {
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
    vscode.commands.registerCommand('ace.insertDelete', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) { wrapSelection(editor, '~~', '~~'); }
    })
  );

  // Auto-open preview for markdown files if desired
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      // Could auto-open preview here if config enables it
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
  previewProvider?.dispose();
}
