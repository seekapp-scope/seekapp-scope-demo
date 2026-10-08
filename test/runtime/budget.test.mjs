import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';

test('real SQLite Durable Object admits two concurrent calls and enforces daily cap', async () => {
 const mf = new Miniflare(convertV4MiniflareOptions({
  name:'budget-test', modules:true,
  scriptPath:fileURLToPath(new URL('../../.build/index.js',import.meta.url)),
  compatibilityDate:'2026-10-08',
  durableObjects:{BUDGET:{className:'DemoBudget',useSQLite:true}},
  bindings:{DAILY_LIMIT:'4',PER_IP_LIMIT:'3'}
 }));
 try {
  const ns=await mf.getDurableObjectNamespace('BUDGET','budget-test');const stub=ns.get(ns.idFromName('runtime-budget-check'));
  const call=async body=>(await stub.fetch('https://budget',{method:'POST',body:JSON.stringify(body)})).json();
  const values=await Promise.all([1,2,3].map(i=>call({action:'reserve',id:String(i),key:String(i).repeat(64)})));
  assert.equal(values.filter(v=>v.ok).length,2);assert.equal(values.filter(v=>v.reason==='busy').length,1);
  for(const i of [1,2])await call({action:'release',id:String(i)});
  for(const i of [4,5]){assert.equal((await call({action:'reserve',id:String(i),key:String(i).repeat(64)})).ok,true);await call({action:'release',id:String(i)});}
  assert.equal((await call({action:'reserve',id:'6',key:'6'.repeat(64)})).reason,'daily');
 } finally {await mf.dispose();}
});
