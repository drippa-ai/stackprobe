import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import NotFound from './not-found.tsx';

vi.mock('next/navigation', () => ({ usePathname: () => '/pricing' }));

test('says the page is missing, names the address, and offers a scan and the home page', () => {
  const html = renderToStaticMarkup(<NotFound />);
  expect(html).toContain('<h1 class="not-found-title">Page not found</h1>');
  expect(html).toContain('<span class="mono requested-path">/pricing</span>');
  expect(html).toContain('class="scan-form compact"');
  expect(html).toContain('<a href="/">Back to the home page</a>');
  expect(html).toContain('class="site-header"');
});
