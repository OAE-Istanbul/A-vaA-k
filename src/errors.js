/** Kullanıcıya gösterilebilecek iş kuralı hatası. */
export class MarketError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MarketError';
    this.status = status;
  }
}
