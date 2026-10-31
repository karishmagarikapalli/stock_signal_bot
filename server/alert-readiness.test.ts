import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDryRun } from './alert-readiness.mjs';

describe('workflow alert readiness', () => {
  it('wires the resolver into the workflow without changing signal thresholds', () => {
    const workflow = readFileSync(resolve('.github/workflows/ingestion.yml'), 'utf8');
    for (const required of [
      'id: readiness', 'run: node server/alert-readiness.mjs',
      'ALERT_EVENT_NAME: ${{ github.event_name }}',
      'LIVE_ALERTS_READY: ${{ vars.LIVE_ALERTS_READY }}',
      'DISPATCH_DRY_RUN: ${{ toJSON(inputs.dry_run) }}',
      'NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}',
      "DRY_RUN: ${{ steps.readiness.outputs.dry_run || '1' }}",
      'BUY_THRESHOLD: "0.5"', 'MIN_SCORED_HEADLINES: "5"', 'MIN_AGREEING_SOURCES: "3"',
      'cron: "17 * * * *"', 'default: true',
    ]) expect(workflow).toContain(required);
    expect(workflow.indexOf('run: node server/alert-readiness.mjs'))
      .toBeLessThan(workflow.indexOf('run: node server/ingestion.mjs'));
  });

  it('defaults to dry-run for missing configuration', () => {
    expect(resolveDryRun()).toBe('1');
  });

  it('requires exact readiness and a nonblank topic for every event', () => {
    for (const eventName of ['schedule', 'workflow_dispatch', 'push', undefined]) {
      for (const readiness of [undefined, '', 'false', '1', 'TRUE', ' true ', 'true']) {
        for (const topic of [undefined, '', '  ', 'offline-fixture']) {
          const expected = readiness === 'true' && topic === 'offline-fixture' &&
            ['schedule', 'workflow_dispatch'].includes(eventName ?? '') ? '0' : '1';
          expect(resolveDryRun({ eventName, readiness, topic, dispatchDryRun: 'false' })).toBe(expected);
        }
      }
    }
  });

  it('requires explicit false for manual delivery even when ready', () => {
    for (const dispatchDryRun of [undefined, '', 'null', 'true', '0', 'FALSE', 'false']) {
      expect(resolveDryRun({ eventName: 'workflow_dispatch', readiness: 'true',
        topic: 'offline-fixture', dispatchDryRun })).toBe(dispatchDryRun === 'false' ? '0' : '1');
    }
  });

  it('writes only a mode output and never logs the topic', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stock-readiness-'));
    try {
      const outputPath = join(directory, 'output');
      const output = execFileSync(process.execPath, [resolve('server/alert-readiness.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outputPath, ALERT_EVENT_NAME: 'schedule',
          LIVE_ALERTS_READY: '', NTFY_TOPIC: 'offline-do-not-log', DISPATCH_DRY_RUN: '' },
      });
      expect(readFileSync(outputPath, 'utf8')).toBe('dry_run=1\n');
      expect(output).not.toContain('offline-do-not-log');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});