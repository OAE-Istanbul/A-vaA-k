// Sıra önemli: önce arka uç fetch/EventSource'u yakalar, sonra uygulama açılır.
import { preview } from './backend.js';
import '../public/app.js';
import { mountPanel } from './panel.js';

mountPanel(preview);
