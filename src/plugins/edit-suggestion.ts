/**
 * markdown-it plugin for > [!EDIT] callout syntax
 * Renders as a styled edit-suggestion callout block.
 * Stored in source as: > [!EDIT] Change X to Y
 */
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';

export function editSuggestionPlugin(md: MarkdownIt): void {
  // Process blockquote tokens to detect [!EDIT] callouts
  md.core.ruler.after('block', 'ace_edit_suggestion', (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') { continue; }

      // Find the inline content inside the blockquote
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== 'blockquote_close') {
        if (tokens[j].type === 'inline') {
          const content = tokens[j].content;
          const match = content.match(/^\[!EDIT\]\s*(.*)/s);
          if (match) {
            // Mark the blockquote as an edit suggestion
            tokens[i].attrSet('class', 'ace-edit-suggestion');
            tokens[i].attrSet('data-type', 'edit');

            // Replace inline content, removing the [!EDIT] prefix
            tokens[j].content = match[1];

            // Insert a label token before the paragraph
            const labelToken = new Token('html_block', '', 0);
            labelToken.content = '<div class="ace-edit-label">✏️ Edit Suggestion</div>';

            // Find the paragraph_open before this inline
            for (let k = j - 1; k > i; k--) {
              if (tokens[k].type === 'paragraph_open') {
                tokens.splice(k, 0, labelToken);
                j++; // Adjust index since we inserted
                break;
              }
            }
          }
        }
        j++;
      }
    }
  });
}
