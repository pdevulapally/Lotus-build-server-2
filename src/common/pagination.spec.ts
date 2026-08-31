import 'reflect-metadata';
import { buildPage } from './pagination';

describe('buildPage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

  it('returns all rows and no cursor when under the limit', () => {
    const page = buildPage(rows(3), 5);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('returns exactly limit rows and no cursor at the boundary', () => {
    const page = buildPage(rows(5), 5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('trims the extra row and returns the last item id as cursor', () => {
    const page = buildPage(rows(6), 5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBe('id-4');
  });

  it('handles empty result sets', () => {
    const page = buildPage([], 5);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });
});
