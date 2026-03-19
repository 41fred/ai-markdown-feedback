/**
 * markdown-it plugin that adds data-source-line and data-source-pos attributes
 * to rendered HTML elements, enabling preview-to-source mapping.
 *
 * Must be registered LAST, after all other plugins have processed tokens.
 */
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';

export function sourceMapPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'acemd_source_map', (state) => {
    const lines = state.src.split(/\r?\n/);

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];

      // Block-level tokens with .map
      if ((token.nesting === 1 || token.nesting === 0) && token.map) {
        const startLine = token.map[0] + 1; // 1-based
        const endLine = token.map[1];
        token.attrSet('data-source-line', String(startLine));
        token.attrSet('data-source-end-line', String(endLine));
      }

      // Annotate table cells (th_open/td_open don't get .map from markdown-it)
      if (token.type === 'tr_open' && token.map) {
        const rowLine = token.map[0]; // 0-based
        const rawRow = lines[rowLine] || '';
        annotateTableCells(state.tokens, i, rawRow, rowLine + 1);
      }

      // Inline children — track column positions within the line
      if (token.type === 'inline' && token.children && token.map) {
        annotateInlineChildren(token.children, token.map[0] + 1);
      }
    }
  });
}

/**
 * Walk from tr_open to tr_close, find th_open/td_open tokens,
 * and annotate them with data-source-line and data-source-pos
 * based on pipe positions in the raw row text.
 */
function annotateTableCells(tokens: Token[], trIdx: number, rawRow: string, line: number): void {
  // Find pipe positions in the raw row to determine cell boundaries
  // Skip escaped pipes (\|) which are literal content, not separators
  const pipePositions: number[] = [];
  for (let i = 0; i < rawRow.length; i++) {
    if (rawRow[i] === '|' && (i === 0 || rawRow[i - 1] !== '\\')) { pipePositions.push(i); }
  }

  let cellIdx = 0;
  for (let j = trIdx + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === 'tr_close') { break; }

    if (t.type === 'th_open' || t.type === 'td_open') {
      t.attrSet('data-source-line', String(line));

      // Map cell to the trimmed content between pipes (skip whitespace padding)
      if (cellIdx < pipePositions.length - 1) {
        let start = pipePositions[cellIdx] + 1; // after the pipe
        let end = pipePositions[cellIdx + 1] - 1; // before the next pipe

        // Trim leading/trailing whitespace so span covers cell content only
        while (start <= end && /\s/.test(rawRow[start] ?? '')) { start++; }
        while (end >= start && /\s/.test(rawRow[end] ?? '')) { end--; }

        // 1-based columns, half-open end: [startColumn, endColumn)
        const startColumn = start + 1;
        const endColumn = end + 2;
        t.attrSet('data-source-pos', `${startColumn}:${endColumn}`);
      }

      cellIdx++;
    }
  }
}

function annotateInlineChildren(children: Token[], line: number): void {
  let column = 1;
  const stack: Array<{
    token: Token;
    rawStart: number;
    contentStart: number;
    markupLen: number;
  }> = [];

  for (const child of children) {
    switch (child.type) {
      case 'ace_highlight_open':
      case 's_open': {
        const markupLen = child.markup.length; // "==" or "~~"
        stack.push({
          token: child,
          rawStart: column,
          contentStart: column + markupLen,
          markupLen,
        });
        column += markupLen;
        break;
      }

      case 'ace_highlight_close':
      case 's_close': {
        const open = stack.pop();
        if (open) {
          // Map to content position (inside the markup)
          open.token.attrSet('data-source-line', String(line));
          open.token.attrSet('data-source-pos', `${open.contentStart}:${column}`);
          // Also store raw position (including markup) for annotation logic
          open.token.attrSet('data-source-raw-pos', `${open.rawStart}:${column + child.markup.length}`);
        }
        column += child.markup.length;
        break;
      }

      case 'ace_comment': {
        const rawLen = child.content.length + 4; // %%...%%
        child.attrSet('data-source-line', String(line));
        child.attrSet('data-source-pos', `${column}:${column + rawLen}`);
        column += rawLen;
        break;
      }

      case 'code_inline': {
        const tickLen = (child.markup && child.markup.length) || 1;
        const rawLen = child.content.length + tickLen * 2;
        child.attrSet('data-source-line', String(line));
        child.attrSet('data-source-pos', `${column + tickLen}:${column + tickLen + child.content.length}`);
        column += rawLen;
        break;
      }

      case 'text':
        // Text nodes: set source position for mapping
        child.attrSet('data-source-line', String(line));
        child.attrSet('data-source-pos', `${column}:${column + child.content.length}`);
        column += child.content.length;
        break;

      case 'softbreak':
      case 'hardbreak':
        line += 1;
        column = 1;
        break;

      default:
        // For other inline tokens with content, advance column
        if (child.content) {
          column += child.content.length;
        }
        if (child.markup) {
          column += child.markup.length;
        }
        break;
    }
  }
}
