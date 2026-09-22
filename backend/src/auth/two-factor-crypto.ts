import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateAuthenticatorSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function verifyTotp(
  secret: string,
  candidate: string,
  now = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(candidate)) return false;

  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = totp(secret, now + offset * 30_000);
    if (
      timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(candidate, 'utf8'),
      )
    ) {
      return true;
    }
  }

  return false;
}

export function encryptAuthenticatorSecret(
  secret: string,
  encryptionMaterial: string,
): string {
  const key = createHash('sha256').update(encryptionMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptAuthenticatorSecret(
  encryptedSecret: string,
  encryptionMaterial: string,
): string {
  const parts = encryptedSecret.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret');
  const [iv, tag, encrypted] = parts.map((part) =>
    Buffer.from(part, 'base64url'),
  );
  const key = createHash('sha256').update(encryptionMaterial).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

function totp(secret: string, now: number): string {
  const counter = BigInt(Math.floor(now / 30_000));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let output = '';

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];

  for (const character of value.toUpperCase().replace(/=+$/u, '')) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid authenticator secret');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
