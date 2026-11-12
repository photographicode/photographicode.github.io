// Demo mode for static sample menus (GitHub Pages): answers the guest app's API calls in the browser,
// so the real menu.js runs unchanged with no server. Data comes from window.DEMO = { hotel, menu }.
// Orders are broadcast on BroadcastChannel('ila-demo-<slug>') so the pitch page's kitchen screen can show them.
(() => {
  const D = window.DEMO;
  const base = `/api/public/${D.hotel.slug}`;
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel(`ila-demo-${D.hotel.slug}`) : null;
  const items = new Map(D.menu.flatMap(c => c.items).map(i => [i.id, i]));
  const streams = new Set();
  let tab = null, orderNo = 0;
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' '); // server sends SQLite UTC 'YYYY-MM-DD HH:MM:SS'

  const sum = os => os.reduce((s, o) => s + o.total, 0);
  const view = () => {
    if (!tab) return null;
    const live = tab.orders.filter(o => o.status !== 'cancelled');
    const claimed = new Set(tab.payments.filter(p => p.status === 'claimed').flatMap(p => p.order_ids));
    return { ...tab, total: sum(live), paid: sum(live.filter(o => o.paid)), due: sum(live.filter(o => !o.paid && !claimed.has(o.id))) };
  };
  const notify = (kind, extra = {}) => {
    for (const s of streams) s.onmessage?.({ data: kind });
    ch?.postMessage({ kind, tab: view(), ...extra });
  };
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (msg, status = 400) => json({ error: msg }, status);

  function order(body) {
    const lines = [];
    for (const l of body.items || []) {
      const it = items.get(+l.id);
      if (!it || !it.available) return fail('Sorry, one of the dishes just sold out.', 409);
      lines.push({ id: it.id, name: it.name, price: it.price, qty: Math.max(1, Math.min(50, Math.floor(+l.qty) || 1)), veg: it.veg });
    }
    if (!lines.length) return fail('Your cart is empty');
    const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const tax = Math.round(sub * D.hotel.settings.tax_pct / 100);
    tab ||= { id: 1, status: 'open', opened_at: now(), table_id: 3, orders: [], payments: [] };
    const o = { id: ++orderNo, no: orderNo, status: 'placed', lines, note: String(body.note || '').slice(0, 300), subtotal: sub, tax, total: sub + tax, paid: 0, created_at: now() };
    tab.orders.push(o);
    // The "kitchen" accepts and finishes the order on its own so the guest sees live status changes.
    setTimeout(() => { if (o.status === 'placed') { o.status = 'accepted'; notify('status', { order: o.id }); } }, 6000);
    setTimeout(() => { if (o.status === 'accepted') { o.status = 'ready'; notify('status', { order: o.id }); } }, 16000);
    notify('order', { order: o.id });
    return json({ orderId: o.id, tabId: tab.id, no: o.no, status: o.status });
  }

  function pay(body) {
    if (!tab) return fail('Nothing to pay');
    let os = tab.orders.filter(o => !o.paid && o.status !== 'cancelled');
    if (body.orderId) os = os.filter(o => o.id === +body.orderId);
    if (!os.length) return fail('Nothing left to pay');
    const paid = body.method === 'demo';
    tab.payments.push({ id: tab.payments.length + 1, amount: sum(os), method: body.method, status: paid ? 'paid' : 'claimed', order_ids: os.map(o => o.id), created_at: now() });
    if (paid) os.forEach(o => { o.paid = 1; });
    if (tab.orders.every(o => o.paid || o.status === 'cancelled')) tab.status = 'closed';
    notify('payment', { method: body.method, amount: sum(os) });
    return json({ ok: true, status: paid ? 'paid' : 'claimed' });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt = {}) => {
    const u = new URL(url, location.href);
    if (!u.pathname.startsWith(base)) return realFetch(url, opt);
    const p = u.pathname.slice(base.length);
    const body = opt.body ? JSON.parse(opt.body) : {};
    await new Promise(r => setTimeout(r, 150)); // feel like a network call
    if (p === '') return json(D);
    if (p.startsWith('/table/')) return json({ table: { label: 'Table 3' }, tab: view() });
    if (p.startsWith('/tab/')) return json({ tab: view() });
    if (p === '/order') return order(body);
    if (p === '/pay') return pay(body);
    if (p === '/request') { notify('request', { req: body.kind }); return json({ ok: true }); }
    return fail('Not available in the sample', 404);
  };
  window.EventSource = class { constructor() { streams.add(this); } close() { streams.delete(this); } };

  // Opened directly (owner scanned the QR): say what this is and how to get it.
  if (window.top === window) addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('a');
    b.href = '../';
    b.textContent = `Sample menu made for ${D.hotel.name} · see the offer →`;
    b.style.cssText = 'display:block;text-align:center;font:600 13px/1.2 system-ui,sans-serif;padding:9px 12px;background:#111;color:#fff;text-decoration:none';
    document.body.prepend(b);
  });
})();
