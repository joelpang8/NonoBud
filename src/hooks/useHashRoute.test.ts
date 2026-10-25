import { parseHash, routeHash, type Route } from './useHashRoute';

describe('hash routes', () => {
  it.each<Route>([{ name: 'home' }, { name: 'puzzle', id: 'p10-cat' }, { name: 'random', n: 15, seed: 4000000000 }])('round-trips %o', (r) => {
    expect(parseHash(routeHash(r))).toEqual(r);
  });

  it('falls back to home for junk', () => {
    expect(parseHash('#/r/7/12')).toEqual({ name: 'home' });
    expect(parseHash('#/r/10/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
    expect(parseHash('')).toEqual({ name: 'home' });
  });
});
