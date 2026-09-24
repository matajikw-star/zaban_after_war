import { describe, expect, it } from 'vitest';
import { expandHome, shellQuote, sshPrefix } from './ssh.ts';

describe('expandHome', () => {
  it('expands ~ and ~/… against the given home, with forward slashes', () => {
    expect(expandHome('~/.ssh/kl_root.pem', 'C:\\Users\\asus')).toBe(
      'C:/Users/asus/.ssh/kl_root.pem',
    );
    expect(expandHome('~', '/home/me')).toBe('/home/me');
    expect(expandHome('~\\.ssh\\key', 'C:\\Users\\me')).toBe('C:/Users/me/.ssh/key');
  });

  it('leaves an absolute path alone apart from the slashes', () => {
    expect(expandHome('/keys/kl.pem', '/home/me')).toBe('/keys/kl.pem');
    expect(expandHome('C:\\keys\\kl.pem', '/home/me')).toBe('C:/keys/kl.pem');
    // `~user/…` is not ours to resolve.
    expect(expandHome('~other/key', '/home/me')).toBe('~other/key');
  });
});

describe('shellQuote', () => {
  it('single-quotes, escaping embedded single quotes', () => {
    expect(shellQuote('a b')).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe('sshPrefix', () => {
  it('always sets BatchMode=yes so a deploy never waits on a prompt', () => {
    expect(sshPrefix({ user: 'kl', host: '1.2.3.4', keyFile: null })).toBe(
      'ssh -o BatchMode=yes kl@1.2.3.4',
    );
  });

  it('adds -i <key>, quoted, when a key file is given', () => {
    expect(sshPrefix({ user: 'root', host: 'h', keyFile: 'C:/Users/a b/.ssh/k.pem' })).toBe(
      "ssh -o BatchMode=yes -i 'C:/Users/a b/.ssh/k.pem' root@h",
    );
  });
});
