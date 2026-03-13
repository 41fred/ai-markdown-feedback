/**
 * markdown-it plugin for ==highlight== syntax
 * Renders as yellow-highlighted text in preview.
 * Stored in source as: ==highlighted text==
 */
import MarkdownIt from 'markdown-it';
import StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export function highlightPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'ace_highlight', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    const max = state.posMax;
    const src = state.src;

    // Must start with ==
    if (start + 1 >= max) { return false; }
    if (src.charCodeAt(start) !== 0x3D /* = */ || src.charCodeAt(start + 1) !== 0x3D) {
      return false;
    }

    // Find closing ==
    let end = start + 2;
    while (end + 1 < max) {
      if (src.charCodeAt(end) === 0x3D && src.charCodeAt(end + 1) === 0x3D) {
        break;
      }
      end++;
    }

    if (end + 1 >= max) { return false; }

    // No empty highlights
    if (end === start + 2) { return false; }

    if (!silent) {
      const token = state.push('ace_highlight_open', 'mark', 1);
      token.attrSet('class', 'ace-highlight');
      token.markup = '==';

      state.md.inline.tokenize(
        Object.assign(Object.create(state), {
          pos: start + 2,
          posMax: end,
          tokens: state.tokens,
        })
      );

      const closeToken = state.push('ace_highlight_close', 'mark', -1);
      closeToken.markup = '==';
    }

    state.pos = end + 2;
    return true;
  });
}
