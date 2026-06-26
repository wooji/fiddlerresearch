import { chromium } from 'playwright';
import { ProxyManager, proxyUrl } from './proxy-manager.mjs';

export class BrowserPool {
  constructor(proxyListPath, concurrency = 10) {
    this.proxyManager = new ProxyManager(proxyListPath);
    this.concurrency = concurrency;
    this.browsers = [];
    this.taskQueue = [];
    this.running = 0;
  }

  async init() {
    for (let i = 0; i < this.concurrency; i++) {
      const proxy = this.proxyManager.getNext();
      if (!proxy) break;
      const browser = await chromium.launch({
        headless: true,
        proxy: { server: proxyUrl(proxy) },
      });
      this.browsers.push({ browser, proxy });
      console.log(`[browser-pool] launched browser ${i + 1}/${this.concurrency}`);
    }
  }

  async fetchUrl(url, browserIndex = null) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ url, browserIndex, resolve, reject });
      this.process();
    });
  }

  async fetchPage(url, extractorFn, browserIndex = null) {
    // Fetch and run extraction function in browser context
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ url, browserIndex, resolve, reject, extractorFn });
      this.process();
    });
  }

  async process() {
    while (this.running < this.concurrency && this.taskQueue.length > 0) {
      this.running++;
      const task = this.taskQueue.shift();
      this.execute(task);
    }
  }

  async execute(task) {
    const { url, browserIndex, resolve, reject, extractorFn } = task;
    const browserIdx = browserIndex ?? Math.floor(Math.random() * this.browsers.length);
    const { browser, proxy } = this.browsers[browserIdx];

    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for JS to render
      await page.waitForTimeout(2000);

      if (extractorFn) {
        // Run extraction function in browser context
        const data = await page.evaluate(extractorFn);
        await ctx.close();
        resolve(data);
      } else {
        // Return raw HTML
        const html = await page.content();
        await ctx.close();
        resolve(html);
      }
    } catch (e) {
      this.proxyManager.markFailed(proxy);
      console.error(`[browser-pool] fetch failed (${url}):`, e.message);
      reject(e);
    } finally {
      this.running--;
      this.process();
    }
  }

  async close() {
    for (const { browser } of this.browsers) {
      await browser.close();
    }
  }
}
