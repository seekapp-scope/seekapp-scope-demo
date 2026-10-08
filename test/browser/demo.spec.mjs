import { test, expect } from '@playwright/test';
import { result, review } from '../fixtures.mjs';

// These mocks run only in automated tests. Production never serves fake drafts.
async function mockLive(page, error = null) {
 await page.route('**/api/scope/config',r=>r.fulfill({json:{enabled:true,siteKey:'test-only',sourceUrl:''}}));
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*',r=>r.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(s,o)=>{document.querySelector(s).textContent='Test-only security verification';o.callback('test-only-token');return 1;},reset:()=>{}};window.seekAppTurnstileReady();`}));
 await page.route('**/api/scope',r=>r.fulfill(error ? {status:502,json:{error}} : {json:{result,provenance:{model:'test-fixture-not-live',generatedAt:'2026-10-08T00:00:00Z',requestId:'test-only-request'}}}));
}
test('disabled Worker serves the real page, assets, legal pages and no fake live result',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/demo');await expect(page.locator('#availability')).toContainText('not enabled');
 await page.selectOption('#example','missing');await expect(page.locator('#brief')).toHaveValue(/salon/);
 await expect(page.locator('#analyze')).toBeDisabled();await expect(page.locator('#result')).toBeHidden();
 await expect(page.locator('#language')).toHaveCount(0);await expect(page.locator('#input-title')).toHaveText('Start with the brief');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Demo privacy'}).click();await expect(page.locator('h1')).toHaveText('Demo privacy');
 expect(errors).toEqual([]);
});
test('live UI accepts a fresh brief, edits and downloads the resulting Markdown',async({page})=>{
 await mockLive(page);await page.goto('/demo');await expect(page.locator('#availability')).toContainText('available');
 await page.selectOption('#example','missing');await page.locator('#consent').check();await expect(page.locator('#analyze')).toBeEnabled();
 let body;page.on('request',r=>{if(r.url().endsWith('/api/scope'))body=r.postDataJSON();});
 await page.locator('#analyze').click();await expect(page.locator('#result')).toBeVisible();
 expect(body.brief).toContain('salon');expect(body.consent).toBe(true);expect(body.language).toBe('en');
 await expect(page.locator('#output-questions')).toHaveValue(/deposits/);await expect(page.locator('#provenance')).toContainText('test-fixture-not-live');
 await page.locator('#output-proposal').fill('Edited proposal for human review.');
 const download=page.waitForEvent('download');await page.locator('#download').click();const file=await download;expect(file.suggestedFilename()).toBe('seekapp-scope-proposal.md');
 const stream=await file.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();expect(text).toContain('Edited proposal for human review.');expect(text).toContain('Edited locally');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('upstream failure remains an error without a replacement sample result',async({page})=>{
 await mockLive(page,'incomplete');await page.goto('/demo');await page.selectOption('#example','conflict');await page.locator('#consent').check();await page.locator('#analyze').click();
 await expect(page.locator('#status')).toContainText('complete draft');await expect(page.locator('#result')).toBeHidden();
});
test('clarification updates draft; check uses current edits and becomes stale after editing',async({page})=>{
 await mockLive(page);
 const requests=[];
 await page.route('**/api/scope',r=>{
  const body=r.request().postDataJSON();requests.push(body);
  const updated=structuredClone(result);updated.scope.confirmed.push('No online payments or deposits.');updated.questions=['Who supplies content?'];
  return r.fulfill({json:{action:body.action,...(body.action==='review'?{review}:{result:body.action==='refine'?updated:result}),provenance:{model:'test-fixture-not-live',generatedAt:'2026-10-09T00:00:00Z',requestId:'workflow-test'}}});
 });
 await page.goto('/demo');
 await expect(page.locator('#turnstile')).toContainText('Test-only security verification');
 // Provide a fresh verification token after every simulated single-use check.
 await page.evaluate(()=>{const render=window.turnstile.render;window.turnstile.render=(s,o)=>{window.testVerification=o.callback;return render(s,o);};window.seekAppTurnstileReady();window.turnstile.reset=()=>window.testVerification('next-test-only-token');});
 await page.selectOption('#example','missing');await page.locator('#consent').check();await page.locator('#analyze').click();await expect(page.locator('#result')).toBeVisible();
 await expect(page.locator('#refine')).toBeDisabled();await page.locator('#answer-0').fill('No, no online payments or deposits.');await page.locator('#refine').click();
 await expect(page.locator('#output-confirmed')).toHaveValue(/No online payments/);expect(requests[1].answers[0].answer).toContain('no online payments');
 await page.locator('#output-proposal').fill('We guarantee delivery tomorrow.');await page.locator('#review').click();await expect(page.locator('#review-report')).toBeVisible();
 expect(requests[2].draft.proposal).toBe('We guarantee delivery tomorrow.');expect(requests[2].answers[0].answer).toContain('no online payments');await expect(page.locator('#review-report')).toContainText('Tomorrow delivery');
 await page.locator('#output-proposal').fill('Delivery date remains to be agreed.');await expect(page.locator('#review-report')).toBeHidden();await expect(page.locator('#status')).toContainText('changed');
 await page.locator('#brief').fill('A different client wants a new website with no connection to the previous brief.');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#review')).toBeDisabled();
});
