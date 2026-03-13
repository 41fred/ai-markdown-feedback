/**
 * markdown-it plugin enhancement for ~~strikethrough~~ syntax
 * Standard strikethrough already exists in markdown-it, but we
 * enhance its rendering to style it as a deletion suggestion.
 *
 * We add a wrapper class so CSS can style it distinctly.
 * Stored in source as: ~~text to remove~~
 */
import MarkdownIt from 'markdown-it';

export function deletionPlugin(md: MarkdownIt): void {
  // Override the default <s> renderer to add our class
  const defaultOpen = md.renderer.rules['s_open'];
  const defaultClose = md.renderer.rules['s_close'];

  md.renderer.rules['s_open'] = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('class', 'ace-deletion');
    tokens[idx].attrSet('title', 'Suggested for deletion');
    if (defaultOpen) {
      return defaultOpen(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules['s_close'] = (tokens, idx, options, env, self) => {
    if (defaultClose) {
      return defaultClose(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options) +
      '<span class="ace-deletion-icon" title="Suggested for removal">🗑️</span>';
  };
}
