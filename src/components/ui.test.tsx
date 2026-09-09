import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContentSafetyContext } from '../lib/contentSafety';
vi.mock('../lib/api', () => ({ asset: (path: string) => path, call: vi.fn() }));
import { CoverImage } from './ui';

describe('restricted cover rendering', () => {
  const cover = {
    url: 'https://image.civitai.red/private.png',
    localPath: 'cached-private.png',
    nsfwLevel: 4,
  };
  it('renders the bundled placeholder without including the original image URL or cache path', () => {
    const html = renderToStaticMarkup(<CoverImage cover={cover} alt="模型" />);
    expect(html).toContain('安全审查已隐藏此封面');
    expect(html).toContain('safety-cover.png');
    expect(html).not.toContain('private.png');
  });
  it('does not label missing images or disabled review as restricted content', () => {
    expect(renderToStaticMarkup(<CoverImage alt="无封面" />)).not.toContain('封面已隐藏');
    const html = renderToStaticMarkup(
      <ContentSafetyContext.Provider value={false}>
        <CoverImage cover={cover} alt="模型" />
      </ContentSafetyContext.Provider>,
    );
    expect(html).not.toContain('安全审查已隐藏此封面');
  });
});
