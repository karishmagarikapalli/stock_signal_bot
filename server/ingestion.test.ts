import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

function runIngestionSnippet(snippet: string) {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), 'server/ingestion.mjs')).href;
  const code = `
    process.env.NODE_ENV = 'test';
    const ingestion = await import(${JSON.stringify(moduleUrl)});
    const result = await (async () => { ${snippet} })();
    console.log(JSON.stringify(result));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  return JSON.parse(output.trim());
}

describe('standalone ingestion', () => {
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