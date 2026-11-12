// Guest menu: browse, cart, order, track status, pay, call waiter.
import { $, $$, esc, money, api, toast, applyTheme, safely, clock } from './ui.js';

const slug = $('meta[name=hotel]').content;
const params = new URLSearchParams(location.search);
const token = params.get('t');
const cartKey = `ila:cart:${slug}:${token}`;
let H, MENU = [], TABLE = null, TAB = null, es = null, lastStatus = {};
let cart = JSON.parse(localStorage.getItem(cartKey) || '{}'); // itemId -> qty
const filter = { q: '', veg: false };

const STATUS = {
  awaiting_payment: ['Awaiting payment', 'amber'], placed: ['Sent to kitchen', 'blue'], accepted: ['Preparing', 'amber'],
  ready: ['Ready, coming to you', 'green'], served: ['Served', 'grey'], cancelled: ['Cancelled', 'red'],
};
const items = () => MENU.flatMap(c => c.items);
const itemById = id => items().find(i => i.id === +id);
const canOrder = () => !!(token && TABLE && H.settings.ordering && H.settings.accepting);
const saveCart = () => localStorage.setItem(cartKey, JSON.stringify(cart));

async function load() {
  try {
    const d = await api(`/api/public/${slug}`);
    H = d.hotel; MENU = d.menu;
  } catch (e) {
    document.body.innerHTML = `<div class="closed"><div><h1>${esc(e.message)}</h1><p class="muted">Please ask a staff member for help.</p></div></div>`;
    return;
  }
  const th = applyTheme(H.theme);
  document.body.dataset.layout = th.layout || 'list';
  if (token) {
    try { const t = await api(`/api/public/${slug}/table/${encodeURIComponent(token)}`); TABLE = t.table; setTab(t.tab); }
    catch (e) { toast(e.message, 'err'); }
  }
  // drop cart lines that no longer exist / sold out
  for (const id of Object.keys(cart)) if (!itemById(id)?.available) delete cart[id];
  saveCart();
  renderHero(); renderNotice(); renderChips(); renderList(); renderDock();
}

function renderHero() {
  const p = H.profile;
  const hero = $('#hero');
  hero.classList.toggle('has-cover', !!p.cover);
  hero.innerHTML = `${p.cover ? `<img class="cover" src="${esc(p.cover)}" alt="">` : ''}
    <div class="in">
      ${p.logo ? `<img class="logo" src="${esc(p.logo)}" alt="${esc(H.name)} logo">` : ''}
      <div><h1>${esc(H.name)}</h1>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ''}</div>
      ${TABLE ? `<span class="table">${esc(TABLE.label)}</span>` : ''}
    </div>`;
  document.title = `${H.name} · Menu`;
  $('#foot').innerHTML = `${p.address ? esc(p.address) + '<br>' : ''}${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a> · ` : ''}<a href="${esc(H.url)}">About us</a>
    <br><span>${H.settings.tax_pct ? `GST ${H.settings.tax_pct}% is added at checkout` : 'Prices include all taxes'}</span>
    <br><br>Menu by <a href="/">Photographicode</a>`;
}
function renderNotice() {
  const n = $('#notice');
  const msg = !H.settings.ordering ? '' : !token ? 'You are viewing the menu. To order, scan the QR code on your table.'
    : !TABLE ? 'This table link is not valid. Please scan the QR code on your table again.'
    : !H.settings.accepting ? 'The kitchen is not taking orders from the app right now. Please call a waiter.' : '';
  n.hidden = !msg; n.textContent = msg;
}

function visibleCats() {
  const qq = filter.q.toLowerCase();
  return MENU.map(c => ({ ...c, items: c.items.filter(i => (!filter.veg || i.veg) && (!qq || `${i.name} ${i.description}`.toLowerCase().includes(qq))) }))
    .filter(c => c.items.length);
}
function renderChips() {
  $('#chips').innerHTML = visibleCats().map(c => `<button data-go="${c.id}">${esc(c.name)}</button>`).join('');
}
function control(i) {
  if (!i.available) return '<span class="badge grey soldout">Sold out</span>';
  if (!canOrder()) return '';
  const n = cart[i.id] || 0;
  return n ? `<div class="step" role="group" aria-label="Quantity of ${esc(i.name)}"><button data-dec="${i.id}" aria-label="Remove one">−</button><span>${n}</span><button data-inc="${i.id}" aria-label="Add one">+</button></div>`
    : `<button class="add" data-inc="${i.id}" aria-label="Add ${esc(i.name)}">ADD</button>`;
}
function itemHtml(i) {
  return `<article class="item${i.available ? '' : ' out'}" data-item="${i.id}">
    <div>
      <div class="tags"><span class="veg${i.veg ? '' : ' non'}" title="${i.veg ? 'Veg' : 'Non-veg'}" role="img" aria-label="${i.veg ? 'Veg' : 'Non-veg'}"></span>
        ${i.bestseller ? '<span class="tag">★ Bestseller</span>' : ''}${i.spicy ? '<span class="tag">🌶 Spicy</span>' : ''}</div>
      <h3>${esc(i.name)}</h3>
      <div class="price">${money(i.price)}</div>
      ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ''}
    </div>
    <div class="pic">${i.photo ? `<img src="${esc(i.photo)}" alt="${esc(i.name)}" loading="lazy">` : `<div class="ph" aria-hidden="true">${esc(i.name.trim()[0] || '•')}</div>`}${control(i)}</div>
  </article>`;
}
function renderList() {
  const cats = visibleCats();
  $('#list').innerHTML = cats.length ? cats.map(c => `<section class="cat" id="c${c.id}"><h2>${esc(c.name)} <small>${c.items.length}</small></h2>
      <div class="items">${c.items.map(itemHtml).join('')}</div></section>`).join('')
    : '<p class="empty">No dishes match your search.</p>';
  spy();
}
function refreshItem(id) {
  const el = $(`[data-item="${id}"] .pic`);
  if (!el) return;
  el.querySelector('.add,.step')?.remove();
  el.insertAdjacentHTML('beforeend', control(itemById(id)));
}
let observer;
function spy() {
  observer?.disconnect();
  observer = new IntersectionObserver(es => {
    const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return;
    $$('#chips button').forEach(b => b.classList.toggle('on', 'c' + b.dataset.go === vis.target.id));
    $('#chips button.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, { rootMargin: '-70px 0px -60% 0px' });
  $$('section.cat').forEach(s => observer.observe(s));
}

// ---------- cart ----------
function cartLines() {
  return Object.entries(cart).map(([id, qty]) => ({ item: itemById(id), qty })).filter(l => l.item);
}
function totals(sub) { const tax = Math.round(sub * H.settings.tax_pct / 100); return { sub, tax, total: sub + tax }; }
function change(id, d) {
  cart[id] = Math.max(0, Math.min(50, (cart[id] || 0) + d));
  if (!cart[id]) delete cart[id];
  saveCart(); refreshItem(id); renderDock();
  if (navigator.vibrate) navigator.vibrate(8);
}
function renderDock() {
  const lines = cartLines();
  const n = lines.reduce((s, l) => s + l.qty, 0);
  const bar = $('#cartBar');
  bar.hidden = !n || !canOrder();
  bar.innerHTML = `<span>${n} item${n > 1 ? 's' : ''} · ${money(lines.reduce((s, l) => s + l.qty * l.item.price, 0))}</span><span>View cart →</span>`;
  const tb = $('#tabBtn');
  const live = TAB?.orders.filter(o => o.status !== 'cancelled') || [];
  tb.hidden = !TAB || !live.length;
  if (live.length) {
    const pending = live.some(o => ['placed', 'accepted', 'ready', 'awaiting_payment'].includes(o.status));
    tb.innerHTML = `${pending ? '<span class="dot"></span>' : ''}Your table · ${live.length} order${live.length > 1 ? 's' : ''}${TAB.due ? ` · ${money(TAB.due)} due` : ''}`;
  }
}

// ---------- sheets ----------
const sheet = $('#sheet');
function open(html) { $('#sheetBody').innerHTML = html; if (!sheet.open) sheet.showModal(); }
const close = () => sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
const head = title => `<div class="dlg-head"><h2>${title}</h2><button class="btn ghost sm" data-close aria-label="Close">✕</button></div>`;

function showCart() {
  const lines = cartLines();
  if (!lines.length) return close();
  const t = totals(lines.reduce((s, l) => s + l.qty * l.item.price, 0));
  const prepay = H.settings.payment_mode === 'prepay';
  open(`${head('Your cart')}
    <div>${lines.map(l => `<div class="line"><span class="veg${l.item.veg ? '' : ' non'}"></span><span class="nm">${esc(l.item.name)}<br><span class="muted small">${money(l.item.price)}</span></span>
      <div class="mini-step"><button data-cdec="${l.item.id}" aria-label="Remove one">−</button><span>${l.qty}</span><button data-cinc="${l.item.id}" aria-label="Add one">+</button></div>
      <strong>${money(l.qty * l.item.price)}</strong></div>`).join('')}</div>
    <label>Cooking instructions (optional)<textarea id="note" maxlength="300" placeholder="Less spicy, no onion, extra gravy…"></textarea></label>
    <div class="totals"><div><span>Item total</span><span>${money(t.sub)}</span></div>
      ${t.tax ? `<div><span>GST (${H.settings.tax_pct}%)</span><span>${money(t.tax)}</span></div>` : ''}
      <div class="grand"><span>To pay</span><span>${money(t.total)}</span></div></div>
    <button class="btn primary block" id="place" style="min-height:52px">${prepay ? `Place order & pay ${money(t.total)}` : `Send order to kitchen`}</button>
    <p class="muted small" style="text-align:center;margin:0">${prepay ? 'This restaurant takes payment before preparing your food.' : 'Order more any time. Pay once at the end.'}</p>`);
}
const placeOrder = safely(async btn => {
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await api(`/api/public/${slug}/order`, { body: { table: token, note: $('#note')?.value, items: cartLines().map(l => ({ id: l.item.id, qty: l.qty })) } });
    cart = {}; saveCart(); renderList();
    await refreshTab(r.tabId);
    if (r.status === 'awaiting_payment') showPay(r.orderId);
    else { toast(`Order #${r.no} sent to the kitchen`); showTab(); }
  } finally { btn.disabled = false; }
});

function showTab() {
  if (!TAB) return close();
  if (TAB.status === 'closed') return showThanks();
  const s = H.settings;
  const prepay = s.payment_mode === 'prepay';
  const waiting = TAB.payments.filter(p => p.status === 'claimed');
  open(`${head(`${esc(TABLE.label)} · your orders`)}
    ${TAB.orders.slice().reverse().map(o => {
      const [label, color] = STATUS[o.status] || [o.status, 'grey'];
      return `<div class="order"><header><strong>Order #${o.no} <span class="muted small">${clock(o.created_at)}</span></strong>
        <span class="badge ${color}">${label}</span></header>
        <ul>${o.lines.map(l => `<li><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.qty * l.price)}</span></li>`).join('')}</ul>
        <div class="row"><span class="muted small grow">${o.paid ? '✓ Paid' : o.status === 'cancelled' ? '' : 'Not paid yet'}</span><strong>${money(o.total)}</strong></div>
        ${prepay && !o.paid && o.status === 'awaiting_payment' && !waiting.some(p => p.order_ids.includes(o.id)) ? `<button class="btn primary" data-payorder="${o.id}">Pay ${money(o.total)}</button>` : ''}
      </div>`;
    }).join('')}
    ${waiting.length ? `<p class="notice" style="margin:0">⏳ Waiting for staff to confirm your ${waiting.map(p => p.method === 'cash' ? 'counter' : 'UPI').join(' & ')} payment of ${money(waiting.reduce((a, p) => a + p.amount, 0))}.</p>` : ''}
    <div class="totals"><div><span>Total</span><span>${money(TAB.total)}</span></div><div><span>Paid</span><span>${money(TAB.paid)}</span></div>
      <div class="grand"><span>Balance</span><span>${money(TAB.total - TAB.paid)}</span></div></div>
    <div class="actions">
      <button class="btn" data-req="waiter">🙋 Call waiter</button>
      <button class="btn" data-req="water">💧 Water</button>
      ${!prepay && TAB.due ? `<button class="btn" data-req="bill">🧾 Ask for bill</button><button class="btn primary" data-paytab>Pay ${money(TAB.due)}</button>` : ''}
    </div>
    <div class="actions"><a class="btn" href="${billUrl()}" target="_blank" rel="noopener">🧾 View / download bill</a><button class="btn" data-close>＋ Order more</button></div>`);
}
function showThanks() {
  const p = H.profile;
  open(`${head('Thank you!')}<div class="thanks"><div class="big">🙏</div><h2>All paid. Thank you for dining with us.</h2>
    <p class="muted">We hope to see you again at ${esc(H.name)}.</p>
    <div class="actions"><a class="btn" href="${billUrl()}" target="_blank" rel="noopener">🧾 Download bill (PDF)</a>
    ${p.review_url ? `<a class="btn primary" href="${esc(p.review_url)}" target="_blank" rel="noopener">★ Rate us on Google</a>` : ''}</div></div>`);
}
const billUrl = () => `${location.pathname.startsWith('/m/') ? `/b/${slug}` : '/bill'}?t=${encodeURIComponent(token)}&tab=${TAB.id}`;

function showPay(orderId) {
  const s = H.settings;
  const o = orderId && TAB?.orders.find(x => x.id === orderId);
  const amount = o ? o.total : TAB?.due;
  if (!amount) return showTab();
  const upi = s.upi_id && `upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.payee)}&am=${(amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${H.name} ${TABLE.label}`)}`;
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  open(`${head(`Pay ${money(amount)}`)}
    <div class="payopts" data-order="${orderId || ''}">
      ${s.razorpay ? `<button class="payopt" data-pm="razorpay"><span class="ic">💳</span><span>Pay online<small>UPI, cards, wallets, net banking (secure)</small></span></button>` : ''}
      ${upi ? (mobile ? `<a class="payopt" href="${esc(upi)}"><span class="ic">📱</span><span>Pay with any UPI app<small>GPay, PhonePe, Paytm, BHIM. Come back here after paying.</small></span></a>`
        : `<div class="payopt" style="display:grid;justify-items:center;cursor:default"><span>Scan with any UPI app</span><img class="upiqr" src="/api/qr.svg?text=${encodeURIComponent(upi)}" alt="UPI QR code"><span class="muted small">${esc(s.upi_id)}</span></div>`)
        + `<button class="btn primary" data-pm="upi">I've paid by UPI</button>` : ''}
      ${s.cash ? `<button class="payopt" data-pm="cash"><span class="ic">💵</span><span>Pay at counter / to waiter<small>Cash or card</small></span></button>` : ''}
      ${s.demo_pay ? `<button class="payopt" data-pm="demo"><span class="ic">🧪</span><span>Demo payment<small>Test mode: marks this paid instantly</small></span></button>` : ''}
    </div>`);
}
const pay = safely(async (method, orderId) => {
  const body = { table: token, method, orderId: orderId || undefined };
  if (method === 'razorpay') {
    const r = await api(`/api/public/${slug}/pay`, { body });
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    new window.Razorpay({
      key: r.key, order_id: r.rpOrder, amount: r.amount, currency: 'INR', name: r.name, description: TABLE.label,
      theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() },
      handler: safely(async resp => {
        await api(`/api/public/${slug}/pay/verify`, { body: { paymentId: r.paymentId, ...resp } });
        toast('Payment successful'); await refreshTab(); showTab();
      }),
    }).open();
    return;
  }
  const r = await api(`/api/public/${slug}/pay`, { body });
  toast(r.status === 'paid' ? 'Payment successful' : method === 'cash' ? 'A waiter will collect the payment' : 'Thanks! Staff will confirm your payment');
  await refreshTab(); showTab();
});
const loadScript = src => new Promise((ok, fail) => {
  if ($(`script[src="${src}"]`)) return ok();
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load payment page. Check your internet.'));
  document.head.append(s);
});

// ---------- live tab ----------
function setTab(tab) {
  if (tab) for (const o of tab.orders) {
    if (lastStatus[o.id] && lastStatus[o.id] !== o.status && o.status === 'ready') { toast(`Order #${o.no} is ready!`); navigator.vibrate?.([80, 40, 80]); }
    lastStatus[o.id] = o.status;
  }
  const changed = tab?.id !== TAB?.id;
  TAB = tab;
  if (changed) connect();
}
async function refreshTab(id = TAB?.id) {
  if (!id) return;
  const r = await api(`/api/public/${slug}/tab/${id}?table=${encodeURIComponent(token)}`);
  setTab(r.tab); renderDock();
  if (sheet.open && $('#sheetBody [data-close]') && $('#sheetBody .order, #sheetBody .thanks')) showTab();
}
function connect() {
  es?.close(); es = null;
  if (!TAB || TAB.status !== 'open') return;
  es = new EventSource(`/api/public/${slug}/events?table=${encodeURIComponent(token)}&tab=${TAB.id}`);
  es.onmessage = () => refreshTab().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && TAB) refreshTab().catch(() => {}); });

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;
  if (d.inc) change(d.inc, 1);
  else if (d.dec) change(d.dec, -1);
  else if (d.cinc) { change(d.cinc, 1); showCart(); }
  else if (d.cdec) { change(d.cdec, -1); showCart(); }
  else if (d.go) $(`#c${d.go}`)?.scrollIntoView({ behavior: 'smooth' });
  else if (d.close !== undefined) close();
  else if (t.id === 'cartBar') showCart();
  else if (t.id === 'tabBtn') showTab();
  else if (t.id === 'place') placeOrder(t);
  else if (d.payorder) showPay(+d.payorder);
  else if (d.paytab !== undefined) showPay();
  else if (d.pm) pay(d.pm, +t.closest('[data-order]').dataset.order || null);
  else if (d.req) safely(async () => { await api(`/api/public/${slug}/request`, { body: { table: token, kind: d.req } }); toast(d.req === 'bill' ? 'Bill requested. A waiter is coming.' : d.req === 'water' ? 'Water is on its way' : 'A waiter is on the way'); })();
});
$('#q').addEventListener('input', e => { filter.q = e.target.value.trim(); renderChips(); renderList(); });
$('#vegOnly').addEventListener('change', e => { filter.veg = e.target.checked; renderChips(); renderList(); });

load();
