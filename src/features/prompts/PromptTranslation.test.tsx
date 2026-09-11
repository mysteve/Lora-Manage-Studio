import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../../lib/api', () => ({ call: vi.fn() }));
import { PromptTranslation } from './PromptTranslation';
import { builtInTerms } from './terms';
describe('prompt translation display', () => {
  it('shows vocabulary translations without an AI action when unconfigured', () => {
    const html = renderToStaticMarkup(
      <PromptTranslation value="masterpiece, " terms={builtInTerms} ai={null} />,
    );
    expect(html).toContain('杰作');
    expect(html).not.toContain('<button');
  });
  it('offers a translation action for a configured model and marks unknown phrases', () => {
    const html = renderToStaticMarkup(
      <PromptTranslation
        value="unknown phrase"
        terms={builtInTerms}
        ai={{ available: true, reason: '', model: 'test-model' }}
      />,
    );
    expect(html).toContain('AI 翻译');
    expect(html).toContain('test-model');
    expect(html).toContain('prompt-translation-missing');
    expect(html).toContain('unknown phrase');
  });
});
