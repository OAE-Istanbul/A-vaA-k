import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const emptyData = () => ({ buyers: {}, hotels: {}, listings: {}, offers: {}, sessions: {} });

/** JSON dosyasına yazan basit kayıt deposu. file verilmezse yalnızca bellekte tutar. */
export class Store {
  constructor(file = null) {
    this.file = file || null;
    this.data = emptyData();
    if (this.file && existsSync(this.file)) {
      Object.assign(this.data, JSON.parse(readFileSync(this.file, 'utf8')));
    }
  }

  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
