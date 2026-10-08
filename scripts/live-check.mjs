import { readFile, writeFile } from 'node:fs/promises';
import { createWorker } from '../src/worker.mjs';
import { DemoBudget } from '../src/budget.mjs';

// Explicit paid-only entrypoint; never invoked by npm test or browser tests.
const args = process.argv.slice(2);
if (!args.includes('--allow-paid') || !args.includes('--key-file')) throw new Error('Requires --allow-paid --key-file <path>. At most three Claude calls; no retries.');
const keyPath = args[args.indexOf('--key-file') + 1];
const secretText = await readFile(keyPath, 'utf8');
const keys = secretText.match(/sk-ant-[A-Za-z0-9_-]+/g) || [];
if (keys.length !== 1) throw new Error('Expected one Anthropic API key in the specified file; contents omitted.');
const apiKey = keys[0];
const requested = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const modelsResponse = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers:{ 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' }, signal:AbortSignal.timeout(15000) });
if (!modelsResponse.ok) throw new Error(`Model access check failed: HTTP ${modelsResponse.status}. Credential omitted.`);
const available = (await modelsResponse.json()).data.map(m => m.id);
const model = available.includes(requested) ? requested : available.includes('claude-sonnet-4-6') ? 'claude-sonnet-4-6' : available.find(m => m.startsWith('claude-sonnet-'));
if (!model) throw new Error('No Sonnet model returned by the account model listing.');

let cases = [
 { id:'clear-agency', language:'en', brief:'Our small design agency needs a five-page website: Home, Services, Work, About and Contact. We will provide approved copy, brand assets and six case studies. The site should work on mobile, allow our team to edit case studies, and send contact enquiries to our company email. We do not need online payments, customer accounts or a blog. We have not agreed a budget or delivery date.' },
 { id:'missing-booking', language:'en', brief:'We need a website for our local salon so customers can book appointments. It should look good on mobile. We have three staff members and different services. We want to launch soon. We have not decided whether bookings need payment, how cancellations work, or who will provide the content.' },
 { id:'conflicting-shop-vi', language:'vi', brief:'Làm cửa hàng online có giỏ hàng, thanh toán, tài khoản khách và lịch sử mua hàng. Không muốn lưu dữ liệu khách hàng ở bất cứ đâu. Toàn bộ website phải ra mắt ngày mai nhưng danh sách sản phẩm, giá, ảnh và nội dung đến tuần sau mới có. Chưa chọn cổng thanh toán và chưa thống nhất ngân sách.' }
];
const workflow = args.includes('--workflow');
if (workflow) {
 const previous = JSON.parse(await readFile(new URL('../validation/live-results.json',import.meta.url),'utf8'));
 const base = previous.cases.find(c => c.id === 'missing-booking' && c.demoStatus === 200);
 if (!base) throw new Error('The workflow check needs the successful real missing-booking receipt.');
 const answers = [
  { question:base.output.questions.find(q=>q.toLowerCase().includes('payment')) || 'Should customers pay or leave a deposit?', answer:'No online payments or deposits. Customers pay at the salon.' },
  { question:base.output.questions.find(q=>q.toLowerCase().includes('cancellation')) || 'What is the cancellation policy?', answer:'Customers may cancel or reschedule up to 24 hours before the appointment.' },
  { question:base.output.questions.find(q=>q.toLowerCase().includes('content')) || 'Who will provide content?', answer:'The salon owner supplies and approves all text, service prices, photos and opening hours.' }
 ];
 cases = [{id:'refine-booking',action:'refine',language:'en',brief:base.brief,draft:base.output,answers},
  {id:'review-unsupported-promise',action:'review',language:'en',brief:base.brief,answers}];
}
const onlyCase = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
if (onlyCase && !cases.some(c => c.id === onlyCase)) throw new Error('Unknown --case.');
let stored; let chain = Promise.resolve();
const storage = { transaction(fn) { const work = chain.then(() => fn({ get:async () => structuredClone(stored), put:async (_, value) => { stored=structuredClone(value); } })); chain=work.catch(()=>{}); return work; } };
const budget = new DemoBudget({ storage }, { DAILY_LIMIT:'3', PER_IP_LIMIT:'3' });
const env = {
 LIVE_ENABLED:'true', ANTHROPIC_API_KEY:apiKey, ANTHROPIC_MODEL:model,
 TURNSTILE_SITE_KEY:'local-test-only', TURNSTILE_SECRET_KEY:'local-test-only', RATE_LIMIT_SALT:crypto.randomUUID(),
 ALLOWED_ORIGINS:'https://local-demo.example',
 BUDGET:{ idFromName:() => 'local', get:() => ({ fetch:(url,init) => budget.fetch(new Request(url,init)) }) }
};
const receipt = { testedAt:new Date().toISOString(), requestedModel:requested, actualModel:model, maxPaidRequests:3, provider:'Anthropic live API', scope:'Production Worker handler and real Claude; Siteverify transport mocked only in this local script, budget class uses in-memory storage. Public Turnstile and deployment not tested.', cases:[] };
const file = new URL(workflow ? (onlyCase ? '../validation/live-workflow-review-retry.json' : '../validation/live-workflow-results.json') : onlyCase ? '../validation/live-retry-results.json' : '../validation/live-results.json',import.meta.url);
let current;
const worker = createWorker(async (url, init) => {
 if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success:true, hostname:'local-demo.example', action:'scope-demo' });
 if (url !== 'https://api.anthropic.com/v1/messages') throw new Error('Unexpected outbound request');
 const response = await fetch(url,init);
 current.providerStatus = response.status;
 current.providerRequestId = response.headers.get('request-id');
 if (response.ok) {
  const metadata = await response.clone().json();
  current.providerStopReason=metadata.stop_reason;
  current.providerUsage=metadata.usage;
 }
 if (!response.ok) {
  try { current.providerErrorType=(await response.clone().json()).error?.type || 'unknown'; } catch { current.providerErrorType='unclassified'; }
 }
 return response;
});
for (const item of cases.filter(c => !onlyCase || c.id === onlyCase)) {
 if(workflow && item.action==='review') {
  const source = receipt.cases[0]?.output || JSON.parse(await readFile(new URL('../validation/live-workflow-results.json',import.meta.url),'utf8')).cases.find(c=>c.action==='refine').output;
  item.draft=structuredClone(source);
  item.draft.proposal+='\n\nWe guarantee a complete launch tomorrow for $99.';
 }
 current={...item}; const start=performance.now();
 const request = new Request('https://local-demo.example/api/scope', { method:'POST', headers:{ Origin:'https://local-demo.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1' }, body:JSON.stringify({ action:item.action || 'generate', brief:item.brief, language:item.language, answers:item.answers, draft:item.draft, consent:true, turnstileToken:'local-test-only' }) });
 const response=await worker.fetch(request,env);
 current.demoStatus=response.status; current.elapsedMs=Math.round(performance.now()-start);
 const data=await response.json();
 if (response.ok) { current.output=data.result || data.review; current.provenance=data.provenance; current.usage=data.usage; }
 else { current.error=data.error; current.stopReason=data.stopReason; }
 receipt.cases.push(current);
 await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({ case:item.id, model, providerStatus:current.providerStatus, demoStatus:current.demoStatus, elapsedMs:current.elapsedMs, usage:current.usage, error:current.error, providerErrorType:current.providerErrorType }));
 if (!response.ok) { process.exitCode=1; break; }
}
