import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

function runIngestionSnippet(snippet: string, beforeImport = '', nodeArgs: string[] = []) {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), 'server/ingestion.mjs')).href;
  const code = `
    process.env.NODE_ENV = 'test';
    ${beforeImport}
    const ingestion = await import(${JSON.stringify(moduleUrl)});
    const result = await (async () => { ${snippet} })();
    console.log(JSON.stringify(result));
  `;
  const output = execFileSync(process.execPath, [...nodeArgs, '--input-type=module', '-e', code], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DRY_RUN: '0', NTFY_TOPIC: 'offline-test', NTFY_SERVER: 'http://127.0.0.1:1', SIGNAL_STATE_FILE: 'offline-test-unused-state.json', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
    encoding: 'utf8',
    timeout: 15000,
  });
  return JSON.parse(output.trim().split('\n').at(-1)!);
}

describe('standalone ingestion', () => {
  it('loads repository-local dotenv files with process > .dev.vars > .env precedence', () => {
    const result = runIngestionSnippet(`
      return {
        paths: configuredPaths,
        signals: [
          ingestion.generateSignal(0.5, 4, 6),
          ingestion.generateSignal(0.7, 3, 6),
          ingestion.generateSignal(0.7, 4, 5),
          ingestion.generateSignal(0.7, 4, 6)?.signalType,
        ],
      };
    `, `
      const fs = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');
      const { default: dotenv } = await import('dotenv');
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-signal-env-'));
      process.on('exit', () => fs.rmSync(fixture, { recursive: true, force: true }));
      fs.writeFileSync(path.join(fixture, '.dev.vars'), 'BUY_THRESHOLD=0.8\\nMIN_AGREEING_SOURCES=4\\n');
      fs.writeFileSync(path.join(fixture, '.env'), 'BUY_THRESHOLD=0.2\\nMIN_AGREEING_SOURCES=1\\nMIN_SCORED_HEADLINES=6\\n');
      process.env.BUY_THRESHOLD = '0.6';
      delete process.env.MIN_AGREEING_SOURCES;
      delete process.env.MIN_SCORED_HEADLINES;
      let configuredPaths;
      const originalConfig = dotenv.config;
      dotenv.config = (options) => {
        configuredPaths = options.path;
        return originalConfig({ ...options, path: options.path.map((file) => path.join(fixture, path.basename(file))) });
      };
    `);
    expect(result.paths).toEqual([resolve(process.cwd(), '.dev.vars'), resolve(process.cwd(), '.env')]);
    expect(result.signals).toEqual([null, null, null, 'BUY']);
  });

  it('keeps legacy HTTP context and web startup disabled without opening a listener', () => {
    const result = runIngestionSnippet(`
      const net = await import('node:net');
      let listeners = 0;
      net.Server.prototype.listen = () => { listeners++; throw new Error('Unexpected listener'); };
      const errors = [];
      try {
        const { createContext } = await import(new URL('./_core/context.ts', ${JSON.stringify(pathToFileURL(resolve(process.cwd(), 'server/ingestion.mjs')).href)}));
        await createContext({});
      } catch (error) { errors.push(error.message); }
      try {
        await import(new URL('./_core/index.ts', ${JSON.stringify(pathToFileURL(resolve(process.cwd(), 'server/ingestion.mjs')).href)}));
      } catch (error) { errors.push(error.message); }
      return { errors, listeners };
    `, '', ['--import', 'tsx']);
    expect(result.listeners).toBe(0);
    expect(result.errors).toEqual([
      'Legacy web authentication is unavailable; HTTP context creation is disabled.',
      'Legacy web server is unsupported and disabled. Run server/ingestion.mjs or server/scheduler.mjs instead.',
    ]);
  });

  it('keeps dry-run notifications offline', () => {
    const result = runIngestionSnippet(`
      ingestion.http.post = async () => { throw new Error('Dry-run must not publish'); };
      return await ingestion.sendNotification('TEST', {
        signalType: 'BUY', confidence: 0.9, reasoning: 'Offline dry-run regression',
      }, []);
    `, `process.env.DRY_RUN = '1';`);
    expect(result).toBe(true);
  });

  it.each(['BUY', 'SELL'])('delivers %s over real HTTP with ASCII headers', (signalType) => {
    const result = runIngestionSnippet(`
      try {
        const delivered = await ingestion.sendNotification('TEST', {
          signalType: '${signalType}', confidence: 0.9, reasoning: 'Offline regression',
        }, [{ title: 'Example headline', publisher: 'Example publisher' }]);
        return { delivered, received };
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    `, `
      const { createServer } = await import('node:http');
      let received;
      const server = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        received = { headers: request.headers, url: request.url, body: Buffer.concat(chunks).toString() };
        response.writeHead(200);
        response.end('ok');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      process.env.NTFY_SERVER = 'http://127.0.0.1:' + server.address().port;
      process.env.NTFY_TOPIC = 'offline topic';
    `);

    expect(result.delivered).toBe(true);
    expect(result.received.url).toBe('/offline%20topic');
    expect(result.received.headers.title).toBe(`${signalType} Signal: TEST`);
    expect(result.received.headers.priority).toBe('high');
    expect(result.received.headers.tags).toBe(`${signalType === 'BUY' ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'},${signalType.toLowerCase()},stock,test`);
    expect(result.received.headers.title).toMatch(/^[\x20-\x7e]+$/);
    expect(result.received.headers.tags).toMatch(/^[\x20-\x7e]+$/);
    expect(result.received.body).toContain('Example headline (Example publisher)');
  });

  it.each([503, 201, 'disconnect'])('returns false for failed delivery: %s', (failure) => {
    const result = runIngestionSnippet(`
      try {
        return await ingestion.sendNotification('TEST', {
          signalType: 'BUY', confidence: 0.7, reasoning: 'Offline failure regression',
        }, []);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    `, `
      const { createServer } = await import('node:http');
      const server = createServer((request, response) => {
        if (${JSON.stringify(failure)} === 'disconnect') { request.socket.destroy(); return; }
        response.writeHead(${typeof failure === 'number' ? failure : 500});
        response.end('offline failure');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      process.env.NTFY_SERVER = 'http://127.0.0.1:' + server.address().port;
    `);
    expect(result).toBe(false);
  });

  it('drops neutral headlines and counts agreeing publishers', () => {
    const result = runIngestionSnippet(`
      const { sentiment, agreeingSources, scored } = ingestion.scoreHeadlines([
        { title: 'The company reports results today', publisher: 'one' },
        { title: 'Company beats expectations with strong growth', publisher: 'one' },
        { title: 'Excellent results as revenue surges', publisher: 'two' },
        { title: 'Outstanding performance delivers record profits', publisher: 'three' },
      ]);
      return { sentiment, agreeingSources, count: scored.length,
        signal: ingestion.generateSignal(sentiment, agreeingSources, scored.length)?.signalType };
    `);

    expect(result.count).toBe(3);
    expect(result.sentiment).toBeGreaterThan(0.35);
    expect(result.agreeingSources).toBe(3);
    expect(result.signal).toBe('BUY');
  });

  it('does not signal below the headline and source minimums', () => {
    const result = runIngestionSnippet(`return [
      ingestion.generateSignal(0.8, 1, 5),
      ingestion.generateSignal(0.8, 3, 2),
    ];`);
    expect(result).toEqual([null, null]);
  });

  it('continues when one RSS source fails', async () => {
    const result = runIngestionSnippet(`
      const today = new Date().toUTCString();
      const googleFeed = '<?xml version="1.0"?><rss><channel>' +
        '<item><title>Company beats expectations with strong growth - Publisher One</title>' +
        '<link>https://publisher-one.example/a</link><pubDate>' + today + '</pubDate><source>Publisher One</source></item>' +
        '<item><title>Excellent results as revenue surges - Publisher Two</title>' +
        '<link>https://publisher-two.example/b</link><pubDate>' + today + '</pubDate><source>Publisher Two</source></item>' +
        '</channel></rss>';
      ingestion.http.get = async (url) => {
        if (String(url).includes('news.google.com')) return { data: googleFeed };
        throw new Error('simulated Yahoo outage');
      };
      const warnings = [];
      console.warn = (...args) => warnings.push(args.join(' '));
      const headlines = await ingestion.fetchHeadlines('TEST');
      return { count: headlines.length, warnings };
    `);

    expect(result.count).toBe(2);
    expect(result.warnings).toHaveLength(1);
  });
});