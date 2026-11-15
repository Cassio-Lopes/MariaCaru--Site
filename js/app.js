const WHATSAPP_NUMBER = "5511916778894";
const DELIVERY_FEE = 6.00;
const cart = new Map();
const money = value => value.toLocaleString("pt-BR", {style:"currency", currency:"BRL"});

function addItem(name, price, size = "") {
  const key = `${name}${size ? ` (${size})` : ""}`;
  const current = cart.get(key) || {name, size, price, qty:0};
  current.qty += 1;
  cart.set(key, current);
  renderCart();
}
function changeQty(key, delta) {
  const item = cart.get(key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart.delete(key);
  renderCart();
}
function totalItems(){ return [...cart.values()].reduce((sum,item)=>sum+item.qty,0); }
function totalPrice(){ return [...cart.values()].reduce((sum,item)=>sum+item.qty*item.price,0); }
function orderTotal(){ return cart.size ? totalPrice() + DELIVERY_FEE : 0; }

function renderCart(){
  document.getElementById("cart-count").textContent = totalItems();
  document.getElementById("cart-total").textContent = money(orderTotal());
  document.getElementById("checkout-subtotal").textContent = money(totalPrice());
  document.getElementById("delivery-fee").textContent = money(cart.size ? DELIVERY_FEE : 0);
  document.getElementById("checkout-total").textContent = money(orderTotal());
  const summary = document.getElementById("cart-summary");
  if (!cart.size) { summary.textContent = "Seu carrinho está vazio."; return; }
  summary.innerHTML = [...cart.entries()].map(([key,item]) => `
    <div class="cart-row">
      <span>${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""}</span>
      <button type="button" aria-label="Diminuir quantidade" data-key="${encodeURIComponent(key)}" data-delta="-1">−</button>
      <button type="button" aria-label="Aumentar quantidade" data-key="${encodeURIComponent(key)}" data-delta="1">+</button>
      <b>${money(item.qty*item.price)}</b>
    </div>`).join("");
  summary.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => changeQty(decodeURIComponent(btn.dataset.key), Number(btn.dataset.delta))));
}

document.querySelectorAll(".add-size").forEach(btn => btn.addEventListener("click", () => addItem(btn.dataset.name, Number(btn.dataset.price), btn.dataset.size)));
document.querySelectorAll(".add-simple").forEach(btn => btn.addEventListener("click", () => addItem(btn.dataset.name, Number(btn.dataset.price))));

const modal = document.getElementById("checkout-modal");
document.getElementById("cart-open").addEventListener("click", () => { modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); });
document.getElementById("close-modal").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
function closeModal(){ modal.classList.remove("open"); modal.setAttribute("aria-hidden","true"); }

document.querySelectorAll(".filter-btn").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".product-card").forEach(card => card.hidden = btn.dataset.filter !== "todos" && card.dataset.category !== btn.dataset.filter);
}));


const SUPABASE_URL = "https://tvtusqlmioyhfwlmqtlu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lxISwyVV1PDGm2q4vAP3KA_J_bqoi6I";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById("send-order").addEventListener("click", async () => {
  if (!cart.size) { alert("Adicione pelo menos um produto ao pedido."); return; }

  const button = document.getElementById("send-order");
  const name = document.getElementById("customer-name").value.trim();
  const phone = document.getElementById("customer-phone").value.trim();
  const address = document.getElementById("customer-address").value.trim();
  if (!name || !address) { alert("Preencha seu nome e endereço de entrega."); return; }

  const payment = document.getElementById("payment").value;
  const change = document.getElementById("change-for").value.trim();
  const notes = document.getElementById("notes").value.trim();
  const subtotal = totalPrice();
  const deliveryFee = DELIVERY_FEE;
  const grandTotal = subtotal + deliveryFee;
  const lines = [...cart.values()].map(item => `${item.qty}x ${item.name}${item.size ? ` (${item.size})` : ""} — ${money(item.qty*item.price)}`);
  const itemsForDatabase = [...cart.values()].map(item => ({
    nome: item.name, tamanho: item.size || null, quantidade: item.qty,
    preco_unitario: item.price, total: item.qty * item.price
  }));

  const text = [
    "*NOVO PEDIDO — MARIA CARU*", "",
    `Cliente: ${name}`, `Telefone: ${phone || "Não informado"}`,
    `Endereço: ${address}`, "", "*ITENS DO PEDIDO*", ...lines, "",
    `Subtotal dos itens: ${money(subtotal)}`,
    `Taxa de entrega: ${money(deliveryFee)}`,
    `*TOTAL DO PEDIDO: ${money(grandTotal)}*`,
    `Pagamento: ${payment}`, change ? `Troco para: ${change}` : "",
    notes ? `Observações: ${notes}` : "", "",
    "Pedido enviado pelo cardápio online."
  ].filter(Boolean).join("\n");

  button.disabled = true;
  button.textContent = "Registrando pedido...";
  try {
    const { data, error } = await supabaseClient
      .from("pedidos")
      .insert({
        cliente: name,
        telefone: phone || null,
        endereco: address,
        itens: itemsForDatabase,
        subtotal,
        taxa_entrega: deliveryFee,
        valor_total: grandTotal,
        pagamento: payment,
        troco: change || null,
        observacoes: notes || null,
        status: "novo"
      });

    // Não solicitamos a linha de volta: clientes anônimos podem inserir,
    // mas não têm permissão de leitura no RLS.
    if (error) throw error;

    // Redireciona na mesma aba após salvar. Isso evita bloqueios de pop-up
    // comuns no Safari do iPhone quando uma nova aba é aberta após um await.
    button.textContent = "Abrindo WhatsApp...";
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.location.assign(whatsappUrl);
  } catch (error) {
    console.error("Erro ao registrar pedido no Supabase:", error);
    alert("Não foi possível registrar o pedido. Confira sua conexão e tente novamente. Se persistir, avise a Maria Caru.");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Enviar pedido pelo WhatsApp <span>↗</span>';
  }
});


renderCart();
