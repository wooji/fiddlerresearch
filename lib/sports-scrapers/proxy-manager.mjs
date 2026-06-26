import { readFileSync } from 'fs';
import { join } from 'path';

export class ProxyManager {
  constructor(proxyListPath) {
    const raw = readFileSync(proxyListPath, 'utf8');
    const lines = raw.split('\n')
      .map(l => l.trim())
      .filter(l => l);

    // Detect proxy type: residential (resi.heroproxies) or ISP datacenter (40.27.103.*)
    this.proxies = lines;
    this.type = lines[0]?.includes('resi.heroproxies') ? 'residential' : 'datacenter';

    this.currentIndex = 0;
    this.failedProxies = new Set();
    console.log(`[proxy-manager] loaded ${this.proxies.length} ${this.type} proxies`);
  }

  getNext() {
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

      if (!this.failedProxies.has(proxy)) return proxy;
      attempts++;
    }
    return null;
  }

  markFailed(proxy) {
    this.failedProxies.add(proxy);
    const id = proxy.split(':')[2]?.slice(0, 20) || proxy.slice(0, 20);
    console.log(`[proxy-manager] marked failed: ${id}...`);
  }

  markRecovered(proxy) {
    this.failedProxies.delete(proxy);
  }

  getStats() {
    return {
      total: this.proxies.length,
      failed: this.failedProxies.size,
      available: this.proxies.length - this.failedProxies.size,
    };
  }
}

export function proxyUrl(proxyString) {
  // Residential: resi.heroproxies.com:7777:customer-pb_...auth...:2~token~0B=
  if (proxyString.includes('resi.heroproxies')) {
    const parts = proxyString.split(':');
    const host = parts[0];
    const port = parts[1];
    const auth = `${parts[2]}:${parts[3]}`;
    return `http://${auth}@${host}:${port}`;
  }

  // ISP Datacenter: 40.27.103.2:3128:xyz8638:p7z9vk20xmo83z68
  const parts = proxyString.split(':');
  const host = parts[0];
  const port = parts[1];
  const user = parts[2];
  const pass = parts[3];
  return `http://${user}:${pass}@${host}:${port}`;
}
