import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(String(pin), salt, 32).toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(String(pin), Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
