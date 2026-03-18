import * as vscode from 'vscode';
import * as crypto from 'crypto';
import MarkdownIt from 'markdown-it';
import { highlightPlugin, commentPlugin, editSuggestionPlugin, deletionPlugin, sourceMapPlugin } from './plugins';
import { getWebviewContent } from './webview/template';

type AnnotationKind = 'highlight' | 'comment' | 'edit' | 'delete';

interface SourcePoint {
  line: number;   // 1-based
  column: number; // 1-based
}

interface SourceRange {
  start: SourcePoint;
  end: SourcePoint;
}

// --- Shared annotation logic ---

/**
 * Reverse markdown-it typographer transformations so we can match
 * the rendered preview text back to the original source text.
 */
function reverseTypographer(text: string): string {
  return text
    .replace(/\u2018/g, "'")   // ' → '
    .replace(/\u2019/g, "'")   // ' → '
    .replace(/\u201C/g, '"')   // " → "
    .replace(/\u201D/g, '"')   // " → "
    .replace(/\u2014/g, '---') // — → ---
    .replace(/\u2013/g, '--')  // – → --
    .replace(/\u2026/g, '...'); // … → ...
}

/**
 * Clean up browser selection text that includes rendering artifacts.
 * Strips emoji icons our extension adds, extra whitespace, etc.
 */
function cleanSelectionText(text: string): string {
  return text
    // Strip annotation icons our extension renders
    .replace(/[\u{1F4AC}\u{1F58D}\u{270F}\u{1F5D1}\u{1F4CC}]\uFE0F?/gu, '')
    // Strip common emoji that leak from our UI
    .replace(/[\u{2328}\u{FE0F}]/gu, '')
    // Collapse multiple spaces/tabs to single space
    .replace(/[ \t]+/g, ' ')
    // Trim whitespace
    .trim();
}

/**
 * Try multiple strategies to find selectedText in sourceText.
 * Returns the index and the matched text, or -1 if not found.
 */
function findTextInSource(selectedText: string, sourceText: string): { idx: number; matchText: string } {
  // 1. Exact match
  let idx = sourceText.indexOf(selectedText);
  if (idx >= 0) { return { idx, matchText: selectedText }; }

  // 2. Cleaned (strip rendering artifacts)
  const cleaned = cleanSelectionText(selectedText);
  if (cleaned !== selectedText && cleaned.length > 0) {
    idx = sourceText.indexOf(cleaned);
    if (idx >= 0) { return { idx, matchText: cleaned }; }
  }

  // 3. Typographer-reversed
  const reversed = reverseTypographer(selectedText);
  if (reversed !== selectedText) {
    idx = sourceText.indexOf(reversed);
    if (idx >= 0) { return { idx, matchText: reversed }; }
  }

  // 4. Cleaned + typographer-reversed
  const cleanedReversed = reverseTypographer(cleaned);
  if (cleanedReversed !== cleaned && cleanedReversed !== reversed) {
    idx = sourceText.indexOf(cleanedReversed);
    if (idx >= 0) { return { idx, matchText: cleanedReversed }; }
  }

  return { idx: -1, matchText: selectedText };
}

/**
 * Find selectedText in the source document, searching within the given line range.
 * Falls back to searching the entire document if the line range doesn't yield a match.
 * Handles typographer-transformed text by trying reversed versions.
 */
async function applyAnnotation(
  document: vscode.TextDocument,
  annotation: AnnotationKind,
  sourceRange: SourceRange,
  selectedText: string,
): Promise<void> {
  // Always search the full document — simpler and more reliable
  const fullText = document.getText();
  const { idx, matchText } = findTextInSource(selectedText, fullText);
  if (idx < 0) {
    vscode.window.showWarningMessage(
      `AI Markdown: Could not find selected text in source. Selection: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
    );
    return;
  }
  const beforeMatch = fullText.substring(0, idx);
  const matchLines = beforeMatch.split('\n');
  const matchStartLine = matchLines.length - 1;
  const matchStartCol = matchLines[matchLines.length - 1].length;

  const matchedLines = matchText.split('\n');
  const matchEndLine = matchStartLine + matchedLines.length - 1;
  const matchEndCol = matchedLines.length > 1
    ? matchedLines[matchedLines.length - 1].length
    : matchStartCol + matchText.length;

  const matchRange = new vscode.Range(
    new vscode.Position(matchStartLine, matchStartCol),
    new vscode.Position(matchEndLine, matchEndCol),
  );

  await applyEdit(document, annotation, matchRange, matchText);
}

async function applyEdit(
  document: vscode.TextDocument,
  annotation: AnnotationKind,
  matchRange: vscode.Range,
  _matchText: string,
): Promise<void> {
  // Always read the actual source text at the match range — never trust
  // the webview's selected text, which may include rendering artifacts,
  // trailing newlines, or typographer-transformed characters.
  const actualText = document.getText(matchRange);
  const edit = new vscode.WorkspaceEdit();

  switch (annotation) {
    case 'highlight':
      edit.replace(document.uri, matchRange, `==${actualText}==`);
      break;

    case 'delete':
      edit.replace(document.uri, matchRange, `~~${actualText}~~`);
      break;

    case 'comment': {
      const comment = await vscode.window.showInputBox({
        prompt: 'Enter your comment (visible to LLMs, hidden in preview)',
        placeHolder: 'Your feedback here...',
      });
      if (!comment) { return; }
      edit.insert(document.uri, matchRange.end, ` %%${comment}%% `);
      break;
    }

    case 'edit': {
      const suggestion = await vscode.window.showInputBox({
        prompt: 'Enter your edit suggestion',
        placeHolder: 'Change X to Y',
      });
      if (!suggestion) { return; }
      edit.insert(document.uri, matchRange.end, `\n\n> [!EDIT] ${suggestion}\n`);
      break;
    }
  }

  // Inject the annotation header if this is the first annotation in the file
  await ensureAnnotationHeader(document, edit);

  await vscode.workspace.applyEdit(edit);
}

const ANNOTATION_HEADER = `<!-- AI Markdown Feedback: This file contains reviewer annotations.
==highlights== mark text for discussion. %%comments%% are inline feedback (hidden in preview).
~~deletions~~ suggest text removal. > [!EDIT] blocks are change requests.
These markers are intentional — do not remove or "clean up" without asking the reviewer. -->`;

const HEADER_MARKER = '<!-- AI Markdown Feedback:';

/**
 * If the document doesn't already have the annotation header, add it.
 * If all annotations are removed, remove the header too.
 */
function ensureAnnotationHeader(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): void {
  const text = document.getText();
  const hasHeader = text.includes(HEADER_MARKER);

  if (!hasHeader) {
    // Insert at the very top of the file
    edit.insert(document.uri, new vscode.Position(0, 0), ANNOTATION_HEADER + '\n\n');
  }
}

// --- Shared markdown-it setup ---

function createMarkdownEngine(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });
  md.enable('strikethrough');
  md.use(highlightPlugin);
  md.use(commentPlugin);
  md.use(editSuggestionPlugin);
  md.use(deletionPlugin);
  md.use(sourceMapPlugin);
  return md;
}

function renderToHtml(md: MarkdownIt, document: vscode.TextDocument, webview: vscode.Webview): string {
  // Strip the annotation header before rendering — it's for LLMs, not the preview
  const source = document.getText().replace(/<!-- AI Markdown Feedback:[\s\S]*?-->\n?\n?/, '');
  const rendered = md.render(source);
  const config = vscode.workspace.getConfiguration('aimd');
  const highlightColor = config.get<string>('highlightColor', '#fff3a0');
  const showGutter = config.get<boolean>('showAnnotationGutter', true);
  const nonce = crypto.randomBytes(32).toString('hex');

  return getWebviewContent({
    body: rendered,
    highlightColor,
    showGutter,
    cspSource: webview.cspSource,
    nonce,
  });
}

// --- CustomTextEditorProvider (preview-only mode) ---

export class MarkdownPreviewEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'aimd.previewEditor';
  private md: MarkdownIt;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.md = createMarkdownEngine();
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewPanel.iconPath = {
      light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview-light.svg'),
      dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview-dark.svg'),
    };

    const updateWebview = () => {
      webviewPanel.webview.html = renderToHtml(this.md, document, webviewPanel.webview);
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'preview.applyAnnotation':
          if (message.range && message.text) {
            await applyAnnotation(document, message.annotation, message.range, message.text);
          }
          return;
        case 'preview.undo':
          await vscode.commands.executeCommand('undo');
          return;
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      msgSub.dispose();
    });

    updateWebview();
  }
}

// --- Side-panel preview (editor + preview side-by-side) ---

export class SidePanelPreviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private md: MarkdownIt;
  private document: vscode.TextDocument | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.md = createMarkdownEngine();
  }

  public async openPreview(document: vscode.TextDocument): Promise<void> {
    this.document = document;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.updatePreview();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aimd.sidePreview',
      `AI Markdown: ${this.getShortName(document.uri)}`,
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

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.document && e.document.uri.toString() === this.document.uri.toString()) {
          this.updatePreview();
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'markdown' && this.panel) {
          this.document = editor.document;
          this.panel.title = `AI Markdown: ${this.getShortName(editor.document.uri)}`;
          this.updatePreview();
        }
      })
    );

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (!this.document) { return; }

        switch (message.type) {
          case 'preview.applyAnnotation':
            if (message.range && message.text) {
              await applyAnnotation(this.document, message.annotation, message.range, message.text);
            }
            return;

          case 'preview.undo':
            await vscode.window.showTextDocument(this.document, {
              viewColumn: vscode.ViewColumn.One,
              preserveFocus: false,
            });
            await vscode.commands.executeCommand('undo');
            if (this.panel) {
              this.panel.reveal(vscode.ViewColumn.Beside, true);
            }
            return;
        }
      },
      null,
      this.disposables
    );

    this.updatePreview();
  }

  private updatePreview(): void {
    if (!this.panel || !this.document) { return; }
    this.panel.webview.html = renderToHtml(this.md, this.document, this.panel.webview);
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
