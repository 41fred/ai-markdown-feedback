/**
 * markdown-it plugin for %%comment%% syntax
 * Hidden in visual preview, but visible to Claude in source.
 * Renders as a subtle comment indicator icon in preview.
 * Stored in source as: %%your note here%%
 */
import MarkdownIt from 'markdown-it';
import StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export function commentPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'ace_comment', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    const max = state.posMax;
    const src = state.src;

    // Must start with %%
    if (start + 1 >= max) { return false; }
    if (src.charCodeAt(start) !== 0x25 /* % */ || src.charCodeAt(start + 1) !== 0x25) {
      return false;
    }

    // Find closing %%
    let end = start + 2;
    while (end + 1 < max) {
      if (src.charCodeAt(end) === 0x25 && src.charCodeAt(end + 1) === 0x25) {
        break;
      }
      end++;
    }

    if (end + 1 >= max) { return false; }
    if (end === start + 2) { return false; }

    const content = src.slice(start + 2, end);

    if (!silent) {
      const token = state.push('ace_comment', '', 0);
      token.content = content;
      token.markup = '%%';
    }

    state.pos = end + 2;
    return true;
  });

  md.renderer.rules['ace_comment'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const content = md.utils.escapeHtml(token.content);
    // Emit sourcemap attributes from the token
    const sourceLine = token.attrGet('data-source-line') || '';
    const sourcePos = token.attrGet('data-source-pos') || '';
    const sourceAttrs = sourceLine ? ` data-source-line="${sourceLine}" data-source-pos="${sourcePos}"` : '';
    return `<span class="ace-comment" title="${content}" data-comment="${content}"${sourceAttrs}>` +
      `<span class="ace-comment-icon">💬</span>` +
      `<span class="ace-comment-text">${content}</span>` +
      `</span>`;
  };
}
