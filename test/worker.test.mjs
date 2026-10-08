import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { DemoBudget } from '../src/budget.mjs';
import { result } from './fixtures.mjs';

function harness(options = {}) {
  const calls = []; let admission = options.admission || { ok: true };
  const env = { LIVE_ENABLED:'true', ANTHROPIC_API_KEY:'test-key-not-real', ANTHROPIC_MODEL:'claude-sonnet-5-5', TURNSTILE_SITE_KEY:'test-site', TURNSTILE_SECRET_KEY:'test-secret', RATE_LIMIT_SALT:'test-only-salt', ALLOWED_ORIGINS:'https://demo.example', BUDGET:{ idFromName:() => 'test', get:() => ({ fetch:async (_, init) => { const value = JSON.parse(init.body); calls.push({ budget:value }); return Response.json(value.action === 'reserve' ? admission : { ok:true }); } }) }, ASSETS:{ fetch:async () => new Response('static') } };
  const fetcher = async (url, init) => {
    calls.push({ url, body:JSON.parse(init.body) });
    if (url.includes('siteverify')) return Response.json(options.verification || { success:true, hostname:'demo.example', action:'scope-demo' });
    if (options.throwApi) throw new DOMException('timeout', 'TimeoutError');
    if (options.status) return new Response('private upstream error and secret', { status:options.status });
    return Response.json({ model:'test-fixture-not-live', stop_reason:options.stop || 'end_turn', content:[{ type:'text', text:options.text ?? JSON.stringify(result) }], usage:{ input_tokens:120, output_tokens:80 } });
  };
  const input = { brief:'We need a salon booking website with three staff members.', language:'en', consent:true, turnstileToken:'test-token' };
  const req = (body = input, headers = {}, method = 'POST', path = '/api/scope') => new Request('https://demo.example'+path, { method, headers:{ Origin:'https://demo.example', 'Content-Type':'application/json', 'CF-Connecting-IP':'192.0.2.1', ...headers }, ...(method === 'POST' ? { body:typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  return { env, calls, input, req, worker:createWorker(fetcher) };
}
test('complete API pipeline sends brief to Claude, validates schema and releases lease', async () => {
  const h = harness(); const r = await h.worker.fetch(h.req(),h.env); const data = await r.json();
  assert.equal(r.status,200); assert.deepEqual(data.result,result); assert.equal(data.provenance.model,'test-fixture-not-live');
  const api = h.calls.find(c => c.url?.includes('anthropic'));
  assert.equal(api.body.max_tokens,2400); assert.equal(api.body.output_config.format.type,'json_schema'); assert.equal(JSON.parse(api.body.messages[0].content).client_brief,h.input.brief);
  const reservation = h.calls.find(c => c.budget?.action==='reserve').budget;
  assert.match(reservation.key,/^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(reservation).includes('192.0.2.1'));
  assert.equal(h.calls.at(-1).budget.action,'release'); assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('Vietnamese output selection reaches Claude as data',async () => {
  const h=harness(); await h.worker.fetch(h.req({...h.input,language:'vi'}),h.env);
  assert.equal(JSON.parse(h.calls.find(c=>c.url?.includes('anthropic')).body.messages[0].content).output_language,'Vietnamese');
  assert.equal(h.calls.find(c=>c.url?.includes('anthropic')).body.max_tokens,3600);
});
test('reject foreign origin and unsupported methods before any provider call',async () => {
  const h=harness();assert.equal((await h.worker.fetch(h.req(h.input,{Origin:'https://evil.example'}),h.env)).status,403);
  assert.equal((await h.worker.fetch(h.req(null,{},'GET'),h.env)).status,405);assert.equal(h.calls.length,0);
});
test('invalid input, missing consent and oversized/chunked bodies cannot incur Claude charges',async () => {
  const h=harness();
  for (const input of [{...h.input,consent:false},{...h.input,brief:'short'},{...h.input,brief:'a'.repeat(8001)},{...h.input,language:'xx'},null]) assert.equal((await h.worker.fetch(h.req(input),h.env)).status,400);
  assert.equal((await h.worker.fetch(h.req('{invalid'),h.env)).status,400);
  assert.equal((await h.worker.fetch(h.req('a'.repeat(40001)),h.env)).status,413);
  const req=new Request('https://demo.example/api/scope',{method:'POST',headers:{Origin:'https://demo.example','Content-Type':'application/json'},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(40001));c.close();}}),duplex:'half'});
  assert.equal((await h.worker.fetch(req,h.env)).status,413);assert.equal(h.calls.length,0);
});
test('disabled live mode is fail closed and config does not expose secrets',async () => {
  const h=harness();h.env.LIVE_ENABLED='false';assert.equal((await h.worker.fetch(h.req(),h.env)).status,503);
  const c=await h.worker.fetch(h.req(null,{},'GET','/api/scope/config'),h.env);const text=await c.text();assert.equal(JSON.parse(text).enabled,false);assert.ok(!text.includes('test-key'));assert.equal(h.calls.length,0);
});
test('invalid Turnstile hostname, action, success cannot reach Claude or budget',async () => {
  for (const verification of [{success:false},{success:true,hostname:'evil.example',action:'scope-demo'},{success:true,hostname:'demo.example',action:'other'}]) {
    const h=harness({verification});assert.equal((await h.worker.fetch(h.req(),h.env)).status,403);assert.equal(h.calls.length,1);
  }
});
test('exhausted budget denies generation without an Anthropic request',async () => {
  for(const reason of ['daily','rate','busy']) {const h=harness({admission:{ok:false,reason}});const r=await h.worker.fetch(h.req(),h.env);assert.equal(r.status,429);assert.equal((await r.json()).error,reason);assert.ok(!h.calls.some(c=>c.url?.includes('anthropic')));}
});
test('upstream errors, malformed output, truncation and timeouts show errors and release lease',async () => {
  for (const options of [{status:401},{text:'not JSON'},{text:'{}'},{stop:'max_tokens'},{throwApi:true}]) {
    const h=harness(options);const r=await h.worker.fetch(h.req(),h.env);assert.ok([502,504].includes(r.status));const text=await r.text();assert.ok(!text.includes('private upstream'));assert.ok(!text.includes('test-key'));assert.equal(h.calls.at(-1).budget.action,'release');
  }
});
function memoryStorage() {
 let value; let chain=Promise.resolve();
 return { transaction(fn) { const work=chain.then(()=>fn({get:async()=>structuredClone(value),put:async(_,v)=>{value=structuredClone(v);}}));chain=work.catch(()=>{});return work; } };
}
const callBudget=(b,body)=>b.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
test('shared budget atomically admits only two concurrent generations',async () => {
 const b=new DemoBudget({storage:memoryStorage()},{DAILY_LIMIT:'20',PER_IP_LIMIT:'3'});
 const values=await Promise.all([1,2,3,4].map(i=>callBudget(b,{action:'reserve',id:String(i),key:String(i).repeat(64)})));
 assert.equal(values.filter(v=>v.ok).length,2);assert.equal(values.filter(v=>v.reason==='busy').length,2);
 await callBudget(b,{action:'release',id:'1'});assert.equal((await callBudget(b,{action:'reserve',id:'5',key:'5'.repeat(64)})).ok,true);
});
test('daily cap and per-source cap remain consumed after lease release',async () => {
 const b=new DemoBudget({storage:memoryStorage()},{DAILY_LIMIT:'4',PER_IP_LIMIT:'3'});
 for(let i=0;i<3;i++){assert.equal((await callBudget(b,{action:'reserve',id:String(i),key:'a'.repeat(64)})).ok,true);await callBudget(b,{action:'release',id:String(i)});}
 assert.equal((await callBudget(b,{action:'reserve',id:'4',key:'a'.repeat(64)})).reason,'rate');
 assert.equal((await callBudget(b,{action:'reserve',id:'5',key:'b'.repeat(64)})).ok,true);await callBudget(b,{action:'release',id:'5'});
 assert.equal((await callBudget(b,{action:'reserve',id:'6',key:'c'.repeat(64)})).reason,'daily');
});
