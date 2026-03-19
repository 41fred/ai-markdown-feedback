export interface WebviewOptions {
  body: string;
  highlightColor: string;
  showGutter: boolean;
  cspSource: string;
  nonce: string;
}

export function getWebviewContent(options: WebviewOptions): string {
  const { body, highlightColor, showGutter, cspSource, nonce } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
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

    /* --- Floating Toolbar --- */
    #ace-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      gap: 2px;
      padding: 6px 8px;
      margin: -16px -24px 16px -24px;
      background: var(--vscode-titleBar-activeBackground, #2d2d2d);
      border-bottom: 1px solid var(--border);
    }
    .ace-toolbar-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--fg);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      position: relative;
    }
    .ace-toolbar-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
      border-color: var(--border);
    }
    .ace-toolbar-btn:active {
      background: var(--vscode-toolbar-activeBackground, rgba(255,255,255,0.15));
    }
    .ace-toolbar-btn[data-needs-selection="true"].disabled {
      opacity: 0.4;
      cursor: default;
      pointer-events: none;
    }
    .ace-toolbar-btn .ace-btn-icon {
      font-size: 14px;
      line-height: 1;
    }
    .ace-toolbar-btn .ace-btn-shortcut {
      font-size: 10px;
      opacity: 0.5;
      margin-left: 2px;
    }
    .ace-toolbar-sep {
      width: 1px;
      background: var(--border);
      margin: 2px 6px;
      align-self: stretch;
    }

    /* --- Saved indicator --- */
    #ace-saved {
      display: none;
      align-items: center;
      margin-left: auto;
      font-size: 11px;
      color: #4caf50;
      opacity: 0;
      transition: opacity 0.3s;
    }
    #ace-saved.show {
      display: flex;
      opacity: 1;
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
    <button class="ace-toolbar-btn" data-command="insertHighlight" data-needs-selection="true" data-key="h" title="Highlight selected text — press H in preview">
      <span class="ace-btn-icon">&#x1F58D;&#xFE0F;</span>
      <span>Highlight</span>
      <span class="ace-btn-shortcut">H</span>
    </button>
    <button class="ace-toolbar-btn" data-command="insertComment" data-needs-selection="false" data-key="c" title="Add comment at cursor — press C in preview">
      <span class="ace-btn-icon">&#x1F4AC;</span>
      <span>Comment</span>
      <span class="ace-btn-shortcut">C</span>
    </button>
    <button class="ace-toolbar-btn" data-command="insertEdit" data-needs-selection="false" data-key="e" title="Suggest an edit — press E in preview">
      <span class="ace-btn-icon">&#x270F;&#xFE0F;</span>
      <span>Edit</span>
      <span class="ace-btn-shortcut">E</span>
    </button>
    <div class="ace-toolbar-sep"></div>
    <button class="ace-toolbar-btn" data-command="insertDelete" data-needs-selection="true" data-key="d" title="Mark for deletion — press D in preview">
      <span class="ace-btn-icon">&#x1F5D1;&#xFE0F;</span>
      <span>Delete</span>
      <span class="ace-btn-shortcut">D</span>
    </button>
    <div class="ace-toolbar-sep"></div>
    <button class="ace-toolbar-btn" data-command="clearAllAnnotations" data-needs-selection="false" title="Clear all annotations in this file">
      <span class="ace-btn-icon">&#x2716;</span>
      <span>Clear All</span>
    </button>
    <span id="ace-saved">Saved</span>
  </div>

  <div id="ace-content">
    ${body}
  </div>

  <div id="ace-summary"></div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let previewRange = null;
      let previewText = '';

      // --- Selection mapping: preview DOM → source line ---
      // We find the containing block element's source line, then send
      // the selected text for the extension to find in the source.

      document.addEventListener('selectionchange', syncPreviewSelection);

      function syncPreviewSelection() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          previewRange = null;
          previewText = '';
          updateToolbarState(false);
          return;
        }

        var domRange = sel.getRangeAt(0);
        var startEl = closestMappedElement(domRange.startContainer);
        var endEl = closestMappedElement(domRange.endContainer);

        if (!startEl) {
          // Fallback: try #ace-content as container
          startEl = document.getElementById('ace-content');
          endEl = startEl;
        }

        previewRange = {
          start: readSourcePoint(startEl, false),
          end: readSourcePoint(endEl, true)
        };
        // Trim trailing/leading whitespace — browser selections
        // often grab extra whitespace at block boundaries, table cells, etc.
        previewText = sel.toString().trim();
        updateToolbarState(previewText.length > 0);
      }

      function readSourcePoint(el, isEnd) {
        if (!el) return { line: 1, column: 1 };
        var line = Number(el.getAttribute('data-source-line')) || 1;
        if (!isEnd) {
          var endLine = Number(el.getAttribute('data-source-end-line'));
          if (endLine) line = isEnd ? endLine : line;
        }
        var pos = el.getAttribute('data-source-pos');
        if (pos) {
          var parts = pos.split(':').map(Number);
          return { line: line, column: isEnd ? (parts[1] || 1) : (parts[0] || 1) };
        }
        return { line: line, column: 1 };
      }

      function closestMappedElement(node) {
        var current = node;
        while (current && current !== document.body) {
          if (current instanceof HTMLElement && current.hasAttribute('data-source-line')) {
            return current;
          }
          current = current.parentNode;
        }
        return null;
      }

      // --- Toolbar state ---

      function updateToolbarState(hasSelection) {
        document.querySelectorAll('.ace-toolbar-btn[data-needs-selection="true"]').forEach(function(btn) {
          btn.classList.toggle('disabled', !hasSelection);
        });
      }

      // --- Annotation command mapping ---

      function commandToAnnotation(command) {
        switch (command) {
          case 'insertHighlight': return 'highlight';
          case 'insertDelete': return 'delete';
          case 'insertComment': return 'comment';
          case 'insertEdit': return 'edit';
          default: return null;
        }
      }

      function sendAnnotation(command) {
        var annotation = commandToAnnotation(command);
        if (!annotation) return;

        var needsSelection = command === 'insertHighlight' || command === 'insertDelete';
        if (needsSelection && !previewRange) return;

        // For comment/edit without selection, find the cursor's nearest block line
        var range = previewRange;
        if (!range && (command === 'insertComment' || command === 'insertEdit')) {
          var sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            var cursorNode = sel.getRangeAt(0).startContainer;
            var el = closestMappedElement(cursorNode);
            if (el) {
              var line = Number(el.getAttribute('data-source-line')) || 1;
              range = { start: { line: line, column: 1 }, end: { line: line, column: 1 } };
            }
          }
        }

        vscode.postMessage({
          type: 'preview.applyAnnotation',
          annotation: annotation,
          range: range,
          text: previewText,
        });
      }

      // --- Toolbar button clicks ---

      function sendCommand(command) {
        if (command === 'clearAllAnnotations') {
          vscode.postMessage({ type: 'preview.clearAllAnnotations' });
          return;
        }
        sendAnnotation(command);
      }

      document.querySelectorAll('.ace-toolbar-btn[data-command]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          sendCommand(btn.getAttribute('data-command'));
        });
      });

      // --- Single-key shortcuts (H/C/E/D) when preview has focus ---

      document.addEventListener('keydown', function(e) {
        // Cmd+Z / Ctrl+Z → undo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
          e.preventDefault();
          vscode.postMessage({ type: 'preview.undo' });
          return;
        }

        // Ignore other modifier combos or input fields
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        var key = e.key.toLowerCase();
        var btn = document.querySelector('.ace-toolbar-btn[data-key="' + key + '"]');
        if (!btn) return;

        e.preventDefault();
        sendCommand(btn.getAttribute('data-command'));
      });

      // --- Listen for messages from extension ---
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type === 'extension.saved') {
          var el = document.getElementById('ace-saved');
          if (el) {
            el.classList.add('show');
            setTimeout(function() { el.classList.remove('show'); }, 1500);
          }
        }
      });

      // --- Annotation Summary ---

      buildSummary();

      function buildSummary() {
        var summaryEl = document.getElementById('ace-summary');
        var annotations = [];

        document.querySelectorAll('.ace-highlight').forEach(function(el) {
          annotations.push({ type: 'highlight', text: el.textContent });
        });
        document.querySelectorAll('.ace-comment').forEach(function(el) {
          annotations.push({ type: 'comment', text: el.getAttribute('data-comment') });
        });
        document.querySelectorAll('.ace-edit-suggestion').forEach(function(el) {
          annotations.push({ type: 'edit', text: el.textContent.replace('Edit Suggestion', '').trim() });
        });
        document.querySelectorAll('.ace-deletion').forEach(function(el) {
          annotations.push({ type: 'delete', text: el.textContent });
        });

        if (annotations.length === 0) {
          summaryEl.style.display = 'none';
          return;
        }

        var html = '<h3>Annotation Summary (' + annotations.length + ')</h3>';
        var icons = { highlight: '🖍️', comment: '💬', edit: '✏️', delete: '🗑️' };
        var labels = { highlight: 'Highlight', comment: 'Comment', edit: 'Edit', delete: 'Delete' };
        annotations.forEach(function(a) {
          html += '<div class="ace-summary-item">' +
            '<span class="ace-summary-type ' + a.type + '">' + icons[a.type] + ' ' + labels[a.type] + '</span>' +
            '<span>' + escapeHtml(a.text || '') + '</span>' +
            '</div>';
        });

        summaryEl.innerHTML = html;
        summaryEl.style.display = 'block';
      }

      function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    })();
  </script>
</body>
</html>`;
}
