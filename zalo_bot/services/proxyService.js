// proxyService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProxiesFilePath } from '../utils/helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxiesFilePath = getProxiesFilePath();

const MAX_ACCOUNTS_PER_PROXY = 3;

class ProxyService {
    constructor() {
        this.RAW_PROXIES = [];
        try {
            const data = fs.readFileSync(proxiesFilePath, 'utf8');
            this.RAW_PROXIES = JSON.parse(data);
        } catch (err) {
            console.error('Không thể đọc file proxies.json:', err);
            this.RAW_PROXIES = [];
        }
        this.PROXIES = this.RAW_PROXIES.map(p => ({ url: p, usedCount: 0, accounts: [] }));
    }

    getAvailableProxyIndex() {
        for (let i = 0; i < this.PROXIES.length; i++) {
            if (this.PROXIES[i].usedCount < MAX_ACCOUNTS_PER_PROXY) {
                return i;
            }
        }
        return -1; // Không còn proxy trống
    }

    addProxy(proxyUrl) {
        const newProxy = { url: proxyUrl, usedCount: 0, accounts: [] };
        this.PROXIES.push(newProxy);
        this.RAW_PROXIES.push(proxyUrl);
        fs.writeFileSync(proxiesFilePath, JSON.stringify(this.RAW_PROXIES, null, 2));
        return newProxy;
    }

    removeProxy(proxyUrl) {
        const index = this.PROXIES.findIndex(p => p.url === proxyUrl);
        if (index === -1) {
            throw new Error('Không tìm thấy proxy');
        }
        this.PROXIES.splice(index, 1);
        const rawIndex = this.RAW_PROXIES.indexOf(proxyUrl);
        if (rawIndex !== -1) {
            this.RAW_PROXIES.splice(rawIndex, 1);
        }
        fs.writeFileSync(proxiesFilePath, JSON.stringify(this.RAW_PROXIES, null, 2));
        return true;
    }

    getPROXIES() {
        return this.PROXIES;
    }
}

const proxyService = new ProxyService();

// Export instance
export { proxyService };

// Export các hàm tiện ích để compatibility với code cũ
export const getPROXIES = () => proxyService.getPROXIES();
export const getAvailableProxyIndex = () => proxyService.getAvailableProxyIndex();
export const addProxy = (proxyUrl) => proxyService.addProxy(proxyUrl);
export const removeProxy = (proxyUrl) => proxyService.removeProxy(proxyUrl);
