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
    for (const token of state.tokens) {
      // Block-level tokens with .map
      if ((token.nesting === 1 || token.nesting === 0) && token.map) {
        const startLine = token.map[0] + 1; // 1-based
        const endLine = token.map[1];
        token.attrSet('data-source-line', String(startLine));
        token.attrSet('data-source-end-line', String(endLine));
      }

      // Inline children — track column positions within the line
      if (token.type === 'inline' && token.children && token.map) {
        annotateInlineChildren(token.children, token.map[0] + 1);
      }
    }
  });
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
        const rawLen = child.content.length + 2; // `code`
        child.attrSet('data-source-line', String(line));
        child.attrSet('data-source-pos', `${column + 1}:${column + 1 + child.content.length}`);
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
