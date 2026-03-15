import * as vscode from 'vscode';
import * as crypto from 'crypto';
import MarkdownIt from 'markdown-it';
import { highlightPlugin, commentPlugin, editSuggestionPlugin, deletionPlugin } from './plugins';
import { getWebviewContent } from './webview/template';

export class AcePreviewProvider {
  private static readonly viewType = 'ace.preview';
  private panel: vscode.WebviewPanel | undefined;
  private md: MarkdownIt;
  private document: vscode.TextDocument | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
    });

    // Enable strikethrough for ~~deletion~~ syntax
    this.md.enable('strikethrough');

    // Register annotation plugins
    this.md.use(highlightPlugin);
    this.md.use(commentPlugin);
    this.md.use(editSuggestionPlugin);
    this.md.use(deletionPlugin);
  }

  public async openPreview(document: vscode.TextDocument): Promise<void> {
    this.document = document;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePreview();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      AcePreviewProvider.viewType,
      `Ace: ${this.getShortName(document.uri)}`,
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'media', 'preview-light.svg'),
      dark: vscode.Uri.joinPath(this.extensionUri, 'media', 'preview-dark.svg'),
    };

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.disposeListeners();
    }, null, this.disposables);

    // Listen for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.document && e.document.uri.toString() === this.document.uri.toString()) {
          this.updatePreview();
        }
      })
    );

    // Listen for active editor changes to track which markdown file is shown
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'markdown' && this.panel) {
          this.document = editor.document;
          this.panel.title = `Ace: ${this.getShortName(editor.document.uri)}`;
          this.updatePreview();
        }
      })
    );

    this.updatePreview();
  }

  private updatePreview(): void {
    if (!this.panel || !this.document) { return; }

    const source = this.document.getText();
    const rendered = this.md.render(source);
    const config = vscode.workspace.getConfiguration('ace');
    const highlightColor = config.get<string>('highlightColor', '#fff3a0');
    const showGutter = config.get<boolean>('showAnnotationGutter', true);
    const nonce = crypto.randomBytes(16).toString('base64');

    this.panel.webview.html = getWebviewContent({
      body: rendered,
      highlightColor,
      showGutter,
      cspSource: this.panel.webview.cspSource,
      nonce,
    });
  }

  private getShortName(uri: vscode.Uri): string {
    const parts = uri.path.split('/');
    return parts[parts.length - 1];
  }

  private disposeListeners(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  public dispose(): void {
    this.panel?.dispose();
    this.disposeListeners();
  }
}
