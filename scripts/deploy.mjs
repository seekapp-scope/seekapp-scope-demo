// Owner-authorized deployment helper. --check is read-only; --execute publishes.
// Credentials are read in memory and passed to Wrangler through env/stdin only.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = process.argv.includes('--execute');
if (!execute && !process.argv.includes('--check')) {
  console.error('Usage: node scripts/deploy.mjs --check | --execute');
  process.exit(2);
}
const account = '970e04c2f208851a9c256a2d0ddad5da';
const zone = '4b23068717b61c2a36e2411a90072929';
const name = 'seekapp-scope-demo';
const source = 'https://github.com/seekapp-scope/seekapp-scope-demo';
const widgetName = 'SeekApp Scope public demo';
const routePatterns = ['seekapp.net/demo*', 'seekapp.net/api/scope*'];
const configPath = path.join(root, 'wrangler.production.jsonc');
const secrets = [];
let token;
function clean(text) {
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text;
}
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    // Do not print API response bodies: widget responses can contain secrets.
    throw new Error(`${method} ${endpoint}: HTTP ${response.status}; codes ${(data.errors || []).map(e => e.code).join(',')}`);
  }
  return data.result;
}
async function wrangler(args, input) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', configPath], {
      cwd: root, env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account,
        WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(root, '.wrangler/logs') },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => {
      console.log(clean(output).trim());
      if (code === 0) resolve(); else reject(new Error(`Wrangler ${args[0]} exited ${code}`));
    });
    child.stdin.end(input || '');
  });
}
async function publicCheck(origin, enabled) {
  for (const pathname of ['/demo', '/demo-assets/app.js', '/demo-assets/styles.css', '/demo-privacy', '/demo-terms']) {
    // New routes can briefly reach the old Pages origin while propagating.
    // Retry reads only, with a bounded window; never retry a paid POST.
    let response;
    for (let attempt = 0; attempt < 7; attempt++) {
      response = await fetch(origin + pathname, { signal: AbortSignal.timeout(20000) });
      if (![404, 503].includes(response.status) || attempt === 6) break;
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (response.status !== 200) throw new Error(`${origin}${pathname}: HTTP ${response.status}`);
    const body = await response.text();
    if (secrets.some(secret => body.includes(secret))) throw new Error('Credential found in public response');
  }
  const response = await fetch(origin + '/api/scope/config', { signal: AbortSignal.timeout(20000) });
  const config = await response.json();
  if (response.status !== 200 || config.enabled !== enabled || config.sourceUrl !== source) {
    throw new Error(`Public config did not match at ${origin}`);
  }
  const method = await fetch(origin + '/api/scope');
  if (method.status !== 405) throw new Error('API method guard failed');
  const foreign = await fetch(origin + '/api/scope', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  if (foreign.status !== 403) throw new Error('API origin guard failed');
  console.log(`Public static/config/method/origin checks passed: ${origin}`);
}
try {
  const envText = await readFile(path.join(root, '../seekapp-scope/.env.cloudflare'), 'utf8');
  token = envText.match(/^\s*CLOUDFLARE_API_TOKEN\s*=\s*(.+)\s*$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  if (!token) throw new Error('Missing CLOUDFLARE_API_TOKEN in the existing ignored credential file');
  secrets.push(token);
  const routes = await api(`zones/${zone}/workers/routes`);
  const scripts = await api(`accounts/${account}/workers/scripts`);
  const widgets = await api(`accounts/${account}/challenges/widgets`);
  const subdomain = await api(`accounts/${account}/workers/subdomain`);
  const preview = `https://${name}.${subdomain.subdomain}.workers.dev`;
  for (const pattern of routePatterns) {
    const collision = routes.find(route => route.pattern === pattern && route.script !== name);
    if (collision) throw new Error(`Existing route ${pattern} belongs to another Worker; no changes made`);
  }
  if (scripts.some(script => script.id === name)) {
    const settings = await api(`accounts/${account}/workers/scripts/${name}/settings`);
    if (!settings.bindings?.some(binding => binding.name === 'SOURCE_URL' && binding.text === source)) {
      throw new Error('An existing Worker does not identify this repository; no changes made');
    }
    if (execute && settings.bindings?.some(binding => binding.name === 'LIVE_ENABLED' && binding.text === 'true')) {
      throw new Error('This Worker is already live. Inspect its deployment instead of repeating initial setup');
    }
  }
  console.log(`Account, routes, Workers and Turnstile readable. Target: ${preview}`);
  if (!execute) {
    console.log('Read-only check complete. This invocation does not probe write permissions.');
    process.exit(0);
  }
  const keyText = await readFile(path.join(root, '../seekapp-scope/api.txt'), 'utf8');
  const anthropicKey = keyText.match(/sk-ant-[A-Za-z0-9_-]+/)?.[0];
  if (!anthropicKey) throw new Error('Missing Anthropic key in the owner-authorized key file');
  secrets.push(anthropicKey);
  const beforeHome = await fetch('https://seekapp.net/');
  if (beforeHome.status !== 200) throw new Error('Existing homepage is not HTTP 200; deployment held');
  const homeHash = createHash('sha256').update(await beforeHome.text()).digest('hex');
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  config.account_id = account;
  config.vars.ALLOWED_ORIGINS = `https://seekapp.net,${preview}`;
  config.vars.LIVE_ENABLED = 'false';
  config.vars.SOURCE_URL = source;
  const saveConfig = () => writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  await saveConfig();
  await wrangler(['deploy']); // Initially disabled; no main-domain routes yet.
  let widget = widgets.find(item => item.name === widgetName);
  if (widget) {
    widget = await api(`accounts/${account}/challenges/widgets/${widget.sitekey}`);
    if (!['seekapp.net', new URL(preview).hostname].every(host => widget.domains.includes(host))) {
      throw new Error('Existing demo widget has different hosts; review it before changing it');
    }
  } else {
    widget = await api(`accounts/${account}/challenges/widgets`, 'POST', {
      name: widgetName, mode: 'managed', domains: ['seekapp.net', new URL(preview).hostname]
    });
  }
  if (!widget.secret || !widget.sitekey) throw new Error('Turnstile widget did not provide server and public keys');
  secrets.push(widget.secret);
  config.vars.TURNSTILE_SITE_KEY = widget.sitekey;
  await saveConfig();
  // Reuse a persisted rate salt on subsequent deployments; never reset limits inadvertently.
  const currentSecrets = await api(`accounts/${account}/workers/scripts/${name}/secrets`);
  const newSecrets = { ANTHROPIC_API_KEY: anthropicKey, TURNSTILE_SECRET_KEY: widget.secret };
  if (!currentSecrets.some(item => item.name === 'RATE_LIMIT_SALT')) {
    newSecrets.RATE_LIMIT_SALT = randomBytes(32).toString('hex');
    secrets.push(newSecrets.RATE_LIMIT_SALT);
  }
  await wrangler(['secret', 'bulk'], JSON.stringify(newSecrets));
  config.vars.LIVE_ENABLED = 'true';
  await saveConfig();
  await wrangler(['deploy']);
  await publicCheck(preview, true);
  config.routes = routePatterns.map(pattern => ({ pattern, zone_id: zone }));
  await saveConfig();
  await wrangler(['deploy']);
  await publicCheck('https://seekapp.net', true);
  const afterHome = await fetch('https://seekapp.net/');
  const afterHash = createHash('sha256').update(await afterHome.text()).digest('hex');
  const receipt = { timestamp: new Date().toISOString(), source, demo: 'https://seekapp.net/demo', preview,
    routePatterns, homepageStatus: afterHome.status, homepageBytesUnchanged: homeHash === afterHash,
    publicStaticAndGuards: 'passed', realBrowserTurnstileToClaude: 'not yet checked' };
  await mkdir(path.join(root, '.wrangler'), { recursive: true });
  await writeFile(path.join(root, '.wrangler/deployment-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(clean(error.message));
  process.exitCode = 1;
}
