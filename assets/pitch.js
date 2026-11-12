// Pitch page: shows orders placed in the sample menu (same-origin iframe) on a "kitchen screen", via demo-shim's BroadcastChannel.
(() => {
  const slug = document.currentScript.dataset.slug;
  const box = document.getElementById('tickets');
  if (!('BroadcastChannel' in window) || !box) return;
  const money = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const label = { placed: 'New', accepted: 'Cooking', ready: 'Ready', served: 'Served', awaiting_payment: 'Awaiting payment' };
  const REQ = { water: '💧 Table 3 wants water', bill: '🧾 Table 3 asked for the bill', waiter: '🙋 Table 3 is calling a waiter' };
  const notes = [];
  let audio;
  const ring = () => { // two-tone ping; skipped silently if the browser blocks audio
    try {
      audio ||= new AudioContext();
      [880, 1320].forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.connect(g).connect(audio.destination);
        const t = audio.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.start(t); o.stop(t + 0.32);
      });
    } catch { /* no audio */ }
  };
  new BroadcastChannel(`ila-demo-${slug}`).onmessage = ({ data: m }) => {
    if (m.kind === 'request') notes.unshift(REQ[m.req] || REQ.waiter);
    if (m.kind === 'payment') notes.unshift(m.method === 'demo' ? `✅ Table 3 paid ${money(m.amount)} by UPI` : `💵 Table 3 will pay ${money(m.amount)} at the counter`);
    if (m.kind === 'order' || m.kind === 'request') ring();
    const orders = (m.tab?.orders || []).slice().reverse();
    box.innerHTML = notes.slice(0, 3).map(t => `<div class="ticket req">${esc(t)}</div>`).join('') + orders.map(o => `
      <div class="ticket${m.kind === 'order' && o.id === m.order ? ' new' : ''}">
        <div class="t"><span>#${o.no} · Table 3</span><span class="pill ${o.status}">${label[o.status] || o.status}</span></div>
        <ul>${o.lines.map(l => `<li>${l.qty} × ${esc(l.name)}</li>`).join('')}</ul>
        ${o.note ? `<div class="nt">“${esc(o.note)}”</div>` : ''}
        <div class="sum">${money(o.total)}${o.paid ? ' · paid' : ''}</div>
      </div>`).join('');
  };
})();
