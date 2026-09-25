import { describe, expect, it } from 'vitest';
import { extractMigrateBodies, matchBalancedBrace } from './js-scan.ts';

describe('matchBalancedBrace', () => {
  it('finds the matching close brace', () => {
    const text = '{ a: { b: 1 }, c: 2 }';
    expect(matchBalancedBrace(text, 0)).toBe(text.length - 1);
  });

  it('ignores braces inside strings and comments', () => {
    const text = "{ a: '{', b: `}`, /* { */ c: 1 } // }";
    const close = matchBalancedBrace(text, 0);
    expect(text.slice(0, close + 1)).toBe("{ a: '{', b: `}`, /* { */ c: 1 }");
  });

  it('throws when the braces never balance', () => {
    expect(() => matchBalancedBrace('{ a: 1', 0)).toThrow();
  });
});

describe('extractMigrateBodies', () => {
  it('splits the up and down callbacks of a migrate() call', () => {
    const content = `
migrate(
  (app) => {
    const x = new Collection({ name: 'x' });
    app.save(x);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('x'));
  },
);
`;
    const { up, down } = extractMigrateBodies(content);
    expect(up).toContain("new Collection({ name: 'x' })");
    expect(up).not.toContain('findCollectionByNameOrId');
    expect(down).toContain("app.delete(app.findCollectionByNameOrId('x'))");
  });

  it('is not confused by a brace inside a comment in the up body', () => {
    const content = `
migrate(
  (app) => {
    // a rule of "{" means nothing special here
    const x = new Collection({ name: 'x' });
  },
  (app) => {},
);
`;
    const { up } = extractMigrateBodies(content);
    expect(up).toContain("new Collection({ name: 'x' })");
  });

  it('returns a null down body when there is no second callback', () => {
    const content = `
migrate(
  (app) => {
    const x = 1;
  },
);
`;
    const { down } = extractMigrateBodies(content);
    expect(down).toBeNull();
  });
});
