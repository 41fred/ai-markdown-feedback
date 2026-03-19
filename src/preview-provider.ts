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

// --- Shared edit + auto-save ---

// Store active webview panels so we can send messages back (e.g., "Saved" indicator)
const activeWebviews: Set<vscode.Webview> = new Set();

async function applyWorkspaceEditAndSave(
  document: vscode.TextDocument,
  edit: vscode.WorkspaceEdit,
): Promise<boolean> {
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) { return false; }

  const config = vscode.workspace.getConfiguration('acemd', document.uri);
  const autoSave = config.get<boolean>('autoSaveAnnotations', true);
  if (autoSave) {
    await document.save();
    // Notify all active previews to show "Saved" flash
    for (const webview of activeWebviews) {
      webview.postMessage({ type: 'extension.saved' });
    }
  }

  return true;
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
 * Build all text variants to try when searching (exact, cleaned, typographer-reversed).
 */
function buildSearchVariants(selectedText: string): string[] {
  const cleaned = cleanSelectionText(selectedText);
  const reversed = reverseTypographer(selectedText);
  const cleanedReversed = reverseTypographer(cleaned);
  return [...new Set(
    [selectedText, cleaned, reversed, cleanedReversed].filter((v) => v.length > 0)
  )];
}

// Annotation markers (our syntax)
const ANNOTATION_MARKERS = ['==', '~~'];
// All inline markdown markers to strip when matching preview text to source
const ALL_INLINE_MARKERS = ['==', '~~', '**', '__', '%%'];

/**
 * Strip markdown inline markers from source text while tracking position mapping.
 * Handles: ==, ~~, **, __, %%, and single *, _, `
 */
function stripMarkdownWithMap(sourceText: string): { text: string; rawIndexMap: number[] } {
  const rawIndexMap: number[] = [];
  let text = '';

  for (let i = 0; i < sourceText.length;) {
    const two = sourceText.slice(i, i + 2);

    // Skip 2-char markers: ==, ~~, **, __, %%
    if (two === '==' || two === '~~' || two === '**' || two === '__' || two === '%%') {
      i += 2;
      continue;
    }

    const ch = sourceText[i];

    // Skip single-char emphasis markers: *, _, `
    if (ch === '*' || ch === '_' || ch === '`') {
      i += 1;
      continue;
    }

    rawIndexMap.push(i);
    text += ch;
    i += 1;
  }

  return { text, rawIndexMap };
}

/**
 * Strip a specific marker from source text while tracking position mapping.
 */
function stripMarkersWithMap(sourceText: string, marker: string): { text: string; rawIndexMap: number[] } {
  let text = '';
  const rawIndexMap: number[] = [];
  for (let i = 0; i < sourceText.length;) {
    if (sourceText.slice(i, i + marker.length) === marker) {
      i += marker.length;
      continue;
    }
    rawIndexMap.push(i);
    text += sourceText[i];
    i += 1;
  }
  return { text, rawIndexMap };
}

/**
 * Expand match boundaries to include adjacent annotation markers.
 */
function expandToAdjacentMarkers(sourceText: string, start: number, end: number, marker: string): { idx: number; matchText: string } {
  let rawStart = start;
  let rawEnd = end;
  if (rawStart >= marker.length && sourceText.slice(rawStart - marker.length, rawStart) === marker) {
    rawStart -= marker.length;
  }
  if (sourceText.slice(rawEnd, rawEnd + marker.length) === marker) {
    rawEnd += marker.length;
  }
  return { idx: rawStart, matchText: sourceText.slice(rawStart, rawEnd) };
}

/**
 * Try multiple strategies to find selectedText in sourceText.
 * Marker-aware: finds text even when it has ==, ~~ markers around/within it.
 */
function findTextInSource(selectedText: string, sourceText: string): { idx: number; matchText: string } {
  const variants = buildSearchVariants(selectedText);

  // 1. Try finding text with annotation markers already wrapped around it
  for (const marker of ANNOTATION_MARKERS) {
    for (const variant of variants) {
      const wrapped = marker + variant + marker;
      const idx = sourceText.indexOf(wrapped);
      if (idx >= 0) { return { idx, matchText: wrapped }; }
    }
  }

  // 2. Try matching against annotation-marker-stripped source (handles partial markers)
  for (const marker of ANNOTATION_MARKERS) {
    const { text, rawIndexMap } = stripMarkersWithMap(sourceText, marker);
    for (const variant of variants) {
      const idx = text.indexOf(variant);
      if (idx < 0 || idx + variant.length - 1 >= rawIndexMap.length) { continue; }
      const rawStart = rawIndexMap[idx];
      const rawEnd = rawIndexMap[idx + variant.length - 1] + 1;
      return expandToAdjacentMarkers(sourceText, rawStart, rawEnd, marker);
    }
  }

  // 3. Plain text match (no markers involved)
  for (const variant of variants) {
    const idx = sourceText.indexOf(variant);
    if (idx >= 0) { return { idx, matchText: variant }; }
  }

  // 4. Markdown-aware match: strip ALL inline markers (**, __, *, _, `, ==, ~~, %%)
  // This handles cases like selecting "How to use:" which is **How to use:** in source
  {
    const { text, rawIndexMap } = stripMarkdownWithMap(sourceText);
    for (const variant of variants) {
      const idx = text.indexOf(variant);
      if (idx < 0 || idx + variant.length - 1 >= rawIndexMap.length) { continue; }
      const rawStart = rawIndexMap[idx];
      const rawEnd = rawIndexMap[idx + variant.length - 1] + 1;
      return { idx: rawStart, matchText: sourceText.slice(rawStart, rawEnd) };
    }
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
  const fullText = document.getText();

  // Calculate header offset: the preview is rendered from header-stripped text,
  // so data-source-line numbers are relative to the headerless content.
  // We need to add back the header's line count when mapping to the real document.
  const headerOffset = getHeaderLineCount(fullText);

  // First try: search near the source line range (from data-source-line attributes)
  // This avoids matching the wrong occurrence when the same text appears multiple times
  let idx = -1;
  let matchText = selectedText;
  let searchOffset = 0;

  if (sourceRange.start.line > 0) {
    // Add header offset to convert preview line numbers to real document line numbers
    const startLine = Math.max(0, sourceRange.start.line - 1 + headerOffset); // 0-based
    const endLine = Math.min(
      (sourceRange.end.line > 0 ? sourceRange.end.line - 1 : sourceRange.start.line - 1) + headerOffset,
      document.lineCount - 1
    );

    // If we have column info (e.g., from table cells), use a tighter search window
    const hasColumns = sourceRange.start.column > 1 || sourceRange.end.column > 1;
    let rangeStart: vscode.Position;
    let rangeEnd: vscode.Position;

    if (hasColumns && startLine === endLine) {
      // Column-scoped: search within the cell boundaries (with small buffer)
      const colStart = Math.max(0, sourceRange.start.column - 1 - 2);
      const lineLen = document.lineAt(startLine).text.length;
      const colEnd = Math.min(lineLen, (sourceRange.end.column > 1 ? sourceRange.end.column - 1 : lineLen) + 2);
      rangeStart = new vscode.Position(startLine, colStart);
      rangeEnd = new vscode.Position(startLine, colEnd);
    } else {
      // Line-scoped: search the full line range with buffer
      const bufferedStart = Math.max(0, startLine - 2);
      const bufferedEnd = Math.min(document.lineCount - 1, endLine + 2);
      rangeStart = new vscode.Position(bufferedStart, 0);
      rangeEnd = document.lineAt(bufferedEnd).range.end;
    }

    const rangeText = document.getText(new vscode.Range(rangeStart, rangeEnd));

    const result = findTextInSource(selectedText, rangeText);
    if (result.idx >= 0) {
      idx = result.idx;
      matchText = result.matchText;
      searchOffset = document.offsetAt(rangeStart);
    }
  }

  // Fallback: search the full document
  if (idx < 0) {
    const result = findTextInSource(selectedText, fullText);
    idx = result.idx;
    matchText = result.matchText;
    searchOffset = 0;
  }

  if (idx < 0) {
    vscode.window.showWarningMessage(
      `Ace: Could not find selected text in source. Selection: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
    );
    return;
  }

  // Convert offset to line/col using the full document
  const absoluteIdx = searchOffset + idx;
  const beforeMatch = fullText.substring(0, absoluteIdx);
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

/**
 * Insert a comment or edit suggestion at the end of a source line (no selection needed).
 */
async function applyAnnotationAtLine(
  document: vscode.TextDocument,
  annotation: 'comment' | 'edit',
  sourceRange: SourceRange,
): Promise<void> {
  const fullText = document.getText();
  const headerOffset = getHeaderLineCount(fullText);
  const targetLine = Math.min(
    Math.max(0, sourceRange.start.line - 1 + headerOffset),
    document.lineCount - 1
  );
  const lineEnd = document.lineAt(targetLine).range.end;

  const edit = new vscode.WorkspaceEdit();

  if (annotation === 'comment') {
    const comment = await vscode.window.showInputBox({
      prompt: 'Enter your comment (visible to LLMs, hidden in preview)',
      placeHolder: 'Your feedback here...',
    });
    if (!comment) { return; }
    edit.insert(document.uri, lineEnd, ` %%${comment}%%`);
  } else {
    const suggestion = await vscode.window.showInputBox({
      prompt: 'Enter your edit suggestion',
      placeHolder: 'Change X to Y',
    });
    if (!suggestion) { return; }
    edit.insert(document.uri, lineEnd, `\n\n> [!EDIT] ${suggestion}\n`);
  }

  await ensureAnnotationHeader(document, edit);
  await applyWorkspaceEditAndSave(document, edit);
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
    case 'highlight': {
      // Strip any existing highlight markers to prevent nesting
      const cleaned = actualText.replace(/==/g, '');
      edit.replace(document.uri, matchRange, `==${cleaned}==`);
      break;
    }

    case 'delete': {
      // Strip any existing deletion markers to prevent nesting
      const cleaned = actualText.replace(/~~/g, '');
      edit.replace(document.uri, matchRange, `~~${cleaned}~~`);
      break;
    }

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

  await applyWorkspaceEditAndSave(document, edit);
}

/**
 * Count how many lines the annotation header occupies in the document.
 * Returns 0 if no header is present.
 */
function getHeaderLineCount(text: string): number {
  const match = text.match(/<!-- AI Markdown Feedback:[\s\S]*?-->\n?\n?/);
  if (!match) { return 0; }
  return match[0].split('\n').length - 1 + (match[0].endsWith('\n\n') ? 1 : 0);
}

const ANNOTATION_HEADER = `<!-- AI Markdown Feedback: This file contains reviewer annotations.
==highlights== mark text for discussion. %%comments%% are inline feedback (hidden in preview).
~~deletions~~ suggest text removal. > [!EDIT] blocks are change requests.
These markers are intentional — do not remove or "clean up" without asking the reviewer. -->`;

const HEADER_MARKER = '<!-- AI Markdown Feedback:';

// Track documents that already have a pending header insertion in the current edit cycle.
// This prevents duplicate headers when multiple annotations are applied rapidly.
const pendingHeaderInserts = new Set<string>();

/**
 * If the document doesn't already have the annotation header, add it.
 * Guards against duplicate inserts from concurrent edits.
 */
function ensureAnnotationHeader(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): void {
  const uri = document.uri.toString();
  const text = document.getText();
  const hasHeader = text.includes(HEADER_MARKER);

  if (!hasHeader && !pendingHeaderInserts.has(uri)) {
    pendingHeaderInserts.add(uri);
    edit.insert(document.uri, new vscode.Position(0, 0), ANNOTATION_HEADER + '\n\n');
    // Clear the pending flag after the edit is applied
    setTimeout(() => pendingHeaderInserts.delete(uri), 500);
  }
}

// --- Clear All Annotations ---

export function clearAllAnnotations(text: string): string {
  // Remove ALL annotation header copies (handles duplicates)
  let next = text;
  while (next.includes(HEADER_MARKER)) {
    next = next.replace(/<!-- AI Markdown Feedback:[\s\S]*?-->\r?\n?\r?\n?/, '');
  }

  // Fixed-point loop for nested markers (e.g., ==~~text~~==)
  let prev;
  do {
    prev = next;
    // Use non-greedy matching within single lines to avoid eating across table rows
    next = next.replace(/==([^=\n]*?)==/g, '$1');
    next = next.replace(/~~([^~\n]*?)~~/g, '$1');
    // Comments: strip %% markers and content, preserve surrounding structure
    next = next.replace(/ ?%%[^%]*?%% ?/g, '');
  } while (next !== prev);

  // Remove > [!EDIT] callout blocks (single or multi-line)
  next = next.replace(/^> \[!EDIT\][^\n]*(?:\n>[^\n]*)*/gm, '');

  // Clean up extra blank lines but preserve table structure
  next = next.replace(/\n{3,}/g, '\n\n');

  return next.trimEnd() + '\n';
}

export async function clearAllAnnotationsInDocument(document: vscode.TextDocument): Promise<void> {
  const text = document.getText();
  const cleaned = clearAllAnnotations(text);

  if (cleaned === text) {
    vscode.window.showInformationMessage('Ace: No annotations to clear.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Ace: Remove all annotations from this file? This can be undone with Cmd+Z.',
    { modal: false },
    'Clear All',
  );
  if (confirm !== 'Clear All') { return; }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length),
  );

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, cleaned);
  await applyWorkspaceEditAndSave(document, edit);

  vscode.window.showInformationMessage('Ace: All annotations cleared.');
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
  const config = vscode.workspace.getConfiguration('acemd');
  const highlightColor = config.get<string>('highlightColor', '#fff3a0');
  const showGutter = config.get<boolean>('showAnnotationGutter', true);
  const nonce = crypto.randomBytes(16).toString('hex');

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
  public static readonly viewType = 'acemd.previewEditor';
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
          if (message.range) {
            if (message.text) {
              await applyAnnotation(document, message.annotation, message.range, message.text);
            } else if (message.annotation === 'comment' || message.annotation === 'edit') {
              // Comment/Edit can work without selection — insert at end of the source line
              await applyAnnotationAtLine(document, message.annotation, message.range);
            }
          }
          return;
        case 'preview.clearAllAnnotations':
          await clearAllAnnotationsInDocument(document);
          return;
        case 'preview.undo':
          await vscode.commands.executeCommand('undo');
          return;
      }
    });

    activeWebviews.add(webviewPanel.webview);
    webviewPanel.onDidDispose(() => {
      activeWebviews.delete(webviewPanel.webview);
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

    // Always dispose old panel and create fresh — ensures enableScripts takes effect
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }

    this.panel = vscode.window.createWebviewPanel(
      'acemd.sidePreview',
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

    activeWebviews.add(this.panel.webview);
    this.panel.onDidDispose(() => {
      if (this.panel) { activeWebviews.delete(this.panel.webview); }
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
          this.panel.title = `Ace: ${this.getShortName(editor.document.uri)}`;
          this.updatePreview();
        }
      })
    );

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (!this.document) { return; }

        switch (message.type) {
          case 'preview.applyAnnotation':
            if (message.range) {
              if (message.text) {
                await applyAnnotation(this.document, message.annotation, message.range, message.text);
              } else if (message.annotation === 'comment' || message.annotation === 'edit') {
                await applyAnnotationAtLine(this.document, message.annotation, message.range);
              }
            }
            return;

          case 'preview.clearAllAnnotations':
            await clearAllAnnotationsInDocument(this.document);
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
