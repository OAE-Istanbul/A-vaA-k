import { randomBytes } from 'node:crypto';

export const newId = () => randomBytes(6).toString('base64url');
export const newToken = () => randomBytes(24).toString('base64url');
