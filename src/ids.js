// Web Crypto hem Node.js'te hem tarayıcıda (önizleme) vardır.
const randomHex = (bytes) =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export const newId = () => randomHex(6);
export const newToken = () => randomHex(24);
