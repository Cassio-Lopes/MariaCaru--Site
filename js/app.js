'use strict';

/**
 * Maria Caru — cardápio e fechamento de pedidos.
 * Regras importantes: o navegador apresenta o estado da loja, mas a validação
 * definitiva de horário e estoque também acontece no gatilho do Supabase.
 */
const WHATSAPP_NUMBER = '5511916778894';
const DELIVERY_FEE = 7.00;
const SUPABASE_URL = 'https://tvtusqlmioyhfwlmqtlu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lxISwyVV1PDGm2q4vAP3KA_J_bqoi6I';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const cart = new Map();
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PRODUCTS = [
  { name: 'Costela cozida', key: 'costela-cozida', sizes: ['P','M','G'] },
  { name: 'Baião de dois', key: 'baiao-de-dois', sizes: ['P','M','G'] },
  { name: 'Estrogonofe', key: 'estrogonofe', sizes: ['P','M','G'] },
  { name: 'Parmegiana', key: 'parmegiana', sizes: ['P','M','G'] },
  { name: 'Marmita de calabresa acebolada', key: 'calabresa', sizes: ['unico'] },
  { name: 'Marmita de filé de frango', key: 'file-frango', sizes: ['unico'] },
  { name: 'Marmita de omelete', key: 'omelete', sizes: ['unico'] },
  { name: 'Suco de abacaxi', key: 'suco-abacaxi', sizes: ['unico'] },
  { name: 'Refrigerante (informar sabor)', key: 'refrigerantes', sizes: ['unico'] }
];
let availability = new Map();
let storeCanOrder = false;
let storeStatusReady = false;

function variantKey(name, size) {
  const product = PRODUCTS.find(item => item.name === name || (name.startsWith('Refrigerante') && item.key === 'refrigerantes'));
  if (!product) return null;
  return `${product.key}-${size || 'unico'}`;
}
function isAvailable(name, size) {
  const key = variantKey(name, size);
  return !key || availability.get(key) !== false;
}
function updatePurchaseButtons() {
  document.querySelectorAll('.product-card').forEach(card => {
    const name = card.querySelector('h3')?.textContent.trim();
    let hasAvailable = false;
    card.querySelectorAll('.add-size,.add-simple').forEach(button => {
      const available = isAvailable(button.dataset.name, button.dataset.size || 'unico');
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = !available || !storeCanOrder;
      button.setAttribute('aria-disabled', String(button.disabled));
      button.innerHTML = available ? button.dataset.originalHtml : `${button.dataset.size ? `${button.dataset.size} · ` : ''}<b>ESGOTADO</b>`;
      hasAvailable ||= available;
    });
    const badge = card.querySelector('.availability-badge');
    if (badge) {
      const allUnavailable = [...card.querySelectorAll('.add-size,.add-simple')].every(button => !isAvailable(button.dataset.name, button.dataset.size || 'unico'));
      badge.hidden = !allUnavailable;
      badge.textContent = allUnavailable ? 'ESGOTADO' : '';
    }
    card.classList.toggle('is-unavailable', !hasAvailable);
  });
  const sendButton = document.getElementById('send-order');
  if (sendButton) sendButton.disabled = !storeCanOrder;
}

async function loadAvailability() {
  const { data, error } = await db.from('produtos_disponibilidade_v2').select('chave, disponivel');
  if (error) throw error;
  availability = new Map((data || []).map(row => [row.chave, row.disponivel]));
  updatePurchaseButtons();
}

function isWithinSchedule(config) {
  if (!config || config.fechamento_manual) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday];
  const today = config.horarios?.[String(weekdayIndex)];
  if (!today?.aberto || !today.inicio || !today.fim) return false;
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  const [startHour,startMinute] = today.inicio.split(':').map(Number);
  const [endHour,endMinute] = today.fim.split(':').map(Number);
  return currentMinutes >= startHour * 60 + startMinute && currentMinutes < endHour * 60 + endMinute;
}

async function loadStoreStatus() {
  const banner = document.getElementById('store-status');
  try {
    const { data, error } = await db.from('configuracao_loja').select('fechamento_manual, horarios').eq('id', true).single();
    if (error) throw error;
    storeCanOrder = isWithinSchedule(data);
    storeStatusReady = true;
    if (data.fechamento_manual) {
      banner.textContent = 'No momento estamos fechados. Voltaremos em breve!';
    } else if (storeCanOrder) {
      const today = data.horarios[String(new Date().getDay())];
      banner.textContent = `Estamos recebendo pedidos! Hoje: ${today.inicio} às ${today.fim}.`;
    } else {
      banner.textContent = 'Estamos fora do horário de funcionamento. Confira nossos horários e volte em breve!';
    }
    banner.classList.toggle('is-open', storeCanOrder);
    banner.classList.toggle('is-closed', !storeCanOrder);
  } catch (error) {
    console.error('Falha ao consultar o horário da loja:', error);
    storeCanOrder = false;
    banner.textContent = 'Não foi possível confirmar se estamos abertos. Tente novamente em instantes.';
    banner.classList.add('is-closed');
  }
  updatePurchaseButtons();
}

function addItem(name, price, size = '') {
  if (!storeCanOrder) { alert('A loja está fechada no momento.'); return; }
  if (!isAvailable(name, size || 'unico')) { alert('Esse item está esgotado. Atualize o cardápio.'); return; }
  const key = `${name}${size ? ` (${size})` : ''}`;
  const current = cart.get(key) || { name, size, price, qty: 0 };
  current.qty += 1;
  cart.set(key, current);
  renderCart();
}
function changeQty(key, delta) {
  const item = cart.get(key);
  if (!item) return;
  if (delta > 0 && !isAvailable(item.name, item.size || 'unico')) { alert('Esse item acabou e não pode ser adicionado.'); return; }
  item.qty += delta;
  if (item.qty <= 0) cart.delete(key);
  renderCart();
}
function totalItems() { return [...cart.values()].reduce((sum,item) => sum + item.qty, 0); }
function totalPrice() { return [...cart.values()].reduce((sum,item) => sum + item.qty * item.price, 0); }
function orderTotal() { return cart.size ? totalPrice() + DELIVERY_FEE : 0; }
function renderCart() {
  document.getElementById('cart-count').textContent = totalItems();
  document.getElementById('cart-total').textContent = money(orderTotal());
  document.getElementById('checkout-subtotal').textContent = money(totalPrice());
  document.getElementById('delivery-fee').textContent = money(cart.size ? DELIVERY_FEE : 0);
  document.getElementById('checkout-total').textContent = money(orderTotal());
  const summary = document.getElementById('cart-summary');
  if (!cart.size) { summary.textContent = 'Seu carrinho está vazio.'; return; }
  summary.innerHTML = [...cart.entries()].map(([key,item]) => `
    <div class="cart-row"><span>${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ''}</span>
      <button type="button" aria-label="Diminuir quantidade" data-key="${encodeURIComponent(key)}" data-delta="-1">−</button>
      <button type="button" aria-label="Aumentar quantidade" data-key="${encodeURIComponent(key)}" data-delta="1">+</button>
      <b>${money(item.qty * item.price)}</b></div>`).join('');
  summary.querySelectorAll('button').forEach(button => button.addEventListener('click', () => changeQty(decodeURIComponent(button.dataset.key), Number(button.dataset.delta))));
}

document.querySelectorAll('.add-size').forEach(button => button.addEventListener('click', () => addItem(button.dataset.name, Number(button.dataset.price), button.dataset.size)));
document.querySelectorAll('.add-simple').forEach(button => button.addEventListener('click', () => addItem(button.dataset.name, Number(button.dataset.price))));
const modal = document.getElementById('checkout-modal');
document.getElementById('cart-open').addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); });
document.getElementById('close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
document.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter-btn').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelectorAll('.product-card').forEach(card => { card.hidden = button.dataset.filter !== 'todos' && card.dataset.category !== button.dataset.filter; });
}));

// Reconsulta no momento do envio para evitar depender de uma página aberta há muito tempo.
document.getElementById('send-order').addEventListener('click', async () => {
  if (!cart.size) { alert('Adicione pelo menos um produto ao pedido.'); return; }
  const button = document.getElementById('send-order');
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  if (!name || !address) { alert('Preencha seu nome e endereço de entrega.'); return; }
  button.disabled = true;
  button.textContent = 'Conferindo disponibilidade...';
  try {
    await loadStoreStatus();
    await loadAvailability();
    if (!storeCanOrder) throw new Error('A loja está fechada no momento. Não foi possível concluir o pedido.');
    const unavailable = [...cart.values()].filter(item => !isAvailable(item.name, item.size || 'unico'));
    if (unavailable.length) throw new Error(`Item esgotado: ${unavailable.map(item => item.name + (item.size ? ` (${item.size})` : '')).join(', ')}. Atualize seu carrinho.`);

    const payment = document.getElementById('payment').value;
    const change = document.getElementById('change-for').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const subtotal = totalPrice();
    const grandTotal = subtotal + DELIVERY_FEE;
    const items = [...cart.values()].map(item => ({ nome: item.name, tamanho: item.size || null, quantidade: item.qty, preco_unitario: item.price, total: item.qty * item.price }));
    const lines = [...cart.values()].map(item => `${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ''} — ${money(item.qty * item.price)}`);
    const whatsappText = [
      '*NOVO PEDIDO — MARIA CARU*','',`Cliente: ${name}`,`Telefone: ${phone || 'Não informado'}`,`Endereço: ${address}`,'','*ITENS DO PEDIDO*',...lines,'',
      `Subtotal dos itens: ${money(subtotal)}`,`Taxa de entrega: ${money(DELIVERY_FEE)}`,`*TOTAL DO PEDIDO: ${money(grandTotal)}*`,
      `Pagamento: ${payment}`,change ? `Troco para: ${change}` : '',notes ? `Observações: ${notes}` : '', '', 'Pedido enviado pelo cardápio online.'
    ].filter(Boolean).join('\n');

    button.textContent = 'Registrando pedido...';
    const { error } = await db.from('pedidos').insert({ cliente: name, telefone: phone || null, endereco: address, itens: items, subtotal, taxa_entrega: DELIVERY_FEE, valor_total: grandTotal, pagamento: payment, troco: change || null, observacoes: notes || null, status: 'novo' });
    if (error) throw error;
    button.textContent = 'Abrindo WhatsApp...';
    window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`);
  } catch (error) {
    console.error('Erro ao registrar pedido:', error);
    alert(error.message || 'Não foi possível registrar o pedido. Tente novamente.');
    button.disabled = false;
    button.innerHTML = 'Enviar pedido pelo WhatsApp <span>↗</span>';
  }
});

Promise.all([loadStoreStatus(), loadAvailability()]).catch(error => console.error('Erro ao iniciar o cardápio:', error));
// Atualiza o status enquanto a página permanece aberta (ex.: horário de abertura).
window.setInterval(loadStoreStatus, 60_000);
window.setInterval(loadAvailability, 60_000);
renderCart();
