// Launch an installed Chromium-family browser through playwright-core.
// Order: Edge (channel), Chrome (channel), then known Edge/Chrome paths.
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export async function launchBrowser(opts = {}) {
  const base = { headless: true, ...opts };
  const errors = [];
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ ...base, channel });
    } catch (e) {
      errors.push(`${channel}: ${String(e.message).split('\n')[0]}`);
    }
  }
  for (const executablePath of CANDIDATES) {
    if (!fs.existsSync(executablePath)) continue;
    try {
      return await chromium.launch({ ...base, executablePath });
    } catch (e) {
      errors.push(`${executablePath}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error('No Chromium-family browser could be launched.\n  ' + errors.join('\n  '));
}
