import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function resolveDryRun({ eventName, readiness, topic, dispatchDryRun } = {}) {
  const ready = readiness === 'true' && typeof topic === 'string' && topic.trim().length > 0;
  const permittedEvent = eventName === 'schedule' ||
    (eventName === 'workflow_dispatch' && dispatchDryRun === 'false');
  return ready && permittedEvent ? '0' : '1';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = resolveDryRun({
    eventName: process.env.ALERT_EVENT_NAME,
    readiness: process.env.LIVE_ALERTS_READY,
    topic: process.env.NTFY_TOPIC,
    dispatchDryRun: process.env.DISPATCH_DRY_RUN,
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(process.env.GITHUB_OUTPUT, `dry_run=${dryRun}\n`);
  console.log(dryRun === '1' ? 'Alert delivery disabled: dry-run.' : 'Alert delivery permitted by readiness gate.');
}