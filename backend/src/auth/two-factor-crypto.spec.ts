import { createHmac } from 'node:crypto';

import {
  decryptAuthenticatorSecret,
  encryptAuthenticatorSecret,
  generateAuthenticatorSecret,
  verifyTotp,
} from './two-factor-crypto';

describe('two-factor cryptography', () => {
  const encryptionKey = 'test-only-encryption-material-32-characters';

  it('encrypts authenticator secrets with a randomized authenticated cipher', () => {
    const secret = generateAuthenticatorSecret();
    const first = encryptAuthenticatorSecret(secret, encryptionKey);
    const second = encryptAuthenticatorSecret(secret, encryptionKey);

    expect(first).not.toBe(second);
    expect(decryptAuthenticatorSecret(first, encryptionKey)).toBe(secret);
    expect(decryptAuthenticatorSecret(second, encryptionKey)).toBe(secret);
  });

  it('accepts the current TOTP and rejects a different code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.parse('2026-09-01T12:00:00.000Z');
    const code = testTotp(secret, now);

    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(
      verifyTotp(secret, code === '000000' ? '000001' : '000000', now),
    ).toBe(false);
  });
});

function testTotp(secret: string, now: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}
