"use strict";
const SUPABASE_URL = "https://tvtusqlmioyhfwlmqtlu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lxISwyVV1PDGm2q4vAP3KA_J_bqoi6I";
const ADMIN_EMAIL = "mariacaruloja@gmail.com";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const brl = n => Number(n || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let orders = [];

function itemLines(items){
  if (Array.isArray(items)) return items.map(i => `${i.quantidade || 1}x ${i.nome || "Item"}${i.tamanho ? ` (${i.tamanho})` : ""} — ${brl(i.total ?? (Number(i.preco_unitario||0)*Number(i.quantidade||1)))}`).join("\n");
  return String(items || "Itens não informados");
}
function showLogin(message=""){
  document.getElementById("login-panel").hidden = false;
  document.getElementById("dashboard").hidden = true;
  document.getElementById("login-error").textContent = message;
}
function showDashboard(user){
  document.getElementById("login-panel").hidden = true;
  document.getElementById("dashboard").hidden = false;
  document.getElementById("signed-user").textContent = `Conectado como ${user.email}`;
}
async function loadOrders(){
  const list = document.getElementById("orders-list");
  list.textContent = "Carregando pedidos...";
  const {data,error} = await db.from("pedidos").select("*").order("created_at",{ascending:false});
  if(error){ list.textContent = "Não foi possível carregar os pedidos: " + error.message; return; }
  orders = data || [];
  document.getElementById("count").textContent = orders.length;
  document.getElementById("sum").textContent = brl(orders.reduce((s,o)=>s+Number(o.valor_total||0),0));
  if(!orders.length){ list.textContent = "Nenhum pedido recebido ainda."; return; }
  list.innerHTML = orders.map(order => {
    const date = order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "Data não informada";
    const items = itemLines(order.itens);
    return `<article class="order">
      <div>
        <strong>#${esc(order.id)} · ${esc(order.cliente || "Cliente")}</strong>
        <small>${esc(date)} · ${esc(order.status || "novo")}</small>
        <small>Telefone: ${esc(order.telefone || "Não informado")}</small>
        <small>Endereço: ${esc(order.endereco || "Não informado")}</small>
        <small>Itens:<br>${esc(items).replace(/\n/g,"<br>")}</small>
        <small>Pagamento: ${esc(order.pagamento || "Não informado")}${order.troco ? " · Troco para: " + esc(order.troco) : ""}</small>
        ${order.observacoes ? `<small>Observações: ${esc(order.observacoes)}</small>` : ""}
        <small>Subtotal: ${brl(order.subtotal)} · Entrega: ${brl(order.taxa_entrega)}</small>
      </div>
      <div class="actions"><strong>${brl(order.valor_total)}</strong>
        <button class="btn" type="button" onclick="printOrder(${Number(order.id)})">Imprimir comanda</button>
        <button class="btn danger" type="button" onclick="deleteOrder(${Number(order.id)})">Excluir</button>
      </div>
    </article>`;
  }).join("");
}
async function deleteOrder(id){
  if(!confirm("Excluir este pedido do histórico?")) return;
  const {error} = await db.from("pedidos").delete().eq("id",id);
  if(error){alert("Não foi possível excluir: "+error.message);return;}
  await loadOrders();
}
function printOrder(id){
  const order = orders.find(o=>Number(o.id)===Number(id));
  if(!order) return;
  const win = window.open("","_blank","width=420,height=700");
  if(!win){alert("Permita pop-ups para imprimir a comanda.");return;}
  const items = esc(itemLines(order.itens)).replace(/\n/g,"<br>");
  win.onload = () => win.print();
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comanda Maria Caru</title>
  <style>@page{size:80mm auto;margin:3mm}body{width:72mm;margin:0;font:13px 'Courier New',monospace;color:#000}h2,p{text-align:center;margin:5px 0}.left{text-align:left}.line{border-top:1px dashed #000;margin:9px 0}.bold{font-weight:bold}</style>
  </head><body><h2>MARIA CARU</h2><p class="bold">PEDIDO #${esc(order.id)}</p><p>${esc(new Date(order.created_at).toLocaleString("pt-BR"))}</p>
  <div class="line"></div><p class="left"><b>Cliente:</b> ${esc(order.cliente)}<br><b>Telefone:</b> ${esc(order.telefone||"Não informado")}<br><b>Endereço:</b> ${esc(order.endereco||"")}</p>
  <div class="line"></div><p class="bold">ITENS DO PEDIDO</p><p class="left">${items}</p><div class="line"></div>
  <p class="left">Subtotal: ${brl(order.subtotal)}<br>Entrega: ${brl(order.taxa_entrega)}<br>Pagamento: ${esc(order.pagamento||"")}<br>${order.troco ? "Troco para: "+esc(order.troco)+"<br>" : ""}Observações: ${esc(order.observacoes||"—")}</p>
  <p class="bold">TOTAL: ${brl(order.valor_total)}</p><div class="line"></div><p>MARIA CARU · OBRIGADO!</p>
  </body></html>`);
  win.document.close();
}

document.getElementById("login-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const button=document.getElementById("login-button");
  const email=document.getElementById("email").value.trim().toLowerCase();
  const password=document.getElementById("password").value;
  if(email!==ADMIN_EMAIL){showLogin("Este e-mail não tem permissão para acessar o painel.");return;}
  button.disabled=true;button.textContent="Entrando...";
  const {data,error}=await db.auth.signInWithPassword({email,password});
  button.disabled=false;button.textContent="Entrar no painel";
  if(error){showLogin("Não foi possível entrar. Confira o e-mail e a senha.");return;}
  if(data.user?.email?.toLowerCase()!==ADMIN_EMAIL){
    await db.auth.signOut();showLogin("Usuário sem autorização.");return;
  }
  showDashboard(data.user);await loadOrders();
});
document.getElementById("refresh").addEventListener("click",loadOrders);
document.getElementById("logout").addEventListener("click",async()=>{await db.auth.signOut();showLogin();});
db.auth.getSession().then(async({data})=>{
  const user=data.session?.user;
  if(user?.email?.toLowerCase()===ADMIN_EMAIL){showDashboard(user);await loadOrders();}
  else showLogin();
});
