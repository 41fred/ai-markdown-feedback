export interface WebviewOptions {
  body: string;
  highlightColor: string;
  showGutter: boolean;
  cspSource: string;
}

export function getWebviewContent(options: WebviewOptions): string {
  const { body, highlightColor, showGutter, cspSource } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${cspSource} 'unsafe-inline';
    script-src 'nonce-ace-script';
    img-src ${cspSource} https: data:;
    font-src ${cspSource};
  ">
  <style>
    :root {
      --highlight-color: ${highlightColor};
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --border: var(--vscode-panel-border, #333);
      --comment-bg: var(--vscode-editorInfo-background, #063b49);
      --edit-bg: var(--vscode-editorWarning-background, #352a05);
      --delete-bg: var(--vscode-editorError-background, #3b0e0e);
      --gutter-width: ${showGutter ? '4px' : '0px'};
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-markdown-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif);
      font-size: var(--vscode-markdown-font-size, 14px);
      line-height: 1.6;
      color: var(--fg);
      background: var(--bg);
      padding: 16px 24px;
      margin: 0;
      max-width: 960px;
    }

    /* --- Standard Markdown Styles --- */
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--vscode-editor-foreground, #d4d4d4);
    }
    h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }

    p { margin: 0 0 16px 0; }

    a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
      font-size: 0.9em;
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 2px 6px;
      border-radius: 3px;
    }

    pre {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { padding: 0; background: none; }

    blockquote {
      margin: 0 0 16px 0;
      padding: 8px 16px;
      border-left: 4px solid var(--border);
      color: var(--vscode-descriptionForeground, #999);
    }

    ul, ol { padding-left: 2em; margin: 0 0 16px 0; }
    li { margin: 4px 0; }

    table {
      border-collapse: collapse;
      margin: 0 0 16px 0;
      width: 100%;
    }
    th, td {
      padding: 8px 12px;
      border: 1px solid var(--border);
    }
    th { font-weight: 600; }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }

    img { max-width: 100%; }

    /* --- Annotation Styles --- */

    /* ==highlight== */
    mark.ace-highlight {
      background-color: var(--highlight-color);
      color: #000;
      padding: 1px 4px;
      border-radius: 2px;
      border-left: var(--gutter-width) solid #f9a825;
      cursor: pointer;
      position: relative;
    }
    mark.ace-highlight:hover::after {
      content: '📌 Highlighted for discussion';
      position: absolute;
      bottom: 100%;
      left: 0;
      background: #333;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      white-space: nowrap;
      z-index: 10;
    }

    /* %%comment%% */
    .ace-comment {
      display: inline;
      position: relative;
      cursor: pointer;
    }
    .ace-comment-icon {
      display: inline;
      font-size: 0.85em;
      vertical-align: super;
      opacity: 0.7;
    }
    .ace-comment-text {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      background: var(--comment-bg);
      border: 1px solid var(--vscode-editorInfo-foreground, #3794ff);
      color: var(--fg);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      max-width: 300px;
      z-index: 100;
      white-space: pre-wrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .ace-comment:hover .ace-comment-text {
      display: block;
    }

    /* > [!EDIT] callout */
    blockquote.ace-edit-suggestion {
      background: var(--edit-bg);
      border-left: 4px solid #f9a825;
      border-radius: 0 6px 6px 0;
      padding: 12px 16px;
      margin: 12px 0;
      color: var(--fg);
    }
    .ace-edit-label {
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      color: #f9a825;
    }

    /* ~~deletion~~ */
    s.ace-deletion {
      color: #f44336;
      text-decoration: line-through;
      text-decoration-color: #f44336;
      background: var(--delete-bg);
      padding: 1px 4px;
      border-radius: 2px;
      opacity: 0.8;
      position: relative;
    }
    .ace-deletion-icon {
      font-size: 0.75em;
      vertical-align: super;
      margin-left: 2px;
      opacity: 0.7;
    }

    /* --- Annotation Toolbar --- */
    #ace-toolbar {
      position: fixed;
      top: 8px;
      right: 16px;
      display: flex;
      gap: 4px;
      z-index: 1000;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      opacity: 0.6;
      transition: opacity 0.2s;
    }
    #ace-toolbar:hover { opacity: 1; }

    .ace-toolbar-btn {
      background: none;
      border: 1px solid transparent;
      color: var(--fg);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .ace-toolbar-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, #333);
      border-color: var(--border);
    }
    .ace-toolbar-btn span.label {
      font-size: 11px;
    }

    /* --- Annotation Summary Panel --- */
    #ace-summary {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid var(--border);
    }
    #ace-summary h3 {
      margin-top: 0;
      color: #f9a825;
    }
    .ace-summary-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      border-radius: 4px;
      font-size: 13px;
    }
    .ace-summary-type {
      font-weight: 600;
      min-width: 80px;
      flex-shrink: 0;
    }
    .ace-summary-type.highlight { color: #f9a825; }
    .ace-summary-type.comment { color: #3794ff; }
    .ace-summary-type.edit { color: #f9a825; }
    .ace-summary-type.delete { color: #f44336; }
  </style>
</head>
<body>
  <div id="ace-toolbar">
    <button class="ace-toolbar-btn" id="btn-highlight" title="Highlight selected text (==text==)">
      🖍️ <span class="label">Highlight</span>
    </button>
    <button class="ace-toolbar-btn" id="btn-comment" title="Add comment (%%note%%)">
      💬 <span class="label">Comment</span>
    </button>
    <button class="ace-toolbar-btn" id="btn-edit" title="Suggest edit (> [!EDIT])">
      ✏️ <span class="label">Edit</span>
    </button>
    <button class="ace-toolbar-btn" id="btn-delete" title="Suggest deletion (~~text~~)">
      🗑️ <span class="label">Delete</span>
    </button>
  </div>

  <div id="ace-content">
    ${body}
  </div>

  <div id="ace-summary"></div>

  <script nonce="ace-script">
    (function() {
      const vscode = acquireVsCodeApi();

      // Toolbar button handlers
      document.getElementById('btn-highlight').addEventListener('click', () => {
        vscode.postMessage({ type: 'insertHighlight', text: getSelectedText() });
      });
      document.getElementById('btn-comment').addEventListener('click', () => {
        vscode.postMessage({ type: 'insertComment' });
      });
      document.getElementById('btn-edit').addEventListener('click', () => {
        vscode.postMessage({ type: 'insertEdit' });
      });
      document.getElementById('btn-delete').addEventListener('click', () => {
        vscode.postMessage({ type: 'insertDelete', text: getSelectedText() });
      });

      function getSelectedText() {
        const selection = window.getSelection();
        return selection ? selection.toString() : '';
      }

      // Build annotation summary
      buildSummary();

      function buildSummary() {
        const summaryEl = document.getElementById('ace-summary');
        const annotations = [];

        // Gather highlights
        document.querySelectorAll('.ace-highlight').forEach(el => {
          annotations.push({ type: 'highlight', text: el.textContent });
        });

        // Gather comments
        document.querySelectorAll('.ace-comment').forEach(el => {
          annotations.push({ type: 'comment', text: el.getAttribute('data-comment') });
        });

        // Gather edit suggestions
        document.querySelectorAll('.ace-edit-suggestion').forEach(el => {
          annotations.push({ type: 'edit', text: el.textContent.replace('Edit Suggestion', '').trim() });
        });

        // Gather deletions
        document.querySelectorAll('.ace-deletion').forEach(el => {
          annotations.push({ type: 'delete', text: el.textContent });
        });

        if (annotations.length === 0) {
          summaryEl.style.display = 'none';
          return;
        }

        let html = '<h3>Annotation Summary (' + annotations.length + ')</h3>';
        annotations.forEach((a, i) => {
          const icons = { highlight: '🖍️', comment: '💬', edit: '✏️', delete: '🗑️' };
          const labels = { highlight: 'Highlight', comment: 'Comment', edit: 'Edit', delete: 'Delete' };
          html += '<div class="ace-summary-item">' +
            '<span class="ace-summary-type ' + a.type + '">' + icons[a.type] + ' ' + labels[a.type] + '</span>' +
            '<span>' + escapeHtml(a.text || '') + '</span>' +
            '</div>';
        });

        summaryEl.innerHTML = html;
        summaryEl.style.display = 'block';
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    })();
  </script>
</body>
</html>`;
}
