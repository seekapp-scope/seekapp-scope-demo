import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./test/browser', workers:1, reporter:'list',
 use:{ baseURL:'http://127.0.0.1:8787', browserName:'chromium', channel:'chrome', headless:true },
 webServer:{ command:'npm run dev', url:'http://127.0.0.1:8787/demo', timeout:60000, reuseExistingServer:false },
 projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]
});
