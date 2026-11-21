"use strict";
const SUPABASE_URL = "https://tvtusqlmioyhfwlmqtlu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lxISwyVV1PDGm2q4vAP3KA_J_bqoi6I";
const ADMIN_EMAIL = "mariacaruloja@gmail.com";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const brl = n => Number(n || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let orders = [];
const numOf = o => o._num ?? o.id;

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
const MANAGED_PRODUCTS = [
  ["costela-cozida", "Costela cozida", ["P","M","G"]],
  ["baiao-de-dois", "Baião de dois", ["P","M","G"]],
  ["estrogonofe", "Estrogonofe", ["P","M","G"]],
  ["parmegiana", "Parmegiana", ["P","M","G"]],
  ["calabresa", "Marmita de calabresa acebolada", ["unico"]],
  ["file-frango", "Marmita de filé de frango", ["unico"]],
  ["omelete", "Marmita de omelete", ["unico"]],
  ["suco-abacaxi", "Suco de abacaxi", ["unico"]],
  ["refrigerantes", "Refrigerantes", ["unico"]]
];
let productAvailability = new Map();
const dayNames = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
let storeConfig = null;

async function loadProductAvailability(){
  const box=document.getElementById("availability-list");
  const {data,error}=await db.from("produtos_disponibilidade_v2").select("chave, disponivel");
  if(error){box.textContent="Não foi possível carregar. Execute o arquivo SQL de atualização no Supabase e tente novamente.";return;}
  productAvailability=new Map((data||[]).map(row=>[row.chave,row.disponivel]));
  renderProductAvailability();
}
function renderProductAvailability(){
  const box=document.getElementById("availability-list");
  box.innerHTML=MANAGED_PRODUCTS.map(([key,name,sizes])=>{
    const variants=sizes.map(size=>{
      const variantKey=`${key}-${size}`;
      const available=productAvailability.get(variantKey)!==false;
      const label=size==="unico"?"Disponível":"Tamanho "+size;
      return `<button class="variant-toggle ${available?"":"off"}" type="button" data-variant-key="${variantKey}" data-next="${available?"false":"true"}">${label}: ${available?"Disponível":"ESGOTADO"}</button>`;
    }).join("");
    return `<div class="availability-product"><strong>${esc(name)}</strong><div class="availability-variants">${variants}</div></div>`;
  }).join("");
  box.querySelectorAll("[data-variant-key]").forEach(button=>button.addEventListener("click",()=>setVariantAvailability(button.dataset.variantKey,button.dataset.next==="true")));
}
async function setVariantAvailability(key,available){
  const message=document.getElementById("availability-message");
  message.textContent="Salvando...";
  const {error}=await db.from("produtos_disponibilidade_v2").upsert({chave:key,disponivel:available,atualizado_em:new Date().toISOString()},{onConflict:"chave"});
  if(error){message.textContent="Não foi possível salvar: "+error.message;return;}
  productAvailability.set(key,available);renderProductAvailability();message.textContent="Disponibilidade atualizada com sucesso.";
}

async function loadStoreConfig(){
  const {data,error}=await db.from("configuracao_loja").select("fechamento_manual, horarios").eq("id",true).single();
  if(error){document.getElementById("schedule-list").textContent="Execute o SQL de atualização no Supabase para configurar os horários.";return;}
  storeConfig=data;
  document.getElementById("store-manual-status").textContent=data.fechamento_manual?"Loja fechada manualmente. Ela permanecerá fechada até você clicar em Abrir loja.":"Sem fechamento manual ativo. O horário programado controla os pedidos.";
  const schedule=data.horarios||{};
  document.getElementById("schedule-list").innerHTML=dayNames.map((day,index)=>{
    const item=schedule[String(index)]||{aberto:false,inicio:"11:00",fim:"15:00"};
    return `<div class="schedule-row" data-day="${index}"><strong>${day}</strong><label><input type="checkbox" class="day-open" ${item.aberto?"checked":""}> Aberto</label><label>Abre <input type="time" class="day-start" value="${esc(item.inicio||"11:00")}"></label><label>Fecha <input type="time" class="day-end" value="${esc(item.fim||"15:00")}"></label></div>`;
  }).join("");
}
async function setManualClosure(closed){
  const message=document.getElementById("schedule-message");
  message.textContent="Atualizando estado da loja...";
  const {error}=await db.from("configuracao_loja").update({fechamento_manual:closed,atualizado_em:new Date().toISOString()}).eq("id",true);
  if(error){message.textContent="Não foi possível atualizar: "+error.message;return;}
  await loadStoreConfig();
  message.textContent=closed?"Loja fechada manualmente.":"Loja aberta manualmente. O horário programado volta a valer.";
}
document.getElementById("close-store").addEventListener("click",()=>setManualClosure(true));
document.getElementById("open-store").addEventListener("click",()=>setManualClosure(false));
document.getElementById("save-schedule").addEventListener("click",async()=>{
  const message=document.getElementById("schedule-message");
  const horarios={};
  document.querySelectorAll(".schedule-row").forEach(row=>{
    const day=row.dataset.day;
    horarios[day]={aberto:row.querySelector(".day-open").checked,inicio:row.querySelector(".day-start").value,fim:row.querySelector(".day-end").value};
  });
  for(const [day,item] of Object.entries(horarios)){
    if(item.aberto&&(!item.inicio||!item.fim||item.inicio>=item.fim)){
      message.textContent=`Confira os horários de ${dayNames[Number(day)]}. O fechamento precisa ser depois da abertura.`;return;
    }
  }
  message.textContent="Salvando horários...";
  const {error}=await db.from("configuracao_loja").update({horarios,atualizado_em:new Date().toISOString()}).eq("id",true);
  if(error){message.textContent="Não foi possível salvar: "+error.message;return;}
  message.textContent="Horários salvos. O site público aplicará a nova programação.";
  await loadStoreConfig();
});

async function loadOrders(){
  const list = document.getElementById("orders-list");
  list.textContent = "Carregando pedidos...";
  const {data,error} = await db.from("pedidos").select("*").order("created_at",{ascending:false});
  if(error){ list.textContent = "Não foi possível carregar os pedidos: " + error.message; return; }
  orders = data || [];
  // Numero do pedido dentro do dia (1, 2, 3...), no horario de Sao Paulo.
  const dayKey = d => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d));
  const counters = {};
  [...orders].sort((a,b)=>Number(a.id)-Number(b.id)).forEach(o=>{const k=o.created_at?dayKey(o.created_at):"x";counters[k]=(counters[k]||0)+1;o._num=counters[k];});
  const todayKey = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const todayOrders = orders.filter(order => order.created_at && new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(order.created_at)) === todayKey);
  document.getElementById("count").textContent = todayOrders.length;
  document.getElementById("sum").textContent = brl(todayOrders.reduce((sum,order)=>sum+Number(order.valor_total||0),0));
  if(!orders.length){ list.textContent = "Nenhum pedido recebido ainda."; return; }
  list.innerHTML = orders.map(order => {
    const date = order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "Data não informada";
    const items = itemLines(order.itens);
    return `<article class="order">
      <div>
        <strong>#${esc(numOf(order))} · ${esc(order.cliente || "Cliente")}</strong>
        <small>${esc(date)} · ${esc(order.status || "novo")}${order.endereco === "Retirada no balcão" ? " · PRESENCIAL / RETIRADA" : " · ONLINE"}</small>
        <small>Telefone: ${esc(order.telefone || "Não informado")}</small>
        <small>Endereço: ${esc(order.endereco || "Não informado")}</small>
        <small>Itens:<br>${esc(items).replace(/\n/g,"<br>")}</small>
        <small>Pagamento: ${esc(order.pagamento || "Não informado")}${order.troco ? " · Troco para: " + esc(order.troco) : ""}</small>
        ${order.observacoes ? `<small>Observações: ${esc(order.observacoes)}</small>` : ""}
        <small>Subtotal: ${brl(order.subtotal)} · Entrega: ${brl(order.taxa_entrega)}</small>
      </div>
      <div class="actions"><strong>${brl(order.valor_total)}</strong>
        <button class="btn" type="button" onclick="${order.endereco === "Retirada no balcão" ? `printKitchenOrder(${Number(order.id)})` : `printOrder(${Number(order.id)})`}">Imprimir comanda</button>
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
  </head><body><h2>MARIA CARU</h2><p class="bold">PEDIDO #${esc(numOf(order))}</p><p>${esc(new Date(order.created_at).toLocaleString("pt-BR"))}</p>
  <div class="line"></div><p class="left"><b>Cliente:</b> ${esc(order.cliente)}<br><b>Telefone:</b> ${esc(order.telefone||"Não informado")}<br><b>Endereço:</b> ${esc(order.endereco||"")}</p>
  <div class="line"></div><p class="bold">ITENS DO PEDIDO</p><p class="left">${items}</p><div class="line"></div>
  <p class="left">Subtotal: ${brl(order.subtotal)}<br>Entrega: ${brl(order.taxa_entrega)}<br>Pagamento: ${esc(order.pagamento||"")}<br>${order.troco ? "Troco para: "+esc(order.troco)+"<br>" : ""}Observações: ${esc(order.observacoes||"—")}</p>
  <p class="bold">TOTAL: ${brl(order.valor_total)}</p><div class="line"></div><p>MARIA CARU · OBRIGADO!</p>
  </body></html>`);
  win.document.close();
}

function exportDailySpreadsheet(){
  if(typeof XLSX === "undefined"){alert("Não foi possível carregar o gerador de planilhas. Verifique sua conexão e tente novamente.");return;}
  const now = new Date();
  const dateKey = date => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
  const today = dateKey(now);
  const daily = orders.filter(o => o.created_at && dateKey(new Date(o.created_at)) === today);
  if(!daily.length){alert("Ainda não há pedidos registrados hoje para exportar.");return;}
  const rows = [];
  daily.forEach(o=>{
    const items = Array.isArray(o.itens) ? o.itens : [];
    if(!items.length){rows.push({"Pedido":o.id,"Data/Hora":new Date(o.created_at).toLocaleString("pt-BR"),"Cliente":o.cliente||"","Telefone":o.telefone||"","Endereço":o.endereco||"","Produto":"","Tamanho":"","Quantidade":"","Valor unitário":"","Total do item":"","Subtotal":Number(o.subtotal||0),"Entrega":Number(o.taxa_entrega||0),"Total do pedido":Number(o.valor_total||0),"Pagamento":o.pagamento||"","Troco":o.troco||"","Observações":o.observacoes||"","Status":o.status||"novo"});return;}
    items.forEach(i=>rows.push({"Pedido":o.id,"Data/Hora":new Date(o.created_at).toLocaleString("pt-BR"),"Cliente":o.cliente||"","Telefone":o.telefone||"","Endereço":o.endereco||"","Produto":i.nome||"","Tamanho":i.tamanho||"","Quantidade":Number(i.quantidade||1),"Valor unitário":Number(i.preco_unitario||0),"Total do item":Number(i.total ?? (Number(i.preco_unitario||0)*Number(i.quantidade||1))),"Subtotal":Number(o.subtotal||0),"Entrega":Number(o.taxa_entrega||0),"Total do pedido":Number(o.valor_total||0),"Pagamento":o.pagamento||"","Troco":o.troco||"","Observações":o.observacoes||"","Status":o.status||"novo"}));
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:10},{wch:19},{wch:22},{wch:17},{wch:34},{wch:28},{wch:10},{wch:12},{wch:15},{wch:15},{wch:13},{wch:12},{wch:16},{wch:20},{wch:15},{wch:32},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Pedidos do dia");
  const summary = [{"Data":now.toLocaleDateString("pt-BR"),"Quantidade de pedidos":daily.length,"Faturamento total":daily.reduce((sum,o)=>sum+Number(o.valor_total||0),0),"Taxas de entrega":daily.reduce((sum,o)=>sum+Number(o.taxa_entrega||0),0)}];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Resumo");
  XLSX.writeFile(wb,`Maria_Caru_Pedidos_${today}.xlsx`);
}


let presencialItems = [];
function updatePresencialPricePreview(){
  const raw=document.getElementById("presencial-produto").value;
  const quantity=Number(document.getElementById("presencial-quantidade").value)||1;
  const preview=document.getElementById("presencial-preco-preview");
  if(!raw){preview.textContent="Selecione um produto para visualizar o preço.";return;}
  const [nome,tamanho,preco]=raw.split("|");
  const unit=Number(preco);
  preview.textContent=`${nome}${tamanho?` — ${tamanho}`:""}: ${brl(unit)} por unidade · ${quantity} un. = ${brl(unit*quantity)}`;
}
document.getElementById("presencial-produto").addEventListener("change",updatePresencialPricePreview);
document.getElementById("presencial-quantidade").addEventListener("input",updatePresencialPricePreview);
function renderPresencialCart(){
  const box = document.getElementById("presencial-cart");
  const total = presencialItems.reduce((sum,item)=>sum+item.total,0);
  document.getElementById("presencial-total").textContent = `Total: ${brl(total)}`;
  if(!presencialItems.length){box.textContent="Nenhum item adicionado.";return;}
  box.innerHTML = presencialItems.map((item,index)=>`<div class="presencial-cart-row"><span>${item.quantidade}x ${esc(item.nome)}${item.tamanho?` (${esc(item.tamanho)})`:""} — ${brl(item.total)}</span><button class="btn danger" type="button" data-remove-presencial="${index}">Remover</button></div>`).join("");
  box.querySelectorAll("[data-remove-presencial]").forEach(btn=>btn.addEventListener("click",()=>{presencialItems.splice(Number(btn.dataset.removePresencial),1);renderPresencialCart();}));
}
document.getElementById("add-presencial-item").addEventListener("click",()=>{
  const raw=document.getElementById("presencial-produto").value;
  const quantidade=Number(document.getElementById("presencial-quantidade").value);
  if(!raw){alert("Selecione um produto.");return;}
  if(!Number.isInteger(quantidade)||quantidade<1||quantidade>99){alert("Informe uma quantidade entre 1 e 99.");return;}
  const [nome,tamanho,preco]=raw.split("|");
  const unit=Number(preco);
  const existing=presencialItems.find(i=>i.nome===nome&&i.tamanho===(tamanho||null)&&i.preco_unitario===unit);
  if(existing){existing.quantidade+=quantidade;existing.total=existing.quantidade*unit;}
  else presencialItems.push({nome,tamanho:tamanho||null,quantidade,preco_unitario:unit,total:quantidade*unit});
  document.getElementById("presencial-quantidade").value="1";
  renderPresencialCart();
  updatePresencialPricePreview();
});
function printKitchenOrder(id){
  const order=orders.find(o=>Number(o.id)===Number(id));
  if(!order)return;
  const win=window.open("","_blank","width=420,height=700");
  if(!win){alert("Permita pop-ups para imprimir a comanda. O pedido já está salvo e você pode tentar imprimir novamente pela lista.");return;}
  const date=order.created_at?new Date(order.created_at).toLocaleString("pt-BR"):new Date().toLocaleString("pt-BR");
  const items=esc(itemLines(order.itens)).replace(/\n/g,"<br>");
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comanda cozinha</title><style>@page{size:80mm auto;margin:3mm}body{width:72mm;margin:0;font:14px 'Courier New',monospace;color:#000}h2,p{text-align:center;margin:6px 0}.left{text-align:left}.line{border-top:1px dashed #000;margin:9px 0}.big{font-size:18px;font-weight:bold}</style></head><body><h2>MARIA CARU</h2><p class="big">COMANDA DA COZINHA</p><p>PEDIDO #${esc(numOf(order))}</p><p>${esc(date)}</p><div class="line"></div><p class="left"><b>Cliente:</b> ${esc(order.cliente||"Balcão")}<br><b>Retirada no balcão</b></p><div class="line"></div><p class="left big">${items}</p><div class="line"></div><p class="left"><b>OBSERVAÇÕES:</b><br>${esc(order.observacoes||"—")}</p><div class="line"></div><p>MARIA CARU</p><script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}
document.getElementById("presencial-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const errorBox=document.getElementById("presencial-error");
  errorBox.textContent="";
  if(!presencialItems.length){errorBox.textContent="Adicione pelo menos um item ao pedido.";return;}
  const pagamento=document.getElementById("presencial-pagamento").value;
  if(!pagamento){errorBox.textContent="Selecione a forma de pagamento.";return;}
  // Abre a janela durante o clique do usuário para evitar bloqueio de pop-up após a gravação assíncrona.
  const printWin=window.open("about:blank","_blank","width=420,height=700");
  const button=document.getElementById("save-presencial");
  button.disabled=true;button.textContent="Salvando pedido...";
  const subtotal=presencialItems.reduce((sum,item)=>sum+item.total,0);
  const orderPayload={cliente:document.getElementById("presencial-cliente").value.trim()||"Cliente balcão",telefone:document.getElementById("presencial-telefone").value.trim()||null,endereco:"Retirada no balcão",itens:presencialItems.map(item=>({...item})),subtotal,taxa_entrega:0,valor_total:subtotal,pagamento,troco:document.getElementById("presencial-troco").value.trim()||null,observacoes:document.getElementById("presencial-observacoes").value.trim()||null,status:"presencial"};
  try{
    const {data,error}=await db.from("pedidos").insert(orderPayload).select("*").single();
    if(error)throw error;
    await loadOrders();
    data._num=(orders.find(o=>Number(o.id)===Number(data.id))||{})._num;
    if(printWin){
      const order=data;
      const date=order.created_at?new Date(order.created_at).toLocaleString("pt-BR"):new Date().toLocaleString("pt-BR");
      const items=esc(itemLines(order.itens)).replace(/\n/g,"<br>");
      printWin.document.open();
      printWin.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comanda cozinha</title><style>@page{size:80mm auto;margin:3mm}body{width:72mm;margin:0;font:14px 'Courier New',monospace;color:#000}h2,p{text-align:center;margin:6px 0}.left{text-align:left}.line{border-top:1px dashed #000;margin:9px 0}.big{font-size:18px;font-weight:bold}</style></head><body><h2>MARIA CARU</h2><p class="big">COMANDA DA COZINHA</p><p>PEDIDO #${esc(numOf(order))}</p><p>${esc(date)}</p><div class="line"></div><p class="left"><b>Cliente:</b> ${esc(order.cliente)}<br><b>Retirada no balcão</b></p><div class="line"></div><p class="left big">${items}</p><div class="line"></div><p class="left"><b>OBSERVAÇÕES:</b><br>${esc(order.observacoes||"—")}</p><div class="line"></div><p>MARIA CARU</p><script>window.onload=()=>window.print();<\/script></body></html>`);
      printWin.document.close();
    }else alert("Pedido salvo! Para imprimir, use o botão Imprimir comanda na lista de pedidos.");
    presencialItems=[];renderPresencialCart();document.getElementById("presencial-form").reset();updatePresencialPricePreview();
    document.getElementById("presencial-cliente").focus();
    await loadOrders();
  }catch(err){if(printWin)printWin.close();console.error(err);errorBox.textContent="Não foi possível salvar o pedido: "+(err.message||"erro desconhecido");}
  finally{button.disabled=false;button.textContent="Salvar pedido e imprimir comanda";}
});

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
  showDashboard(data.user);await loadProductAvailability();await loadStoreConfig();await loadOrders();
});
document.getElementById("refresh").addEventListener("click",loadOrders);
document.getElementById("export-day").addEventListener("click",exportDailySpreadsheet);
document.getElementById("logout").addEventListener("click",async()=>{await db.auth.signOut();showLogin();});
db.auth.getSession().then(async({data})=>{
  const user=data.session?.user;
  if(user?.email?.toLowerCase()===ADMIN_EMAIL){showDashboard(user);await loadProductAvailability();await loadStoreConfig();await loadOrders();}
  else showLogin();
});

window.printKitchenOrder = printKitchenOrder;
