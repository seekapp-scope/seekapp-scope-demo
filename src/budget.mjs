// One Durable Object serializes the budget across all Cloudflare locations.
// Reservations count even if an upstream call fails; no retry can exceed the cap.
export class DemoBudget {
  constructor(state, env) { this.storage = state.storage; this.env = env; }
  async fetch(request) {
    const body = await request.json();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const window = Math.floor(now / 600000);
    const dailyLimit = Math.min(100, Math.max(1, Number(this.env.DAILY_LIMIT) || 20));
    const perIpLimit = Math.min(10, Math.max(1, Number(this.env.PER_IP_LIMIT) || 3));
    const result = await this.storage.transaction(async txn => {
      let state = await txn.get('budget');
      if (!state || state.day !== day) state = { day, count: 0, window, ips: {}, leases: {} };
      if (state.window !== window) { state.window = window; state.ips = {}; }
      for (const [id, expiry] of Object.entries(state.leases)) if (expiry <= now) delete state.leases[id];
      if (body.action === 'release') {
        delete state.leases[body.id];
        await txn.put('budget', state);
        return { ok: true };
      }
      if (body.action !== 'reserve' || !/^[a-f0-9]{64}$/.test(body.key || '') || typeof body.id !== 'string') return { ok: false, reason: 'invalid' };
      if (state.count >= dailyLimit) return { ok: false, reason: 'daily' };
      if ((state.ips[body.key] || 0) >= perIpLimit) return { ok: false, reason: 'rate' };
      if (Object.keys(state.leases).length >= 2) return { ok: false, reason: 'busy' };
      state.count++;
      state.ips[body.key] = (state.ips[body.key] || 0) + 1;
      state.leases[body.id] = now + 90000;
      await txn.put('budget', state);
      return { ok: true };
    });
    return Response.json(result);
  }
}
