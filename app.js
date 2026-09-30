'use strict';
/* RUMA · CRM — app para GitHub Pages. Habla con la API de Apps Script (ver config.js). */
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ''; } }

/* ================== Estado y utilidades ================== */
const ETAPAS = ['Consulta','Presupuesto Enviado','Confirmado','En Producción','Listo para Entrega','Entregado'];
const ETAPA_COLOR = {'Consulta':'#A89C90','Presupuesto Enviado':'#3F6A8A','Confirmado':'#B7791F','En Producción':'#9C5A33','Listo para Entrega':'#6B5B95','Entregado':'#4E7A4A'};
const TIPOS = ['Sillón/Sofá','Mueble a Medida','Producto del local'];
const VIEWS = [
  {id:'pipeline', icon:'▦', label:'Pipeline'},
  {id:'calendario', icon:'▤', label:'Calendario'},
  {id:'entregas', icon:'🚚', label:'Entregas'},
  {id:'recordatorios', icon:'⏰', label:'Recordatorios'},
  {id:'clientes', icon:'👤', label:'Clientes'},
  {id:'proveedores', icon:'🧵', label:'Proveedores'},
  {id:'panel', icon:'📈', label:'Panel comercial'},
  {id:'perdidos', icon:'✕', label:'Perdidos'},
  {id:'ajustes', icon:'⚙', label:'Ajustes'}
];
const CFG_LABELS = {modelos:'Modelos de sillón',telas:'Telas',maderas:'Maderas',terminaciones:'Terminaciones',origenes:'¿Cómo nos conoció?',medios:'Medios de pago',especialidades:'Especialidades de proveedores',comerciales:'Comerciales',motivosPerdida:'Motivos de pérdida'};

const S = { d:null, view:'pipeline', q:'', fTipo:'', fCom:'', showAllDone:false, cal:null, modal:null, periodo:'todo', recFilter:'pend' };

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number(v)||0;
const money = n => '$ ' + Math.round(num(n)).toLocaleString('es-AR');
const pad = n => String(n).padStart(2,'0');
const iso = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s,n) => { const d = parseD(s); d.setDate(d.getDate()+n); return iso(d); };
const parseD = s => { const p = String(s).slice(0,10).split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); };
const fmtD = s => { if(!s) return '—'; const p = String(s).slice(0,10).split('-'); return esc(p[2]+'/'+p[1]+'/'+String(p[0]).slice(2)); };
const fmtDT = s => s ? fmtD(s) + (String(s).length>10 ? ' ' + String(s).slice(11,16) : '') : '—';
const diasHasta = s => Math.round((parseD(s) - parseD(today()))/86400000);
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const cfg = k => (S.d.config[k]||[]);
const opts = (arr, sel, empty) => (empty!==undefined?`<option value="">${esc(empty)}</option>`:'') + arr.map(v => `<option ${String(v)===String(sel)?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('');
const byId = (t,id) => S.d[t].find(x => x.id===id);
const isSi = v => v==='SI' || v===true;

/* ================== Conexión con la API (Apps Script) ================== */
const TK = 'ruma_token';
function getToken(){ try{ return sessionStorage.getItem(TK) || localStorage.getItem(TK) || ''; }catch(e){ return ''; } }
function setToken(t, remember){ try{ clearToken(); (remember ? localStorage : sessionStorage).setItem(TK, t); }catch(e){} }
function clearToken(){ try{ sessionStorage.removeItem(TK); localStorage.removeItem(TK); }catch(e){} }
const API_OK = u => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u||''));
async function call(action, payload){
  if(!API_OK(window.RUMA_API_URL)) throw new Error('Falta configurar el link de la API en config.js');
  let r;
  try{
    r = await fetch(window.RUMA_API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action, token:getToken(), payload:payload||{}}), redirect:'follow', credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer' });
  }catch(e){ throw new Error('No hay conexión con el servidor. Revisá internet y probá de nuevo.'); }
  let j; try{ j = await r.json(); }catch(e){ throw new Error('Respuesta inválida del servidor'); }
  if(j && j.auth){ clearToken(); showLogin(j.error); throw new Error(j.error); }
  if(!j || !j.ok) throw new Error((j && j.error) || 'Error');
  return j.data;
}
const fromLink = e => !!e.target.closest('a,button,input,label,select');
let busyN = 0;
function busy(on){ busyN += on?1:-1; $('#busy').classList.toggle('hidden', busyN<=0); }
async function run(action, payload, okMsg){
  busy(true);
  try{
    const data = await call(action, payload);
    apply(data); if(okMsg) toast(okMsg); render();
    return data;
  }catch(e){ toast(e.message || 'Error', true); throw e; }
  finally{ busy(false); }
}
function apply(d){
  if(!d) return;
  if(d.put) Object.keys(d.put).forEach(t => d.put[t].forEach(o => {
    if(!o) return; const arr = S.d[t]; const i = arr.findIndex(x => x.id===o.id); if(i>=0) arr[i]=o; else arr.push(o);
  }));
  if(d.del) Object.keys(d.del).forEach(t => { S.d[t] = S.d[t].filter(x => d.del[t].indexOf(x.id)<0); });
  if(d.config) S.d.config = d.config;
  if('resumenDiario' in d) S.d.resumenDiario = d.resumenDiario;
}
function toast(msg, err){
  const el = document.createElement('div'); el.className = 'tst' + (err?' err':''); el.textContent = msg;
  $('#toast').appendChild(el); while($('#toast').children.length>3) $('#toast').firstChild.remove(); setTimeout(() => el.remove(), err?5000:2600);
}
function confirmBox(msg, okLabel){
  return new Promise(res => {
    const m = $('#modal2');
    m.innerHTML = `<div class="modal-card narrow"><div class="modal-body"><p style="margin:0 0 16px;font-size:15px">${esc(msg)}</p>
      <div class="row"><span class="spacer"></span><button class="btn" data-a="no">Cancelar</button><button class="btn pri" data-a="si">${esc(okLabel||'Confirmar')}</button></div></div></div>`;
    m.classList.remove('hidden');
    m.onclick = e => { const a = e.target.dataset.a; if(a || e.target===m){ m.classList.add('hidden'); m.onclick=null; res(a==='si'); } };
  });
}

/* ================== Cálculos ================== */
/* Forma de pago → tipo de ajuste: 'desc' descuento al cliente · 'com' comisión que absorbe RUMA · '' sin ajuste */
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Mercado Pago (cuotas)', 'Open Pay (cuotas)', 'Otro'];
function tipoAjuste(forma){ forma = String(forma||'').toLowerCase(); if(/cuota|mercado|open ?pay|tarjeta/.test(forma)) return 'com'; if(/efectivo|transfer/.test(forma)) return 'desc'; return ''; }
/** Precio al cliente y total a recibir según lista, forma de pago y % */
function precios(lista, forma, pct){
  lista = num(lista); pct = Math.min(Math.max(num(pct),0),100); const t = tipoAjuste(forma);
  if(t==='desc'){ const cli = Math.round(lista*(1-pct/100)); return {cliente:cli, recibir:cli, ajuste:lista-cli, tipo:t}; }
  if(t==='com'){ const rec = Math.round(lista*(1-pct/100)); return {cliente:lista, recibir:rec, ajuste:lista-rec, tipo:t}; }
  return {cliente:lista, recibir:lista, ajuste:0, tipo:''};
}
function calc(p){
  const pagado = S.d.Pagos.filter(x => x.pedidoId===p.id).reduce((a,x)=>a+num(x.monto),0);
  const costos = S.d.Costos.filter(x => x.pedidoId===p.id).reduce((a,x)=>a+num(x.monto),0);
  const precio = num(p.precioTotal);
  const recibir = p.totalRecibir!=='' && p.totalRecibir!==undefined ? num(p.totalRecibir) : precio;
  return {precio, pagado, saldo: precio-pagado, costos, recibir, ganancia: recibir-costos};
}
const medidasTxt = p => { const m = [p.largo, p.profundidad, p.alto].map(num); return m.some(Boolean) ? m.map(x => x||'–').join(' × ') + ' cm' : (p.medidas||''); };
const cap1 = s => { s = String(s||'').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
function productoTexto(p){
  if(p.tipo==='Sillón/Sofá') return 'sillón' + (p.modelo ? ' ' + cap1(p.modelo) : '');
  if(p.tipo==='Mueble a Medida') return 'mueble a medida' + (p.madera ? ' en ' + String(p.madera).toLowerCase() : '');
  return p.modelo ? cap1(p.modelo) : 'compra';
}
const DEF_MSG_RESENA = '¡Hola {nombre}! ¿Cómo estás? 😊 Te escribimos de RUMA. Ya pasaron un par de semanas desde que recibiste tu {producto} y queríamos saber cómo te resultó. ¿Lo estás disfrutando?\n\nSi te gustó, nos ayudarías un montón dejándonos una reseña en Google (es 1 minuto y a otras personas les sirve muchísimo):\n{link}\n\n¡Gracias por elegirnos! 🧡';
function mensajeResena(p){
  const c = cliente(p) || {};
  const nombre = cap1(String(c.nombre || p.clienteNombre || '').trim().split(/\s+/)[0]);
  const link = cfg('linkResena')[0] || '';
  let t = (cfg('mensajeResena')[0] || DEF_MSG_RESENA);
  t = t.replace(/\{nombre\}/g, nombre).replace(/\{producto\}/g, productoTexto(p)).replace(/\{link\}/g, link);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
const idxEtapa = p => ETAPAS.indexOf(p.etapa);
const isPerdido = p => isSi(p.perdido);
const isActivo = p => !isPerdido(p) && p.etapa!=='Entregado';
const isGanado = p => !isPerdido(p) && idxEtapa(p)>=2;
const isAtrasado = p => isActivo(p) && p.fechaEntregaEstimada && p.fechaEntregaEstimada < today();
const cliente = p => p.clienteId ? byId('Clientes', p.clienteId) : null;
const descProd = p => p.tipo==='Mueble a Medida' ? [p.madera, p.terminacion, medidasTxt(p)].filter(Boolean).join(' · ') : [p.modelo, [p.tela,p.color].filter(Boolean).join(' '), medidasTxt(p)].filter(Boolean).join(' · ');
const recsVencidos = () => S.d.Recordatorios.filter(r => !isSi(r.hecho) && r.fecha < today());

function waLink(tel, text){
  let d = String(tel||'').replace(/\D/g,'');
  if(!d) return '';
  if(d.startsWith('0')) d = d.slice(1);
  if(d.startsWith('54')){ if(!d.startsWith('549')) d = '549' + d.slice(2); }
  else if(d.startsWith('15') && d.length<=9) d = '549223' + d.slice(2); // Mar del Plata
  else if(d.length===10) d = '549' + d;
  else if(d.length<=8) d = '549223' + d;
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}

/* ================== Layout ================== */
function renderNav(){
  const venc = recsVencidos().length, late = S.d.Pedidos.filter(isAtrasado).length;
  $('#nav').innerHTML = VIEWS.map(v => {
    const b = v.id==='recordatorios' && venc ? `<span class="badge">${venc}</span>` : v.id==='entregas' && late ? `<span class="badge">${late}</span>` : '';
    return `<button class="${S.view===v.id?'on':''}" data-view="${v.id}"><span>${v.icon}</span><span class="lbl">${v.label}</span>${b}</button>`;
  }).join('');
}
function render(){
  renderNav();
  const v = VIEWS.find(x => x.id===S.view);
  const fn = {pipeline:renderPipeline, calendario:renderCalendario, entregas:renderEntregas, recordatorios:renderRecordatorios, clientes:renderClientes, proveedores:renderProveedores, panel:renderPanel, perdidos:renderPerdidos, ajustes:renderAjustes}[S.view];
  fn(v);
  if(S.modal) renderModal();
}
function setTop(title, extra){
  $('#top').innerHTML = `<h1>${esc(title)}</h1>${extra||''}`;
}
document.addEventListener('click', e => {
  const nv = e.target.closest('[data-view]');
  if(nv){ S.view = nv.dataset.view; render(); window.scrollTo(0,0); }
});

/* ================== Pipeline ================== */
function filtraPedidos(list){
  const q = S.q.trim().toLowerCase();
  return list.filter(p => {
    if(S.fTipo && p.tipo!==S.fTipo) return false;
    if(S.fCom && p.comercial!==S.fCom) return false;
    if(!q) return true;
    const c = cliente(p) || {};
    return [p.id, p.clienteNombre, p.modelo, p.tela, p.color, p.madera, medidasTxt(p), p.detalles, c.telefono, c.email].join(' ').toLowerCase().includes(q);
  });
}
function topFilters(){
  return `<input class="search" id="q" placeholder="Buscar cliente, pedido, modelo…" value="${esc(S.q)}">
    <select id="fTipo">${opts(TIPOS, S.fTipo, 'Todos los tipos')}</select>
    ${cfg('comerciales').length>1 ? `<select id="fCom">${opts(cfg('comerciales'), S.fCom, 'Todos los comerciales')}</select>` : ''}
    <button class="btn pri" data-act="nuevoPedido">+ Nuevo pedido</button>`;
}
function bindFilters(){
  const q = $('#q'); if(q) q.oninput = () => { S.q = q.value; const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos,pos); };
  const t = $('#fTipo'); if(t) t.onchange = () => { S.fTipo = t.value; render(); };
  const c = $('#fCom'); if(c) c.onchange = () => { S.fCom = c.value; render(); };
}
function renderPipeline(v){
  setTop(v.label, topFilters()); bindFilters();
  const all = filtraPedidos(S.d.Pedidos.filter(p => !isPerdido(p)));
  const activos = all.filter(isActivo);
  const valor = activos.reduce((a,p)=>a+num(p.precioTotal),0);
  const saldo = all.filter(isGanado).reduce((a,p)=>a+Math.max(0,calc(p).saldo),0);
  const late = activos.filter(isAtrasado).length;
  const lim = addDays(today(), -45);
  let html = `<div class="kpis">
    ${kpi('Pedidos activos', activos.length, activos.filter(p=>idxEtapa(p)>=2).length + ' confirmados')}
    ${kpi('Valor en pipeline', money(valor))}
    ${kpi('Saldo a cobrar', money(saldo), 'de pedidos con seña')}
    ${kpi('Entregas atrasadas', late, late?'revisá la pestaña Entregas':'todo en fecha', late?'bad':'ok')}
  </div><div class="board">`;
  ETAPAS.forEach(et => {
    let list = all.filter(p => p.etapa===et);
    let hiddenN = 0;
    if(et==='Entregado'){
      list.sort((a,b)=>String(b.fechaEntregaReal).localeCompare(String(a.fechaEntregaReal)));
      if(!S.showAllDone){ const vis = list.filter(p => !p.fechaEntregaReal || p.fechaEntregaReal>=lim); hiddenN = list.length - vis.length; list = vis; }
    } else list.sort((a,b)=>String(a.fechaEntregaEstimada||'9999').localeCompare(String(b.fechaEntregaEstimada||'9999')));
    const sum = list.reduce((a,p)=>a+num(p.precioTotal),0);
    html += `<div class="col" data-etapa="${esc(et)}" style="--c:${ETAPA_COLOR[et]}">
      <div class="col-h"><b>${esc(et)}</b><div class="small muted"><span>${list.length} pedido${list.length===1?'':'s'}</span><span>${money(sum)}</span></div></div>
      <div class="col-b">${list.map(cardHtml).join('') || '<div class="more">Arrastrá pedidos acá</div>'}
      ${hiddenN ? `<div class="more" data-act="verEntregados">+ ${hiddenN} entregados hace más de 45 días</div>` : ''}
      ${et==='Entregado' && S.showAllDone ? `<div class="more" data-act="ocultarEntregados">Ocultar entregados viejos</div>` : ''}</div></div>`;
  });
  html += '</div>';
  $('#view').innerHTML = html;
  bindBoard();
}
function kpi(l, v, s, cls){ return `<div class="kpi ${cls||''}"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div>${s?`<div class="s">${esc(s)}</div>`:''}</div>`; }
function cardHtml(p){
  const c = calc(p);
  const nf = S.d.Fotos.filter(f=>f.pedidoId===p.id).length, nn = S.d.Notas.filter(n=>n.pedidoId===p.id).length;
  const late = isAtrasado(p);
  const i = idxEtapa(p);
  const ent = p.etapa==='Entregado' ? `✔ ${fmtD(p.fechaEntregaReal)}` : p.fechaEntregaEstimada ? `🚚 ${fmtD(p.fechaEntregaEstimada)}` : '';
  const saldoTag = c.precio ? (c.saldo<=0 ? '<span class="tag ok">Pagado</span>' : `<span class="tag ${i>=2?'warn':''}">Saldo ${money(c.saldo)}</span>`) : '';
  return `<div class="card" draggable="true" data-id="${esc(p.id)}">
    <div class="c-top"><span>${esc(p.id)}${isSi(p.esStock)?' · <b>STOCK</b>':''}</span><span>${esc(p.tipo==='Mueble a Medida'?'Mueble':p.tipo==='Sillón/Sofá'?'Sillón':p.tipo||'')}</span></div>
    <div class="c-name">${esc(p.clienteNombre||'Sin cliente')}</div>
    <div class="c-sub">${esc(descProd(p)||'—')}</div>
    <div class="c-foot"><b>${c.precio?money(c.precio):'<span class="muted">Sin precio</span>'}</b>${saldoTag}</div>
    <div class="c-meta"><span class="${late?'late':''}">${ent}${late?' · atrasado':''}</span>${nf?`<span>📷 ${nf}</span>`:''}${nn?`<span>💬 ${nn}</span>`:''}
      ${i < ETAPAS.length-1?`<button class="c-adv" data-adv="${esc(p.id)}" title="Pasar a ${esc(ETAPAS[i+1])}">›</button>`:''}</div>
  </div>`;
}
function bindBoard(){
  $$('.card').forEach(c => {
    c.onclick = e => { if(e.target.dataset.adv) return; openPedido(c.dataset.id); };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('[data-adv]').forEach(b => b.onclick = e => {
    e.stopPropagation(); const p = byId('Pedidos', b.dataset.adv); const et = ETAPAS[idxEtapa(p)+1];
    run('setEtapa', {id:p.id, etapa: et}, `${p.id} → ${et}`).then(() => despuesDeEtapa(p.id, et));
  });
  $$('.col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = e => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain'); const p = byId('Pedidos', id);
      if(p && p.etapa!==col.dataset.etapa){
        const prev = p.etapa; p.etapa = col.dataset.etapa; render(); // optimista
        const et = col.dataset.etapa;
        run('setEtapa', {id, etapa: et}, `${id} → ${et}`).then(() => despuesDeEtapa(id, et)).catch(() => { p.etapa = prev; render(); });
      }
    };
  });
}

/** Al pasar a Confirmado sin pagos, ofrece registrar la seña. */
function despuesDeEtapa(id, etapa){
  if(etapa!=='Confirmado') return;
  const p = byId('Pedidos', id); if(!p || S.d.Pagos.some(x => x.pedidoId===id)) return;
  askSena(p);
}
function askSena(p){
  const m = $('#modal2');
  m.innerHTML = `<div class="modal-card narrow"><div class="modal-head"><h2>Registrar seña · ${esc(p.id)}</h2><button class="x" data-close>×</button></div><div class="modal-body grid">
    <p class="small muted" style="margin:0">${esc(p.clienteNombre)} · ${esc(descProd(p))} · Precio ${money(p.precioTotal)}</p>
    <label class="f"><span>Monto de la seña</span><input type="number" id="sn_m" min="0" placeholder="$"></label>
    <label class="f"><span>Medio</span><select id="sn_me">${opts(cfg('medios'), p.formaPago)}</select></label>
    <label class="f"><span>Fecha</span><input type="date" id="sn_f" value="${today()}"></label>
    <div class="row"><span class="spacer"></span><button class="btn" data-close>Ahora no</button><button class="btn pri" id="sn_ok">Registrar seña</button></div></div></div>`;
  m.classList.remove('hidden');
  m.onclick = e => { if(e.target===m || e.target.dataset.close!==undefined) m.classList.add('hidden'); };
  setTimeout(() => $('#sn_m').focus(), 50);
  $('#sn_ok').onclick = async () => {
    const monto = num($('#sn_m').value); if(!(monto>0)) return toast('Poné el monto de la seña', true);
    await run('addPago', {pago:{pedidoId:p.id, monto, medio:$('#sn_me').value, fecha:$('#sn_f').value, nota:'Seña'}}, 'Seña registrada');
    m.classList.add('hidden');
  };
}

/* ================== Calendario ================== */
function renderCalendario(v){
  if(!S.cal){ const d = new Date(); S.cal = {y:d.getFullYear(), m:d.getMonth()}; }
  const {y, m} = S.cal;
  setTop(v.label, `<button class="btn" id="cPrev">‹ Anterior</button><b style="min-width:150px;text-align:center">${MESES_L[m]} ${y}</b><button class="btn" id="cNext">Siguiente ›</button><button class="btn ghost" id="cHoy">Hoy</button><button class="btn pri" data-act="nuevoPedido">+ Nuevo pedido</button>`);
  $('#cPrev').onclick = () => { S.cal.m--; if(S.cal.m<0){S.cal.m=11;S.cal.y--;} render(); };
  $('#cNext').onclick = () => { S.cal.m++; if(S.cal.m>11){S.cal.m=0;S.cal.y++;} render(); };
  $('#cHoy').onclick = () => { S.cal = null; render(); };
  const first = new Date(y, m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
  const ev = {};
  const add = (d, h) => { if(!d) return; (ev[d.slice(0,10)] = ev[d.slice(0,10)]||[]).push(h); };
  S.d.Pedidos.filter(p=>!isPerdido(p)).forEach(p => {
    if(p.etapa==='Entregado') add(p.fechaEntregaReal, `<div class="ev done" data-ped="${esc(p.id)}">✔ ${esc(p.clienteNombre)}</div>`);
    else add(p.fechaEntregaEstimada, `<div class="ev ${isAtrasado(p)?'late':'ent'}" data-ped="${esc(p.id)}">🚚 ${esc(p.clienteNombre)} · ${esc(p.modelo||p.tipo||'')}</div>`);
  });
  S.d.Recordatorios.filter(r=>!isSi(r.hecho)).forEach(r => add(r.fecha, `<div class="ev rec" data-rec="${esc(r.id)}">${r.tipo==='resena'?'⭐':'⏰'} ${esc(r.texto)}</div>`));
  S.d.Costos.filter(c=>c.fechaPago && !isSi(c.pagado)).forEach(c => add(c.fechaPago, `<div class="ev pay ${c.fechaPago < today()?'late':''}" data-pay="${esc(c.proveedorId||'')}" data-payped="${esc(c.pedidoId||'')}">💸 ${money(c.monto)} · ${esc(c.proveedorNombre||'Proveedor')}</div>`));
  let html = `<div class="row small muted" style="margin-bottom:10px;gap:14px"><span class="ev ent">Entrega estimada</span><span class="ev late">Atrasada</span><span class="ev done">Entregado</span><span class="ev rec">Recordatorio</span><span class="ev pay">Pago a proveedor</span></div><div class="cal">`;
  html += ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<div class="dow">${d}</div>`).join('');
  const t = today();
  for(let i=0;i<42;i++){
    const d = new Date(start); d.setDate(start.getDate()+i); const k = iso(d);
    if(i===35 && d.getMonth()!==m) break;
    html += `<div class="day ${d.getMonth()!==m?'out':''} ${k===t?'today':''}"><span class="n">${d.getDate()}</span>${(ev[k]||[]).join('')}</div>`;
  }
  $('#view').innerHTML = html + '</div>';
  $$('[data-ped]').forEach(e => e.onclick = () => openPedido(e.dataset.ped));
  $$('[data-rec]').forEach(e => e.onclick = () => openRecordatorio(e.dataset.rec));
  $$('[data-pay]').forEach(e => e.onclick = () => e.dataset.pay ? openProveedor(e.dataset.pay) : e.dataset.payped && openPedido(e.dataset.payped, {tab:'costos'}));
}

/* ================== Entregas ================== */
function renderEntregas(v){
  setTop(v.label, `<button class="btn pri" data-act="nuevoPedido">+ Nuevo pedido</button>`);
  const act = S.d.Pedidos.filter(isActivo);
  const t = today(), w = addDays(t, 7), m = addDays(t, 30);
  const groups = [
    ['⚠ Atrasadas', act.filter(p => p.fechaEntregaEstimada && p.fechaEntregaEstimada < t), 'bad'],
    ['Esta semana', act.filter(p => p.fechaEntregaEstimada >= t && p.fechaEntregaEstimada <= w), 'warn'],
    ['Próximos 30 días', act.filter(p => p.fechaEntregaEstimada > w && p.fechaEntregaEstimada <= m), 'info'],
    ['Más adelante', act.filter(p => p.fechaEntregaEstimada > m), ''],
    ['Confirmados sin fecha de entrega', act.filter(p => !p.fechaEntregaEstimada && idxEtapa(p)>=2), 'acc']
  ];
  $('#view').innerHTML = groups.map(([title, list, cls]) => `
    <h3 style="margin:18px 0 8px;font-size:15px">${title} <span class="tag ${cls}">${list.length}</span></h3>
    ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Entrega</th><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Etapa</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
    ${list.sort((a,b)=>String(a.fechaEntregaEstimada).localeCompare(String(b.fechaEntregaEstimada))).map(p => { const c = cliente(p)||{}; const k = calc(p); const dd = p.fechaEntregaEstimada ? diasHasta(p.fechaEntregaEstimada) : null;
      return `<tr class="click" data-ped="${esc(p.id)}"><td><b>${fmtD(p.fechaEntregaEstimada)}</b><div class="small ${dd<0?'':'muted'}" style="${dd<0?'color:var(--bad)':''}">${dd===null?'':dd<0?`hace ${-dd} días`:dd===0?'hoy':`en ${dd} días`}</div></td>
      <td>${esc(p.id)}</td><td>${esc(p.clienteNombre)}<div class="small muted">${esc(c.direccion||'')}</div></td><td>${esc(descProd(p))}</td>
      <td><span class="tag" style="color:${ETAPA_COLOR[p.etapa]}">${esc(p.etapa)}</span></td><td class="num">${k.saldo>0?money(k.saldo):'<span class="tag ok">Pagado</span>'}</td>
      <td>${c.telefono?`<a class="btn sm wa" target="_blank" rel="noopener noreferrer" href="${waLink(c.telefono, `Hola ${c.nombre||''}! Te escribimos de RUMA por la entrega de tu pedido.`)}">WhatsApp</a>`:''}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="muted small">Nada por acá.</div>'}`).join('');
  $$('tr[data-ped]').forEach(r => r.onclick = e => fromLink(e) ? null : openPedido(r.dataset.ped));
}

/* ================== Recordatorios ================== */
function vinculoLabel(r){
  if(r.vinculoTipo==='pedido'){ const p = byId('Pedidos', r.vinculoId); return p ? `${p.id} · ${p.clienteNombre}` : ''; }
  if(r.vinculoTipo==='cliente'){ const c = byId('Clientes', r.vinculoId); return c ? `👤 ${c.nombre}` : ''; }
  if(r.vinculoTipo==='proveedor'){ const v = byId('Proveedores', r.vinculoId); return v ? `🧵 ${v.nombre}` : ''; }
  return '';
}
function vinculoOptions(sel){
  const peds = S.d.Pedidos.filter(p=>!isPerdido(p)).sort((a,b)=>b.nro-a.nro);
  return `<option value="">Sin vincular</option>
    <optgroup label="Pedidos">${peds.map(p=>`<option value="pedido|${esc(p.id)}" ${sel==='pedido|'+p.id?'selected':''}>${esc(p.id)} · ${esc(p.clienteNombre)}</option>`).join('')}</optgroup>
    <optgroup label="Clientes">${S.d.Clientes.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>`<option value="cliente|${esc(c.id)}" ${sel==='cliente|'+c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</optgroup>
    <optgroup label="Proveedores">${S.d.Proveedores.map(v=>`<option value="proveedor|${esc(v.id)}" ${sel==='proveedor|'+v.id?'selected':''}>${esc(v.nombre)}</option>`).join('')}</optgroup>`;
}
function resenaBtns(r){
  if(r.tipo!=='resena' || r.vinculoTipo!=='pedido') return '';
  const p = byId('Pedidos', r.vinculoId); if(!p) return '';
  const c = cliente(p) || {};
  const sinLink = !cfg('linkResena')[0] ? '<div class="small" style="color:var(--warn)">Falta cargar el link de reseñas de Google en Ajustes.</div>' : '';
  if(!c.telefono) return `<div class="small muted">El cliente no tiene teléfono cargado.</div>${sinLink}`;
  return `<div class="row" style="margin-top:6px"><a class="btn sm wa" target="_blank" rel="noopener noreferrer" data-resena="${esc(r.id)}" href="${waLink(c.telefono, mensajeResena(p))}">💬 Enviar mensaje por WhatsApp</a><button class="btn sm" data-copy="${esc(r.id)}">Copiar mensaje</button></div>${sinLink}`;
}
function recItem(r){
  const late = !isSi(r.hecho) && r.fecha < today();
  const vl = vinculoLabel(r);
  return `<div class="item ${isSi(r.hecho)?'done':''} ${late?'late':''}">
    <input type="checkbox" ${isSi(r.hecho)?'checked':''} data-rtog="${esc(r.id)}" title="Marcar como hecho">
    <div class="t"><div>${r.tipo==='resena'?'⭐ ':''}${esc(r.texto)}</div><div class="small muted">${fmtD(r.fecha)}${late?` · <b style="color:var(--bad)">vencido hace ${-diasHasta(r.fecha)} días</b>`:''}${vl?` · <a href="#" data-rlink="${esc(r.vinculoTipo+'|'+r.vinculoId)}">${esc(vl)}</a>`:''}</div>${isSi(r.hecho)?'':resenaBtns(r)}</div>
    <button class="btn sm ghost" data-redit="${esc(r.id)}">Editar</button><button class="btn sm ghost danger" data-rdel="${esc(r.id)}">✕</button></div>`;
}
function bindRecs(root){
  $$('[data-rtog]', root).forEach(b => b.onchange = () => run('toggleRecordatorio', {id:b.dataset.rtog}));
  $$('[data-rdel]', root).forEach(b => b.onclick = async () => { if(await confirmBox('¿Eliminar este recordatorio?','Eliminar')) run('deleteRecordatorio', {id:b.dataset.rdel}, 'Recordatorio eliminado'); });
  $$('[data-redit]', root).forEach(b => b.onclick = () => openRecordatorio(b.dataset.redit));
  $$('[data-rlink]', root).forEach(a => a.onclick = e => { e.preventDefault(); const [t,id] = a.dataset.rlink.split('|'); t==='pedido'?openPedido(id):t==='cliente'?openCliente(id):openProveedor(id); });
  // Al abrir WhatsApp con el mensaje de reseña, el recordatorio se marca como hecho
  $$('[data-resena]', root).forEach(a => a.addEventListener('click', () => { const r = byId('Recordatorios', a.dataset.resena); if(r && !isSi(r.hecho)) setTimeout(() => run('toggleRecordatorio', {id:r.id}, 'Reseña pedida ✔'), 300); }));
  $$('[data-copy]', root).forEach(b => b.onclick = async () => { const r = byId('Recordatorios', b.dataset.copy); const p = r && byId('Pedidos', r.vinculoId); if(!p) return;
    try{ await navigator.clipboard.writeText(mensajeResena(p)); toast('Mensaje copiado'); }catch(e){ toast('No se pudo copiar', true); } });
}
function recForm(prefix, vinc){
  return `<div class="grid g4" style="align-items:end">
    <label class="f"><span>Fecha</span><input type="date" id="${prefix}fecha" value="${addDays(today(),1)}"></label>
    <label class="f span2"><span>Recordatorio</span><input id="${prefix}texto" placeholder="Ej: llamar para confirmar la tela"></label>
    ${vinc===undefined ? `<label class="f"><span>Vincular a</span><select id="${prefix}vinc">${vinculoOptions('')}</select></label>` : ''}
    <div class="${vinc===undefined?'spanall':''}"><button class="btn pri" id="${prefix}add">+ Agregar recordatorio</button></div></div>`;
}
function bindRecForm(prefix, vinc){
  $('#'+prefix+'add').onclick = () => {
    const v = vinc!==undefined ? vinc : $('#'+prefix+'vinc').value;
    const [vt, vid] = v ? v.split('|') : ['',''];
    run('saveRecordatorio', {recordatorio:{fecha: $('#'+prefix+'fecha').value, texto: $('#'+prefix+'texto').value.trim(), vinculoTipo: vt, vinculoId: vid}}, 'Recordatorio agregado');
  };
}
function renderRecordatorios(v){
  setTop(v.label, `<select id="recF" style="width:auto"><option value="pend">Pendientes</option><option value="hechos">Hechos</option><option value="todos">Todos</option></select>`);
  $('#recF').value = S.recFilter;
  $('#recF').onchange = e => { S.recFilter = e.target.value; render(); };
  const t = today(), w = addDays(t,7);
  let rs = S.d.Recordatorios.slice().sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  let html = `<div class="panel" style="margin-bottom:18px"><h3>Nuevo recordatorio</h3>${recForm('nr_')}</div>`;
  if(S.recFilter==='pend'){
    rs = rs.filter(r=>!isSi(r.hecho));
    const g = [['Vencidos', rs.filter(r=>r.fecha < t)], ['Hoy', rs.filter(r=>r.fecha===t)], ['Próximos 7 días', rs.filter(r=>r.fecha>t && r.fecha<=w)], ['Más adelante', rs.filter(r=>r.fecha>w)]];
    html += g.map(([n,l]) => l.length ? `<h3 style="margin:16px 0 8px;font-size:15px">${n} <span class="tag">${l.length}</span></h3><div class="list">${l.map(recItem).join('')}</div>` : '').join('') || '<div class="empty">No hay recordatorios pendientes 🎉</div>';
  } else {
    rs = S.recFilter==='hechos' ? rs.filter(r=>isSi(r.hecho)).reverse() : rs;
    html += rs.length ? `<div class="list">${rs.map(recItem).join('')}</div>` : '<div class="empty">Sin recordatorios.</div>';
  }
  $('#view').innerHTML = html;
  bindRecForm('nr_'); bindRecs($('#view'));
}
function openRecordatorio(id){
  const r = byId('Recordatorios', id); if(!r) return;
  const m = $('#modal2');
  m.innerHTML = `<div class="modal-card narrow"><div class="modal-head"><h2>Recordatorio</h2><button class="x" data-close>×</button></div><div class="modal-body grid">
    <label class="f"><span>Fecha</span><input type="date" id="er_fecha" value="${esc(r.fecha)}"></label>
    <label class="f"><span>Texto</span><textarea id="er_texto">${esc(r.texto)}</textarea></label>
    <label class="f"><span>Vincular a</span><select id="er_vinc">${vinculoOptions(r.vinculoTipo?r.vinculoTipo+'|'+r.vinculoId:'')}</select></label>
    <label class="row"><input type="checkbox" id="er_hecho" ${isSi(r.hecho)?'checked':''}> Hecho</label>
    <div class="row"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn pri" id="er_save">Guardar</button></div></div></div>`;
  m.classList.remove('hidden');
  m.onclick = e => { if(e.target===m || e.target.dataset.close!==undefined) m.classList.add('hidden'); };
  $('#er_save').onclick = async () => {
    const [vt, vid] = $('#er_vinc').value ? $('#er_vinc').value.split('|') : ['',''];
    await run('saveRecordatorio', {recordatorio:{id, fecha:$('#er_fecha').value, texto:$('#er_texto').value.trim(), vinculoTipo:vt, vinculoId:vid, hecho:$('#er_hecho').checked?'SI':'NO'}}, 'Guardado');
    m.classList.add('hidden');
  };
}

/* ================== Clientes ================== */
function renderClientes(v){
  setTop(v.label, `<input class="search" id="q" placeholder="Buscar por nombre, teléfono, email…" value="${esc(S.q)}"><button class="btn pri" data-act="nuevoCliente">+ Nuevo cliente</button>`);
  bindFilters();
  const q = S.q.trim().toLowerCase();
  const rows = S.d.Clientes.filter(c => !q || [c.nombre,c.telefono,c.email,c.direccion].join(' ').toLowerCase().includes(q))
    .map(c => { const ps = S.d.Pedidos.filter(p=>p.clienteId===c.id && !isPerdido(p)); const g = ps.filter(isGanado);
      return {c, n: ps.length, total: g.reduce((a,p)=>a+num(p.precioTotal),0), saldo: g.reduce((a,p)=>a+Math.max(0,calc(p).saldo),0), ult: ps.map(p=>p.fechaConsulta).sort().pop()||c.fechaAlta}; })
    .sort((a,b)=>String(b.ult).localeCompare(String(a.ult)));
  $('#view').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Origen</th><th class="num">Pedidos</th><th class="num">Comprado</th><th class="num">Saldo</th><th>Último mov.</th></tr></thead><tbody>
    ${rows.map(({c,n,total,saldo,ult}) => `<tr class="click" data-cli="${esc(c.id)}"><td><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.email||'')}</div></td>
      <td>${c.telefono?`<a target="_blank" rel="noopener noreferrer" href="${waLink(c.telefono)}">${esc(c.telefono)}</a>`:'—'}</td><td>${esc(c.origen||'—')}</td>
      <td class="num">${n}</td><td class="num">${money(total)}</td><td class="num">${saldo>0?`<span class="tag warn">${money(saldo)}</span>`:'—'}</td><td>${fmtD(ult)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">${q?'Sin resultados.':'Todavía no hay clientes. Se crean solos al cargar un pedido, o con “+ Nuevo cliente”.'}</div>`;
  $$('[data-cli]').forEach(r => r.onclick = e => fromLink(e) ? null : openCliente(r.dataset.cli));
}
function clienteFields(c, pre){
  c = c || {};
  return `<label class="f span2"><span>Nombre *</span><input id="${pre}nombre" value="${esc(c.nombre)}"></label>
    <label class="f"><span>Teléfono / WhatsApp</span><input id="${pre}telefono" value="${esc(c.telefono)}" inputmode="tel" placeholder="223 5xx xxxx"></label>
    <label class="f"><span>Email</span><input id="${pre}email" type="email" value="${esc(c.email)}"></label>
    <label class="f span2"><span>Dirección de entrega</span><input id="${pre}direccion" value="${esc(c.direccion)}"></label>
    <label class="f"><span>¿Cómo nos conoció?</span><select id="${pre}origen">${opts(cfg('origenes'), c.origen, '—')}</select></label>`;
}
const readCliente = pre => ({nombre:$('#'+pre+'nombre').value.trim(), telefono:$('#'+pre+'telefono').value.trim(), email:$('#'+pre+'email').value.trim(), direccion:$('#'+pre+'direccion').value.trim(), origen:$('#'+pre+'origen').value});

/* ================== Proveedores ================== */
function renderProveedores(v){
  setTop(v.label, `<button class="btn pri" data-act="nuevoProveedor">+ Nuevo proveedor</button>`);
  const rows = S.d.Proveedores.map(p => { const cs = S.d.Costos.filter(c=>c.proveedorId===p.id);
    const prox = cs.filter(c=>!isSi(c.pagado) && c.fechaPago).map(c=>c.fechaPago).sort()[0] || '';
    return {p, n: cs.length, prox, total: cs.reduce((a,c)=>a+num(c.monto),0), deuda: cs.filter(c=>!isSi(c.pagado)).reduce((a,c)=>a+num(c.monto),0)}; })
    .sort((a,b)=>b.deuda-a.deuda || a.p.nombre.localeCompare(b.p.nombre));
  $('#view').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Proveedor</th><th>Especialidad</th><th>Teléfono</th><th class="num">Trabajos</th><th class="num">Total</th><th class="num">Pendiente de pago</th><th>Próximo pago</th></tr></thead><tbody>
    ${rows.map(({p,n,total,deuda,prox}) => `<tr class="click" data-prov="${esc(p.id)}"><td><b>${esc(p.nombre)}</b></td><td>${esc(p.especialidad||'—')}</td>
      <td>${p.telefono?`<a target="_blank" rel="noopener noreferrer" href="${waLink(p.telefono)}">${esc(p.telefono)}</a>`:'—'}</td><td class="num">${n}</td><td class="num">${money(total)}</td>
      <td class="num">${deuda>0?`<span class="tag bad">${money(deuda)}</span>`:'<span class="tag ok">Al día</span>'}</td>
      <td>${prox?`<span class="${prox < today()?'tag bad':''}">${fmtD(prox)}</span>`:'—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Cargá tus tapiceros, carpinteros, telas y fletes para seguir costos y pagos.</div>';
  $$('[data-prov]').forEach(r => r.onclick = e => fromLink(e) ? null : openProveedor(r.dataset.prov));
}

/* ================== Panel comercial ================== */
function enPeriodo(fecha){
  if(S.periodo==='todo') return true;
  if(!fecha) return false;
  const t = new Date(); let desde;
  if(S.periodo==='mes') desde = iso(new Date(t.getFullYear(), t.getMonth(), 1));
  if(S.periodo==='3m') desde = iso(new Date(t.getFullYear(), t.getMonth()-2, 1));
  if(S.periodo==='anio') desde = iso(new Date(t.getFullYear(), 0, 1));
  return fecha >= desde;
}
function bars(items, fmt){
  const max = Math.max(1, ...items.map(i=>i[1]));
  return items.length ? `<div class="bars">${items.map(([l,v,extra,color]) => `<div class="bar"><span title="${esc(l)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l)}</span><div class="track"><div class="fill" style="width:${v/max*100}%;${color?'background:'+color:''}"></div></div><span class="val">${fmt?fmt(v):v}${extra?` · ${extra}`:''}</span></div>`).join('')}</div>` : '<div class="muted small">Sin datos todavía.</div>';
}
function groupSum(list, key, val){ const m = {}; list.forEach(x => { const k = (typeof key==='function'?key(x):x[key]) || 'Sin dato'; m[k] = (m[k]||0) + (val?val(x):1); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }
function renderPanel(v){
  setTop(v.label, `<select id="per" style="width:auto"><option value="mes">Este mes</option><option value="3m">Últimos 3 meses</option><option value="anio">Este año</option><option value="todo">Todo</option></select>
    <button class="btn" id="mailRes">📧 Enviar resumen por mail</button>`);
  $('#per').value = S.periodo; $('#per').onchange = e => { S.periodo = e.target.value; render(); };
  $('#mailRes').onclick = () => run('enviarResumen', {}).then(d => toast('Resumen enviado a ' + d.enviadoA));
  const P = S.d.Pedidos;
  const activos = P.filter(isActivo);
  const perP = P.filter(p => !isSi(p.esStock) && enPeriodo(p.fechaConsulta));
  const gan = perP.filter(isGanado), perd = perP.filter(isPerdido);
  const conv = perP.length ? Math.round(gan.length / perP.length * 100) : 0;
  const ticket = gan.length ? gan.reduce((a,p)=>a+num(p.precioTotal),0)/gan.length : 0;
  const entreg = P.filter(p => p.etapa==='Entregado' && !isPerdido(p) && enPeriodo(p.fechaEntregaReal));
  const ganancia = entreg.reduce((a,p)=>a+calc(p).ganancia,0);
  const ventas = entreg.reduce((a,p)=>a+num(p.precioTotal),0);
  const saldo = P.filter(isGanado).reduce((a,p)=>a+Math.max(0,calc(p).saldo),0);
  const cobrado = S.d.Pagos.filter(x=>enPeriodo(x.fecha)).reduce((a,x)=>a+num(x.monto),0);
  const debo = S.d.Costos.filter(c=>!isSi(c.pagado)).reduce((a,c)=>a+num(c.monto),0);
  let html = `<div class="kpis">
    ${kpi('Pedidos activos', activos.length)}
    ${kpi('Valor en pipeline', money(activos.reduce((a,p)=>a+num(p.precioTotal),0)))}
    ${kpi('Saldo pendiente de cobro', money(saldo))}
    ${kpi('Entregas atrasadas', P.filter(isAtrasado).length, '', P.filter(isAtrasado).length?'bad':'ok')}
    ${kpi('Recordatorios vencidos', recsVencidos().length, '', recsVencidos().length?'bad':'ok')}
    ${kpi('Tasa de conversión', conv + '%', `${gan.length} de ${perP.length} consultas se confirmaron`)}
    ${kpi('Ticket promedio', money(ticket), 'pedidos confirmados')}
    ${kpi('Cobrado en el período', money(cobrado))}
    ${kpi('Ventas entregadas', money(ventas), entreg.length + ' pedidos')}
    ${kpi('Ganancia acumulada', money(ganancia), 'lo que recibís − costos, de lo entregado', 'ok')}
    ${kpi('A pagar a proveedores', money(debo), '', debo?'bad':'')}
    ${kpi('Perdidos', perd.length, perP.length ? Math.round(perd.length/perP.length*100)+'% de las consultas' : '')}
  </div><div class="grid g2">`;
  html += `<div class="panel"><h3>Pipeline actual por etapa</h3>${bars(ETAPAS.slice(0,5).map(e => { const l = activos.filter(p=>p.etapa===e); return [e, l.length, money(l.reduce((a,p)=>a+num(p.precioTotal),0)), ETAPA_COLOR[e]]; }))}</div>`;
  // Cobrado por mes (12 meses)
  const now = new Date(); const months = [];
  for(let i=11;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({k: d.getFullYear()+'-'+pad(d.getMonth()+1), l: MESES[d.getMonth()], v:0, c:0}); }
  S.d.Pagos.forEach(x => { const mm = months.find(m => m.k===String(x.fecha).slice(0,7)); if(mm) mm.v += num(x.monto); });
  P.filter(isGanado).forEach(p => { const h = S.d.Historial.find(h=>h.pedidoId===p.id && (h.etapaNueva==='Confirmado' || h.etapaNueva==='Seña Confirmada')); const f = (h && h.fecha) || p.fechaConsulta; const mm = months.find(m=>m.k===String(f).slice(0,7)); if(mm) mm.c++; });
  const mx = Math.max(1, ...months.map(m=>m.v));
  html += `<div class="panel"><h3>Cobrado por mes <span class="muted small">(últimos 12 meses · nº = pedidos confirmados)</span></h3><div class="vbars">${months.map(m=>`<div class="b" title="${money(m.v)}"><em>${m.c||''}</em><i style="height:${m.v/mx*100}%"></i><span>${m.l}</span></div>`).join('')}</div></div>`;
  html += `<div class="panel"><h3>Modelos más vendidos</h3>${bars(groupSum(gan, p => p.tipo==='Mueble a Medida' ? 'Mueble · '+(p.madera||'s/madera') : (p.modelo || p.tipo)).slice(0,8))}</div>`;
  const org = groupSum(perP, p => (cliente(p)||{}).origen);
  html += `<div class="panel"><h3>¿Cómo nos conocieron? <span class="muted small">consultas · conversión</span></h3>${bars(org.map(([o,n]) => { const g = gan.filter(p => ((cliente(p)||{}).origen||'Sin dato')===o).length; return [o, n, Math.round(g/n*100)+'% conv.']; }))}</div>`;
  html += `<div class="panel"><h3>Ventas por comercial</h3>${bars(groupSum(gan, 'comercial', p=>num(p.precioTotal)), money)}</div>`;
  html += `<div class="panel"><h3>Motivos de pérdida</h3>${bars(groupSum(perd, 'motivoPerdida'))}</div>`;
  html += `<div class="panel"><h3>Telas más pedidas</h3>${bars(groupSum(gan.filter(p=>p.tela), 'tela', p=>num(p.metrosTela)||1).slice(0,8), v=>Math.round(v*10)/10+' m')}</div>`;
  html += `<div class="panel"><h3>Tiempo promedio consulta → entrega</h3>${(() => { const l = entreg.filter(p=>p.fechaConsulta && p.fechaEntregaReal); if(!l.length) return '<div class="muted small">Sin entregas en el período.</div>';
    const avg = l.reduce((a,p)=>a+(parseD(p.fechaEntregaReal)-parseD(p.fechaConsulta))/86400000,0)/l.length;
    const tarde = l.filter(p=>p.fechaEntregaEstimada && p.fechaEntregaReal>p.fechaEntregaEstimada).length;
    return `<div class="kpi" style="box-shadow:none"><div class="v">${Math.round(avg)} días</div><div class="s">${l.length} entregas · ${tarde} fuera de la fecha prometida (${Math.round(tarde/l.length*100)}%)</div></div>`; })()}</div>`;
  $('#view').innerHTML = html + '</div>';
}

/* ================== Perdidos ================== */
function renderPerdidos(v){
  setTop(v.label, '');
  const l = S.d.Pedidos.filter(isPerdido).sort((a,b)=>String(b.fechaPerdida).localeCompare(String(a.fechaPerdida)));
  $('#view').innerHTML = l.length ? `<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Etapa al perder</th><th>Motivo</th><th class="num">Valor</th><th></th></tr></thead><tbody>
    ${l.map(p=>`<tr class="click" data-ped="${esc(p.id)}"><td>${fmtD(p.fechaPerdida)}</td><td>${esc(p.id)}</td><td>${esc(p.clienteNombre)}</td><td>${esc(descProd(p))}</td><td>${esc(p.etapa)}</td><td><span class="tag bad">${esc(p.motivoPerdida||'—')}</span></td><td class="num">${money(p.precioTotal)}</td>
      <td><button class="btn sm" data-rest="${esc(p.id)}">↺ Restaurar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay pedidos perdidos.</div>';
  $$('tr[data-ped]').forEach(r => r.onclick = e => { if(e.target.dataset.rest) return; openPedido(r.dataset.ped); });
  $$('[data-rest]').forEach(b => b.onclick = () => run('restaurarPedido', {id:b.dataset.rest}, 'Pedido restaurado al pipeline'));
}

/* ================== Ajustes ================== */
function renderAjustes(v){
  setTop(v.label, `<button class="btn pri" id="saveCfg">Guardar cambios</button>`);
  $('#view').innerHTML = `<div class="grid g3">
    ${Object.keys(CFG_LABELS).map(k => `<div class="panel"><h3>${esc(CFG_LABELS[k])}</h3><textarea data-cfg="${k}" rows="6" placeholder="Uno por línea">${esc(cfg(k).join('\n'))}</textarea>
      <div class="small muted" style="margin-top:6px">Uno por línea</div></div>`).join('')}
    <div class="panel span2"><h3>⭐ Reseñas en Google</h3>
      <p class="small muted" style="margin-top:0">A los ${15} días de cada entrega aparece un recordatorio con este mensaje listo para mandar por WhatsApp. Usá <b>{nombre}</b>, <b>{producto}</b> y <b>{link}</b>: se completan solos.</p>
      <label class="f"><span>Link para dejar reseña (Google Business → "Pedir reseñas")</span><input id="rs_link" placeholder="https://g.page/r/..." value="${esc(cfg('linkResena')[0]||'')}"></label>
      <label class="f" style="margin-top:10px"><span>Mensaje</span><textarea id="rs_msg" rows="7">${esc(cfg('mensajeResena')[0] || DEF_MSG_RESENA)}</textarea></label>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="rs_save">Guardar mensaje</button><button class="btn ghost" id="rs_def">Restaurar mensaje sugerido</button></div></div>
    <div class="panel"><h3>Seguridad</h3><p class="small muted" style="margin-top:0">Ingresaste como <b>${esc(S.d.user)}</b>. Usuarios activos: ${esc((S.d.usuarios||[]).join(', '))}.<br>Los usuarios y contraseñas se crean, cambian o eliminan desde la planilla: menú <b>RUMA CRM</b>. Ahí también podés cerrar todas las sesiones abiertas.</p>
      <button class="btn" data-act="salir">Cerrar sesión</button></div>
    <div class="panel"><h3>Resumen diario por mail</h3><p class="small muted" style="margin-top:0">Todos los días a las 8 h te llega un mail con entregas atrasadas, entregas de la semana y recordatorios.</p>
      <label class="row"><input type="checkbox" id="resDia" ${S.d.resumenDiario?'checked':''}> Activado</label></div>
    <div class="panel"><h3>Tu base de datos</h3><p class="small muted" style="margin-top:0">Todo vive en tu Google Sheets; las fotos en tu Google Drive. Para respaldar: Archivo → Descargar, o el historial de versiones de Sheets.</p>
      <div class="row"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(S.d.sheetUrl)}">📊 Abrir planilla</a><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(S.d.folderUrl)}">📁 Carpeta de fotos</a></div></div>
  </div>`;
  $('#saveCfg').onclick = () => { const c = {}; $$('[data-cfg]').forEach(t => c[t.dataset.cfg] = t.value.split('\n').map(s=>s.trim()).filter(Boolean)); run('saveConfig', {config:c}, 'Ajustes guardados'); };
  $('#rs_def').onclick = () => { $('#rs_msg').value = DEF_MSG_RESENA; };
  $('#rs_save').onclick = () => {
    const link = $('#rs_link').value.trim();
    if(link && !/^https:\/\/[^\s"'<>]+$/.test(link)) return toast('El link tiene que empezar con https://', true);
    run('saveConfig', {config:{linkResena: link?[link]:[], mensajeResena:[$('#rs_msg').value.trim()]}}, 'Mensaje de reseña guardado');
  };
  $('#resDia').onchange = e => run('setResumenDiario', {activo:e.target.checked}, e.target.checked ? 'Resumen diario activado' : 'Resumen diario desactivado');
}

/* ================== Modal genérico ================== */
function openModal(state){ S.modal = state; renderModal(); $('#modal').classList.remove('hidden'); }
function closeModal(){ S.modal = null; $('#modal').classList.add('hidden'); $('#modal').innerHTML=''; }
$('#modal').addEventListener('mousedown', e => { if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape'){ if(!$('#modal2').classList.contains('hidden')) $('#modal2').classList.add('hidden'); else if(S.modal) closeModal(); } });
function renderModal(){
  const m = S.modal; if(!m) return;
  if(m.type==='pedido') renderPedidoModal();
  if(m.type==='cliente') renderClienteModal();
  if(m.type==='proveedor') renderProveedorModal();
}

/* ================== Modal Pedido ================== */
function openPedido(id, o){ o = o||{}; openModal({type:'pedido', id:id||null, tab:o.tab||'datos', clienteId:o.clienteId||'', draft:null}); }
function pedidoTabs(p){
  const n = t => S.d[t].filter(x => x.pedidoId===p.id).length;
  const tabs = [['datos','Datos'],['pagos','Pagos ('+n('Pagos')+')'],['costos','Costos ('+n('Costos')+')'],['notas','Notas ('+n('Notas')+')'],['fotos','Fotos ('+n('Fotos')+')'],['recs','Recordatorios'],['hist','Historial']];
  return `<div class="tabs">${tabs.map(([k,l]) => `<button data-tab="${k}" class="${S.modal.tab===k?'on':''}" ${!p.id && k!=='datos'?'disabled':''}>${l}</button>`).join('')}</div>`;
}
function renderPedidoModal(){
  const m = S.modal;
  const p = m.id ? byId('Pedidos', m.id) : null;
  if(m.id && !p){ closeModal(); return; }
  const P = p || {tipo:'Sillón/Sofá', etapa:'Consulta', fechaConsulta:today(), cantidad:1, clienteId:m.clienteId, comercial: cfg('comerciales')[0]||''};
  const c = P.id ? calc(P) : null;
  const cli = P.clienteId ? byId('Clientes', P.clienteId) : null;
  let head = `<div class="modal-head"><h2>${P.id ? esc(P.id)+' · '+esc(P.clienteNombre||'') : 'Nuevo pedido'}</h2>
    ${P.id && isPerdido(P) ? '<span class="tag bad">PERDIDO</span>' : ''}
    ${cli && cli.telefono ? `<a class="btn sm wa" target="_blank" rel="noopener noreferrer" href="${waLink(cli.telefono, `Hola ${cli.nombre}! Te escribimos de RUMA por tu pedido ${P.id}.`)}">WhatsApp</a>` : ''}
    ${P.id ? `<button class="btn sm" id="pPrint">🖨 Orden de trabajo</button>` : ''}
    ${P.id ? (isPerdido(P) ? `<button class="btn sm" id="pRest">↺ Restaurar</button>` : `<button class="btn sm" id="pLost">Marcar perdido</button>`) : ''}
    ${P.id ? `<button class="btn sm danger" id="pDel">Eliminar</button>` : ''}
    <button class="x" data-act="cerrar">×</button></div>`;
  let body = '';
  if(m.tab==='datos') body = pedidoForm(P);
  else {
    body = `<div class="money"><div><div class="l">Precio</div><div class="v">${money(c.precio)}</div></div><div><div class="l">Pagado</div><div class="v" style="color:var(--ok)">${money(c.pagado)}</div></div>
      <div><div class="l">Saldo</div><div class="v" style="color:${c.saldo>0?'var(--bad)':'var(--ok)'}">${money(c.saldo)}</div></div><div><div class="l">A recibir</div><div class="v">${money(c.recibir)}</div></div><div><div class="l">Costos</div><div class="v">${money(c.costos)}</div></div>
      <div><div class="l">Ganancia</div><div class="v">${money(c.ganancia)}${c.recibir?` <span class="small muted">${Math.round(c.ganancia/c.recibir*100)}%</span>`:''}</div></div></div>`;
    body += {pagos:tabPagos, costos:tabCostos, notas:tabNotas, fotos:tabFotos, recs:tabRecs, hist:tabHist}[m.tab](P, c);
  }
  $('#modal').innerHTML = `<div class="modal-card">${head}${pedidoTabs(P)}<div class="modal-body">${body}</div></div>`;
  $$('[data-tab]', $('#modal')).forEach(b => b.onclick = () => { if(m.tab==='datos') m.draft = readPedidoForm(true); S.modal.tab = b.dataset.tab; renderModal(); });
  if(P.id){
    $('#pPrint').onclick = () => printOrden(P);
    $('#pDel').onclick = async () => { if(await confirmBox(`¿Eliminar ${P.id} con sus pagos, costos, notas y fotos? No se puede deshacer.`, 'Eliminar')){ await run('deletePedido', {id:P.id}, 'Pedido eliminado'); closeModal(); } };
    if($('#pLost')) $('#pLost').onclick = () => openPerdido(P);
    if($('#pRest')) $('#pRest').onclick = () => run('restaurarPedido', {id:P.id}, 'Pedido restaurado');
  }
  bindPedidoTab(P);
}
function pedidoForm(P){
  const dr = S.modal.draft ? Object.fromEntries(Object.entries(S.modal.draft.pedido).filter(([k,v]) => v!==undefined)) : null;
  const d = dr ? Object.assign({}, P, dr) : P;
  const cli = d.clienteId ? byId('Clientes', d.clienteId) : null;
  const cliLabel = c => c.nombre + (c.telefono ? ' · ' + c.telefono : '');
  const stock = isSi(d.esStock);
  return `<div class="grid g4">
    <div class="sect">Cliente</div>
    <label class="f span3"><span>Cliente (buscá o escribí un nombre nuevo)</span><input id="p_cli" list="dlCli" autocomplete="off" value="${esc(cli?cliLabel(cli):(S.modal.draft&&S.modal.draft.cliText)||'')}" ${stock?'disabled':''}>
      <datalist id="dlCli">${S.d.Clientes.map(c=>`<option value="${esc(cliLabel(c))}">`).join('')}</datalist></label>
    <label class="row" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="p_stock" ${stock?'checked':''}> Pedido de stock para el local</label>
    <div class="spanall newcli hidden" id="newCli"><div class="small" style="margin-bottom:8px"><b>Cliente nuevo</b> — se va a crear al guardar.</div><div class="grid g4">${clienteFields({nombre:''}, 'nc_')}</div></div>

    <div class="sect">Producto</div>
    <label class="f"><span>Tipo</span><select id="p_tipo">${opts(TIPOS, d.tipo)}</select></label>
    <label class="f s-sillon"><span>Modelo</span><input id="p_modelo" list="dlMod" value="${esc(d.modelo)}"><datalist id="dlMod">${cfg('modelos').map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="f s-sillon"><span>Tela</span><input id="p_tela" list="dlTela" value="${esc(d.tela)}"><datalist id="dlTela">${cfg('telas').map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="f s-sillon"><span>Color</span><input id="p_color" value="${esc(d.color)}"></label>
    <label class="f s-sillon"><span>Metros de tela</span><input id="p_metros" type="number" step="0.1" min="0" value="${esc(d.metrosTela)}"></label>
    <label class="f s-sillon"><span>Funda</span><select id="p_funda">${opts(['No','Sí'], d.funda||'No')}</select></label>
    <label class="f s-sillon s-funda"><span>Color de funda</span><input id="p_colorFunda" value="${esc(d.colorFunda)}"></label>
    <label class="f s-mueble"><span>Madera</span><input id="p_madera" list="dlMad" value="${esc(d.madera)}"><datalist id="dlMad">${cfg('maderas').map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="f s-mueble"><span>Terminación</span><input id="p_term" list="dlTerm" value="${esc(d.terminacion)}"><datalist id="dlTerm">${cfg('terminaciones').map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="f"><span>Largo (cm)</span><select id="p_largo">${optsMedida(30, 400, d.largo)}</select></label>
    <label class="f"><span>Profundidad (cm)</span><select id="p_prof">${optsMedida(30, 200, d.profundidad)}</select></label>
    <label class="f"><span>Alto (cm)</span><select id="p_alto">${optsMedida(20, 250, d.alto)}</select></label>
    ${d.medidas && !num(d.largo) && !num(d.profundidad) && !num(d.alto) ? `<div class="small muted" style="align-self:end;padding-bottom:10px">Medidas anteriores: <b>${esc(d.medidas)}</b></div>` : ''}
    <label class="f"><span>Cantidad</span><input id="p_cant" type="number" min="1" value="${esc(d.cantidad||1)}"></label>
    <label class="f spanall"><span>Detalles adicionales</span><textarea id="p_det" rows="2">${esc(d.detalles)}</textarea></label>

    <div class="sect">Comercial y fechas</div>
    <label class="f"><span>Etapa</span><select id="p_etapa">${opts(ETAPAS, d.etapa==='Seña Confirmada'?'Confirmado':d.etapa)}</select></label>
    <label class="f"><span>Comercial</span><select id="p_com">${opts(cfg('comerciales'), d.comercial, '—')}</select></label>
    <label class="f s-sena"><span>Seña (se registra como pago)</span><input id="p_sena" type="number" min="0" placeholder="$"></label>
    <span></span>

    <div class="sect">Precio</div>
    <label class="f"><span>Precio de lista</span><input id="p_lista" type="number" min="0" step="1" value="${esc(num(d.precioLista) ? d.precioLista : d.precioTotal)}" placeholder="$"></label>
    <label class="f"><span>Forma de pago</span><select id="p_forma">${opts(FORMAS_PAGO, d.formaPago, '—')}</select></label>
    <label class="f s-pct"><span id="p_pctLbl">%</span><input id="p_pct" type="number" min="0" max="100" step="0.5" value="${esc(d.ajustePct)}" placeholder="0"></label>
    <div class="precio-box" id="p_resumen"></div>
    <label class="f"><span>Fecha de consulta</span><input id="p_fcons" type="date" value="${esc(d.fechaConsulta)}"></label>
    <label class="f"><span>Entrega estimada</span><input id="p_fest" type="date" value="${esc(d.fechaEntregaEstimada)}"></label>
    <label class="f"><span>Entrega real</span><input id="p_freal" type="date" value="${esc(d.fechaEntregaReal)}"></label>
    <div class="spanall row" style="margin-top:8px"><span class="spacer"></span>${P.id?'':'<button class="btn" data-act="cerrar">Cancelar</button>'}<button class="btn pri" id="pSave">${P.id?'Guardar cambios':'Crear pedido'}</button></div>
  </div>`;
}
function optsMedida(min, max, sel){
  let o = '<option value="">—</option>'; sel = num(sel);
  for(let v=min; v<=max; v+=5) o += `<option value="${v}" ${v===sel?'selected':''}>${v}</option>`;
  if(sel && (sel<min || sel>max || sel%5)) o += `<option value="${sel}" selected>${sel}</option>`;
  return o;
}
function syncPrecio(){
  const pr = precios($('#p_lista').value, $('#p_forma').value, $('#p_pct').value);
  const t = tipoAjuste($('#p_forma').value);
  $('.s-pct').classList.toggle('hidden', !t);
  $('#p_pctLbl').textContent = t==='desc' ? '% de descuento al cliente' : '% de comisión (la absorbés vos)';
  $('#p_resumen').innerHTML = num($('#p_lista').value) ? `
    <div><span>Precio al cliente</span><b>${money(pr.cliente)}</b></div>
    ${t==='desc'?`<div><span>Descuento</span><b style="color:var(--bad)">− ${money(pr.ajuste)}</b></div>`:''}
    ${t==='com'?`<div><span>Comisión</span><b style="color:var(--bad)">− ${money(pr.ajuste)}</b></div>`:''}
    <div class="tot"><span>Total a recibir</span><b>${money(pr.recibir)}</b></div>` : '<div class="muted small">Cargá el precio de lista para ver el cálculo.</div>';
}
function syncPedidoForm(){
  const tipo = $('#p_tipo').value;
  const conf = ETAPAS.indexOf($('#p_etapa').value) >= 2 && !(S.modal.id && S.d.Pagos.some(x => x.pedidoId===S.modal.id));
  $$('.s-sena').forEach(e => e.classList.toggle('hidden', !conf));
  syncPrecio();
  $$('.s-sillon').forEach(e => e.classList.toggle('hidden', tipo!=='Sillón/Sofá'));
  $$('.s-mueble').forEach(e => e.classList.toggle('hidden', tipo!=='Mueble a Medida'));
  $$('.s-funda').forEach(e => e.classList.toggle('hidden', tipo!=='Sillón/Sofá' || $('#p_funda').value!=='Sí'));
  const stock = $('#p_stock').checked; $('#p_cli').disabled = stock;
  const txt = $('#p_cli').value.trim();
  const match = matchCliente(txt);
  const nc = $('#newCli'); nc.classList.toggle('hidden', stock || !txt || !!match);
  if(!match && txt && !stock) $('#nc_nombre').value = txt;
}
function matchCliente(txt){ if(!txt) return null; return S.d.Clientes.find(c => (c.nombre + (c.telefono ? ' · ' + c.telefono : ''))===txt || c.nombre.toLowerCase()===txt.toLowerCase()) || null; }
function readPedidoForm(draftOnly){
  const txt = $('#p_cli').value.trim(); const match = matchCliente(txt); const stock = $('#p_stock').checked;
  const pedido = {
    id: S.modal.id || undefined, esStock: stock?'SI':'NO', clienteId: stock ? '' : (match ? match.id : ''),
    tipo: $('#p_tipo').value, modelo: $('#p_modelo').value.trim(), tela: $('#p_tela').value.trim(), color: $('#p_color').value.trim(),
    metrosTela: $('#p_metros').value, funda: $('#p_funda').value, colorFunda: $('#p_colorFunda').value.trim(), madera: $('#p_madera').value.trim(),
    terminacion: $('#p_term').value.trim(), largo: $('#p_largo').value, profundidad: $('#p_prof').value, alto: $('#p_alto').value,
    cantidad: $('#p_cant').value || 1, detalles: $('#p_det').value.trim(),
    etapa: $('#p_etapa').value, precioLista: $('#p_lista').value, formaPago: $('#p_forma').value,
    ajustePct: tipoAjuste($('#p_forma').value) ? $('#p_pct').value : '', comercial: $('#p_com').value,
    fechaConsulta: $('#p_fcons').value, fechaEntregaEstimada: $('#p_fest').value, fechaEntregaReal: $('#p_freal').value
  };
  if(pedido.tipo!=='Sillón/Sofá'){ pedido.modelo=''; pedido.tela=''; pedido.color=''; pedido.metrosTela=''; pedido.funda=''; pedido.colorFunda=''; }
  if(pedido.tipo!=='Mueble a Medida'){ pedido.madera=''; pedido.terminacion=''; }
  const clienteNuevo = (!stock && !match && txt) ? readCliente('nc_') : null;
  const sena = $('#p_sena') && !$('.s-sena').classList.contains('hidden') ? num($('#p_sena').value) : 0;
  return {pedido, clienteNuevo, sena, cliText: txt, draftOnly};
}
function bindPedidoTab(P){
  const tab = S.modal.tab;
  if(tab==='datos'){
    ['#p_tipo','#p_funda','#p_stock','#p_etapa','#p_forma'].forEach(s => $(s).onchange = syncPedidoForm);
    ['#p_lista','#p_pct'].forEach(s => $(s).oninput = syncPrecio);
    $('#p_cli').oninput = syncPedidoForm;
    syncPedidoForm();
    $('#pSave').onclick = async () => {
      const f = readPedidoForm();
      if(f.pedido.esStock!=='SI' && !f.pedido.clienteId && !f.clienteNuevo) return toast('Elegí o escribí un cliente (o marcá “stock”)', true);
      const d = await run('savePedido', {pedido:f.pedido, clienteNuevo:f.clienteNuevo}, P.id ? 'Pedido guardado' : 'Pedido creado');
      const saved = d.put.Pedidos[d.put.Pedidos.length-1];
      S.modal.draft = null;
      if(f.sena > 0){ await run('addPago', {pago:{pedidoId:saved.id, monto:f.sena, medio:f.pedido.formaPago || cfg('medios')[0] || '', fecha:today(), nota:'Seña'}}, 'Seña registrada'); }
      if(!P.id){ S.modal.id = saved.id; S.modal.tab = 'fotos'; renderModal(); }
    };
  }
  if(tab==='pagos'){
    $('#pgAdd').onclick = () => run('addPago', {pago:{pedidoId:P.id, fecha:$('#pg_f').value, monto:num($('#pg_m').value), medio:$('#pg_me').value, nota:$('#pg_n').value.trim()}}, 'Pago registrado');
    $$('[data-pgdel]').forEach(b => b.onclick = async () => { if(await confirmBox('¿Eliminar este pago?','Eliminar')) run('deletePago', {id:b.dataset.pgdel}, 'Pago eliminado'); });
  }
  if(tab==='costos'){
    const syncProv = () => $('#cs_new').classList.toggle('hidden', $('#cs_p').value!=='__nuevo');
    $('#cs_p').onchange = syncProv; syncProv();
    $('#csAdd').onclick = () => {
      const nuevo = $('#cs_p').value==='__nuevo';
      if(nuevo && !$('#cs_nn').value.trim()) return toast('Escribí el nombre del proveedor nuevo', true);
      const ck = id => $(id).checked ? 'SI' : 'NO';
      run('addCosto', {costo:{pedidoId:P.id, proveedorId: nuevo ? '' : $('#cs_p').value, concepto:$('#cs_c').value.trim(), monto:num($('#cs_m').value), fecha:$('#cs_f').value,
        fechaPago:$('#cs_fp').value, pedidoProv:ck('#cs_pp'), recibido:ck('#cs_rc'), entregado:ck('#cs_en'), pagado:ck('#cs_pg')},
        proveedorNuevo: nuevo ? {nombre:$('#cs_nn').value.trim(), especialidad:$('#cs_ne').value} : null}, nuevo ? 'Costo y proveedor nuevo registrados' : 'Costo registrado');
    };
    bindCostos($('#modal'));
  }
  if(tab==='notas'){
    $('#ntAdd').onclick = () => { const t = $('#nt_t').value.trim(); if(!t) return; run('addNota', {pedidoId:P.id, texto:t}, 'Nota agregada'); };
    $$('[data-ntdel]').forEach(b => b.onclick = async () => { if(await confirmBox('¿Eliminar esta nota?','Eliminar')) run('deleteNota', {id:b.dataset.ntdel}); });
  }
  if(tab==='fotos'){
    const inp = $('#fileIn');
    $('#drop').onclick = () => inp.click();
    inp.onchange = () => uploadFotos(P, Array.from(inp.files));
    const dz = $('#drop');
    dz.ondragover = e => { e.preventDefault(); dz.style.borderColor='var(--accent)'; };
    dz.ondragleave = () => dz.style.borderColor='';
    dz.ondrop = e => { e.preventDefault(); uploadFotos(P, Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'))); };
    $$('[data-ver]').forEach(d => d.onclick = e => { if(e.target.closest('[data-fdel]')) return; verFoto(P.id, d.dataset.ver); });
    $$('[data-fdel]').forEach(b => b.onclick = async e => { e.stopPropagation(); if(await confirmBox('¿Eliminar esta foto? También se borra de Drive.','Eliminar')) run('deleteFoto', {id:b.dataset.fdel}, 'Foto eliminada'); });
  }
  if(tab==='recs'){ bindRecForm('pr_', 'pedido|'+P.id); bindRecs($('#modal')); }
}
function tabPagos(P, c){
  const l = S.d.Pagos.filter(x=>x.pedidoId===P.id).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  return `${l.length ? `<div class="tbl-wrap" style="margin-bottom:14px"><table><thead><tr><th>Fecha</th><th>Medio</th><th>Nota</th><th class="num">Monto</th><th></th></tr></thead><tbody>
    ${l.map(x=>`<tr><td>${fmtD(x.fecha)}</td><td>${esc(x.medio)}</td><td>${esc(x.nota)}</td><td class="num"><b>${money(x.monto)}</b></td><td><button class="btn sm ghost danger" data-pgdel="${esc(x.id)}">✕</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Todavía no hay pagos registrados.</p>'}
    <div class="panel"><h3>Registrar pago</h3><div class="grid g4" style="align-items:end">
      <label class="f"><span>Fecha</span><input type="date" id="pg_f" value="${today()}"></label>
      <label class="f"><span>Monto</span><input type="number" id="pg_m" min="0" value="${c.saldo>0?Math.round(c.saldo):''}"></label>
      <label class="f"><span>Medio</span><select id="pg_me">${opts(cfg('medios'))}</select></label>
      <label class="f"><span>Nota</span><input id="pg_n" placeholder="Seña, saldo, cuota…"></label>
      <div class="spanall"><button class="btn pri" id="pgAdd">+ Registrar pago</button></div></div></div>`;
}
const ESTADOS_COSTO = [['pedidoProv','Pedido'],['recibido','Recibido'],['entregado','Entregado'],['pagado','Pagado']];
function costosTable(l, showPedido){
  return l.length ? `<div class="tbl-wrap" style="margin-bottom:14px"><table class="costos"><thead><tr><th>Fecha</th>${showPedido?'<th>Pedido</th>':'<th>Proveedor</th>'}<th>Concepto</th><th class="num">Monto</th><th>Fecha de pago</th>${ESTADOS_COSTO.map(([k,l])=>`<th class="ck">${l}</th>`).join('')}<th></th></tr></thead><tbody>
    ${l.map(x=>{ const p = byId('Pedidos', x.pedidoId); const venc = x.fechaPago && !isSi(x.pagado) && x.fechaPago < today();
      return `<tr><td>${fmtD(x.fecha)}</td>${showPedido?`<td>${p?`<a href="#" data-openped="${esc(p.id)}">${esc(p.id)} · ${esc(p.clienteNombre)}</a>`:'—'}</td>`:`<td>${esc(x.proveedorNombre||'Sin proveedor')}</td>`}
      <td>${esc(x.concepto)}</td><td class="num"><b>${money(x.monto)}</b>${isSi(x.pagado)?'':'<div><span class="tag bad">Debo</span></div>'}</td>
      <td><input type="date" class="fp ${venc?'venc':''}" data-fp="${esc(x.id)}" value="${esc(x.fechaPago||'')}" title="Agendá cuándo le pagás: aparece en el calendario"></td>
      ${ESTADOS_COSTO.map(([k])=>`<td class="ck"><input type="checkbox" data-cstog="${esc(x.id)}" data-campo="${k}" ${isSi(x[k])?'checked':''}></td>`).join('')}
      <td><button class="btn sm ghost danger" data-csdel="${esc(x.id)}">✕</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">Sin costos registrados.</p>';
}
function bindCostos(root){
  $$('[data-cstog]', root).forEach(b => b.onchange = () => run('toggleCosto', {id:b.dataset.cstog, campo:b.dataset.campo}));
  $$('[data-fp]', root).forEach(i => i.onchange = () => run('setFechaPagoCosto', {id:i.dataset.fp, fechaPago:i.value}, i.value ? 'Pago agendado para el ' + fmtD(i.value).replace(/&#39;/g,"'") : 'Fecha de pago quitada'));
  $$('[data-csdel]', root).forEach(b => b.onclick = async () => { if(await confirmBox('¿Eliminar este costo?','Eliminar')) run('deleteCosto', {id:b.dataset.csdel}, 'Costo eliminado'); });
  $$('[data-openped]', root).forEach(a => a.onclick = e => { e.preventDefault(); openPedido(a.dataset.openped); });
}
function tabCostos(P){
  const l = S.d.Costos.filter(x=>x.pedidoId===P.id);
  return `${costosTable(l)}<div class="panel"><h3>Registrar costo / pedido a proveedor</h3><div class="grid g4" style="align-items:end">
    <label class="f"><span>Proveedor</span><select id="cs_p"><option value="">Sin proveedor asociado</option>${S.d.Proveedores.map(v=>`<option value="${esc(v.id)}">${esc(v.nombre)} · ${esc(v.especialidad||'')}</option>`).join('')}<option value="__nuevo">➕ Nuevo proveedor…</option></select></label>
    <label class="f"><span>Concepto</span><input id="cs_c" placeholder="Tela, estructura, flete…"></label>
    <label class="f"><span>Monto</span><input type="number" id="cs_m" min="0"></label>
    <label class="f"><span>Fecha</span><input type="date" id="cs_f" value="${today()}"></label>
    <div class="spanall newcli hidden" id="cs_new"><div class="small" style="margin-bottom:8px"><b>Proveedor nuevo</b> — se crea al registrar el costo. Después completás teléfono y demás en <b>Proveedores</b>.</div>
      <div class="grid g2"><label class="f"><span>Nombre *</span><input id="cs_nn"></label><label class="f"><span>Especialidad</span><select id="cs_ne">${opts(cfg('especialidades'), '', '—')}</select></label></div></div>
    <label class="f"><span>Fecha de pago (se agenda en el calendario)</span><input type="date" id="cs_fp"></label>
    <div class="row spanall" style="gap:18px"><label class="row"><input type="checkbox" id="cs_pp"> Pedido</label><label class="row"><input type="checkbox" id="cs_rc"> Recibido</label><label class="row"><input type="checkbox" id="cs_en"> Entregado</label><label class="row"><input type="checkbox" id="cs_pg"> Pagado</label></div>
    <div class="spanall"><button class="btn pri" id="csAdd">+ Registrar costo</button></div></div></div>`;
}
function tabNotas(P){
  const l = S.d.Notas.filter(x=>x.pedidoId===P.id).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  return `<div class="panel" style="margin-bottom:14px"><textarea id="nt_t" placeholder="Escribí una nota: lo que habló el cliente, cambios, avisos del taller…"></textarea><div class="row" style="margin-top:8px"><span class="spacer"></span><button class="btn pri" id="ntAdd">+ Agregar nota</button></div></div>
    <div class="list">${l.map(n=>`<div class="item"><div class="t"><div style="white-space:pre-wrap">${esc(n.texto)}</div><div class="small muted">${fmtDT(n.fecha)}${n.autor?' · '+esc(n.autor):''}</div></div><button class="btn sm ghost danger" data-ntdel="${esc(n.id)}">✕</button></div>`).join('') || '<p class="muted">Sin notas todavía.</p>'}</div>`;
}
function tabFotos(P){
  const l = S.d.Fotos.filter(x=>x.pedidoId===P.id);
  return `<input type="file" id="fileIn" accept="image/*" multiple class="hidden">
    <div class="drop" id="drop" style="margin-bottom:14px"><b>📷 Subir fotos</b><div class="small">Tocá para elegir o arrastrá acá. Se achican solas (~200 KB c/u) y quedan en Drive, con su link en la hoja “Fotos”.</div></div>
    ${P.carpetaUrl?`<p class="small"><a target="_blank" rel="noopener noreferrer" href="${esc(P.carpetaUrl)}">📁 Abrir carpeta del pedido en Drive</a></p>`:''}
    <div class="photos">${l.map(f=>`<div class="ph" data-ver="${esc(f.id)}" title="Ver en grande">${f.miniatura?`<img src="${esc(f.miniatura)}" alt="">`:'<div class="empty">🖼</div>'}<span class="open">🔍 Ver</span><button class="del" data-fdel="${esc(f.id)}">✕</button></div>`).join('')}</div>
    ${!l.length?'<p class="muted">Sin fotos todavía: tela elegida, referencias, avance en el taller, entrega…</p>':''}`;
}
function tabRecs(P){
  const l = S.d.Recordatorios.filter(r=>r.vinculoTipo==='pedido' && r.vinculoId===P.id).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  return `<div class="panel" style="margin-bottom:14px">${recForm('pr_', 'pedido|'+P.id)}</div><div class="list">${l.map(recItem).join('') || '<p class="muted">Sin recordatorios para este pedido.</p>'}</div>`;
}
function tabHist(P){
  const l = S.d.Historial.filter(h=>h.pedidoId===P.id).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  return `<div class="list">${l.map(h=>`<div class="item"><div class="t">${h.etapaAnterior?`${esc(h.etapaAnterior)} → `:'Creado en '}<b>${esc(h.etapaNueva)}</b><div class="small muted">${fmtDT(h.fecha)}${h.usuario?' · '+esc(h.usuario):''}</div></div></div>`).join('') || '<p class="muted">Sin movimientos.</p>'}</div>`;
}
function openPerdido(P){
  const m = $('#modal2');
  m.innerHTML = `<div class="modal-card narrow"><div class="modal-head"><h2>Marcar ${esc(P.id)} como perdido</h2><button class="x" data-close>×</button></div><div class="modal-body grid">
    <label class="f"><span>Motivo</span><select id="lp_m">${opts(cfg('motivosPerdida'))}</select></label>
    <label class="f"><span>Comentario (opcional)</span><textarea id="lp_n"></textarea></label>
    <div class="row"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn pri" id="lp_ok">Marcar perdido</button></div></div></div>`;
  m.classList.remove('hidden');
  m.onclick = e => { if(e.target===m || e.target.dataset.close!==undefined) m.classList.add('hidden'); };
  $('#lp_ok').onclick = async () => { await run('marcarPerdido', {id:P.id, motivo:$('#lp_m').value, nota:$('#lp_n').value.trim()}, 'Movido a Perdidos'); m.classList.add('hidden'); closeModal(); };
}

/* ===== Fotos: compresión en el navegador ===== */
function loadImg(file){
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer ' + file.name)); i.src = r.result; }; r.onerror = rej; r.readAsDataURL(file); });
}
function resize(img, max, q){
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width*s); cv.height = Math.round(img.height*s);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', q);
}
/** Achica la foto para que pese ~250 KB o menos (se ve bien en pantalla y no llena el Drive). */
function achicar(img){
  let max = 1280, q = 0.72, d = resize(img, max, q);
  while(d.length > 340000 && q > 0.45){ q -= 0.08; d = resize(img, max, q); }
  while(d.length > 340000 && max > 800){ max -= 160; d = resize(img, max, q); }
  return d;
}

/* ===== Visor de fotos en grande ===== */
const FOTO_CACHE = {};
async function verFoto(pedidoId, fotoId){
  const lista = S.d.Fotos.filter(x => x.pedidoId===pedidoId);
  let i = Math.max(0, lista.findIndex(x => x.id===fotoId));
  let lb = $('#lightbox');
  if(!lb){ lb = document.createElement('div'); lb.id = 'lightbox'; document.body.appendChild(lb); }
  const cerrar = () => { lb.classList.add('hidden'); document.removeEventListener('keydown', teclas); };
  const teclas = e => { if(e.key==='Escape') cerrar(); if(e.key==='ArrowRight') mover(1); if(e.key==='ArrowLeft') mover(-1); };
  const mover = n => { if(lista.length < 2) return; i = (i + n + lista.length) % lista.length; mostrar(); };
  async function mostrar(){
    const f = lista[i];
    lb.innerHTML = `<div class="lb-top"><span>${i+1} / ${lista.length} · ${esc(f.nombre||'')}</span><span class="spacer"></span>
      <a class="btn sm" target="_blank" rel="noopener noreferrer" href="${esc(f.url)}">Abrir en Drive</a><button class="btn sm" data-lb="x">✕ Cerrar</button></div>
      ${lista.length>1?'<button class="lb-nav prev" data-lb="p">‹</button><button class="lb-nav next" data-lb="n">›</button>':''}
      <div class="lb-img">${f.miniatura?`<img src="${esc(f.miniatura)}" class="blur" alt="">`:''}<div class="lb-load">Cargando…</div></div>`;
    lb.classList.remove('hidden');
    try{
      if(!FOTO_CACHE[f.id]) FOTO_CACHE[f.id] = (await call('getFoto', {id:f.id})).dataUrl;
      if(lista[i]!==f) return;
      $('.lb-img', lb).innerHTML = `<img src="${esc(FOTO_CACHE[f.id])}" alt="">`;
    }catch(e){ const l = $('.lb-load', lb); if(l) l.textContent = e.message; }
  }
  lb.onclick = e => { const a = e.target.dataset.lb; if(a==='x' || e.target===lb) cerrar(); if(a==='p') mover(-1); if(a==='n') mover(1); };
  document.addEventListener('keydown', teclas);
  mostrar();
}

async function uploadFotos(P, files){
  if(!files.length) return;
  for(let i=0;i < files.length;i++){
    toast(`Subiendo foto ${i+1} de ${files.length}…`);
    try{
      const img = await loadImg(files[i]);
      const full = achicar(img);
      let thumb = resize(img, 240, 0.6); if(thumb.length > 45000) thumb = resize(img, 160, 0.5);
      await run('uploadFoto', {pedidoId:P.id, nombre:files[i].name, dataUrl:full, thumb});
    }catch(e){ /* toast ya mostrado */ }
  }
  toast('Fotos guardadas ✔');
}

/* ===== Orden de trabajo imprimible ===== */
function printOrden(P){
  const c = cliente(P) || {}; const k = calc(P);
  const fotos = S.d.Fotos.filter(f=>f.pedidoId===P.id && f.miniatura).slice(0,6);
  const row = (l,v) => v ? `<tr><td style="width:35%"><b>${esc(l)}</b></td><td>${esc(v)}</td></tr>` : '';
  $('#print').innerHTML = `<h1>RUMA · Orden de trabajo ${esc(P.id)}</h1><p>Fecha: ${fmtD(today())} · Etapa: ${esc(P.etapa)} · Entrega estimada: <b>${fmtD(P.fechaEntregaEstimada)}</b></p>
    <h3>Cliente</h3><table style="border-collapse:collapse;width:100%">${row('Nombre', P.clienteNombre)}${row('Teléfono', c.telefono)}${row('Dirección de entrega', c.direccion)}</table>
    <h3>Producto</h3><table style="border-collapse:collapse;width:100%">${row('Tipo', P.tipo)}${row('Modelo', P.modelo)}${row('Tela', P.tela)}${row('Color', P.color)}${row('Metros de tela', P.metrosTela)}${row('Funda', P.funda==='Sí' ? 'Sí · ' + (P.colorFunda||'') : '')}${row('Madera', P.madera)}${row('Terminación', P.terminacion)}${row('Medidas', medidasTxt(P))}${row('Cantidad', P.cantidad)}${row('Detalles', P.detalles)}</table>
    <h3>Pagos</h3><table style="border-collapse:collapse;width:100%">${row('Precio total', money(k.precio))}${row('Pagado', money(k.pagado))}${row('Saldo a cobrar en la entrega', money(k.saldo))}</table>
    ${fotos.length?`<h3>Fotos</h3><div class="phs">${fotos.map(f=>`<img src="${esc(f.miniatura)}">`).join('')}</div>`:''}
    <p style="margin-top:30px">Firma / conformidad: ______________________________</p>`;
  setTimeout(() => window.print(), 100);
}

/* ================== Modal Cliente ================== */
function openCliente(id){ openModal({type:'cliente', id:id||null}); }
function renderClienteModal(){
  const c = S.modal.id ? byId('Clientes', S.modal.id) : {};
  if(S.modal.id && !c){ closeModal(); return; }
  const peds = c.id ? S.d.Pedidos.filter(p=>p.clienteId===c.id).sort((a,b)=>b.nro-a.nro) : [];
  const recs = c.id ? S.d.Recordatorios.filter(r=>r.vinculoTipo==='cliente' && r.vinculoId===c.id) : [];
  $('#modal').innerHTML = `<div class="modal-card"><div class="modal-head"><h2>${c.id?esc(c.nombre):'Nuevo cliente'}</h2>
    ${c.telefono?`<a class="btn sm wa" target="_blank" rel="noopener noreferrer" href="${waLink(c.telefono, 'Hola '+c.nombre+'! Te escribimos de RUMA.')}">WhatsApp</a>`:''}
    ${c.id?`<button class="btn sm pri" id="cNewPed">+ Nuevo pedido</button><button class="btn sm danger" id="cDel">Eliminar</button>`:''}<button class="x" data-act="cerrar">×</button></div>
    <div class="modal-body"><div class="grid g4">${clienteFields(c, 'ec_')}
      <label class="f spanall"><span>Notas generales del cliente</span><textarea id="ec_notas">${esc(c.notas)}</textarea></label>
      <div class="spanall row"><span class="spacer"></span><button class="btn pri" id="cSave">${c.id?'Guardar':'Crear cliente'}</button></div></div>
    ${c.id?`<div class="sect" style="display:block">Pedidos de este cliente (${peds.length})</div>
      ${peds.length?`<div class="tbl-wrap"><table><thead><tr><th>Pedido</th><th>Producto</th><th>Etapa</th><th class="num">Precio</th><th class="num">Saldo</th></tr></thead><tbody>
      ${peds.map(p=>{ const k = calc(p); return `<tr class="click" data-ped="${esc(p.id)}"><td>${esc(p.id)}<div class="small muted">${fmtD(p.fechaConsulta)}</div></td><td>${esc(descProd(p))}</td><td>${isPerdido(p)?'<span class="tag bad">Perdido</span>':esc(p.etapa)}</td><td class="num">${money(k.precio)}</td><td class="num">${k.saldo>0&&isGanado(p)?money(k.saldo):'—'}</td></tr>`; }).join('')}</tbody></table></div>`:'<p class="muted">Sin pedidos.</p>'}
      <div class="sect" style="display:block">Recordatorios</div><div class="panel" style="margin-bottom:10px">${recForm('cr_', 'cliente|'+c.id)}</div><div class="list">${recs.map(recItem).join('')}</div>`:''}
    </div></div>`;
  $('#cSave').onclick = async () => {
    const data = Object.assign(readCliente('ec_'), {id:c.id, notas:$('#ec_notas').value.trim()});
    if(!data.nombre) return toast('Poné el nombre', true);
    const d = await run('saveCliente', {cliente:data}, c.id?'Cliente guardado':'Cliente creado');
    if(!c.id) S.modal.id = d.put.Clientes[0].id, renderModal();
  };
  if(c.id){
    $('#cNewPed').onclick = () => openPedido(null, {clienteId:c.id});
    $('#cDel').onclick = async () => { if(await confirmBox(`¿Eliminar a ${c.nombre}?`, 'Eliminar')){ await run('deleteCliente', {id:c.id}, 'Cliente eliminado'); closeModal(); } };
    $$('tr[data-ped]', $('#modal')).forEach(r => r.onclick = e => fromLink(e) ? null : openPedido(r.dataset.ped));
    bindRecForm('cr_', 'cliente|'+c.id); bindRecs($('#modal'));
  }
}

/* ================== Modal Proveedor ================== */
function openProveedor(id){ openModal({type:'proveedor', id:id||null}); }
function renderProveedorModal(){
  const v = S.modal.id ? byId('Proveedores', S.modal.id) : {};
  if(S.modal.id && !v){ closeModal(); return; }
  const cs = v.id ? S.d.Costos.filter(c=>c.proveedorId===v.id).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))) : [];
  const recs = v.id ? S.d.Recordatorios.filter(r=>r.vinculoTipo==='proveedor' && r.vinculoId===v.id) : [];
  const deuda = cs.filter(c=>!isSi(c.pagado)).reduce((a,c)=>a+num(c.monto),0);
  $('#modal').innerHTML = `<div class="modal-card"><div class="modal-head"><h2>${v.id?esc(v.nombre):'Nuevo proveedor'}</h2>
    ${v.telefono?`<a class="btn sm wa" target="_blank" rel="noopener noreferrer" href="${waLink(v.telefono)}">WhatsApp</a>`:''}
    ${v.id?'<button class="btn sm danger" id="vDel">Eliminar</button>':''}<button class="x" data-act="cerrar">×</button></div>
    <div class="modal-body"><div class="grid g4">
      <label class="f span2"><span>Nombre *</span><input id="ev_nombre" value="${esc(v.nombre)}"></label>
      <label class="f span2"><span>Especialidad</span><select id="ev_esp">${opts(cfg('especialidades'), v.especialidad, '—')}</select></label>
      <label class="f span2"><span>Teléfono / WhatsApp</span><input id="ev_tel" value="${esc(v.telefono)}"></label>
      <label class="f span2"><span>Email</span><input id="ev_email" value="${esc(v.email)}"></label>
      <label class="f spanall"><span>Notas</span><textarea id="ev_notas">${esc(v.notas)}</textarea></label>
      <div class="spanall row"><span class="spacer"></span><button class="btn pri" id="vSave">${v.id?'Guardar':'Crear proveedor'}</button></div></div>
    ${v.id?`<div class="sect" style="display:block">Seguimiento de trabajos ${deuda?`<span class="tag bad">Le debo ${money(deuda)}</span>`:''}</div>${costosTable(cs, true)}
      <p class="small muted">Los trabajos se cargan desde cada pedido → pestaña Costos.</p>
      <div class="sect" style="display:block">Recordatorios</div><div class="panel" style="margin-bottom:10px">${recForm('vr_', 'proveedor|'+v.id)}</div><div class="list">${recs.map(recItem).join('')}</div>`:''}
    </div></div>`;
  $('#vSave').onclick = async () => {
    const data = {id:v.id, nombre:$('#ev_nombre').value.trim(), especialidad:$('#ev_esp').value, telefono:$('#ev_tel').value.trim(), email:$('#ev_email').value.trim(), notas:$('#ev_notas').value.trim()};
    if(!data.nombre) return toast('Poné el nombre', true);
    const d = await run('saveProveedor', {proveedor:data}, v.id?'Proveedor guardado':'Proveedor creado');
    if(!v.id){ S.modal.id = d.put.Proveedores[0].id; renderModal(); }
  };
  if(v.id){
    $('#vDel').onclick = async () => { if(await confirmBox(`¿Eliminar a ${v.nombre}? Los costos cargados se mantienen.`, 'Eliminar')){ await run('deleteProveedor', {id:v.id}, 'Proveedor eliminado'); closeModal(); } };
    bindCostos($('#modal')); bindRecForm('vr_', 'proveedor|'+v.id); bindRecs($('#modal'));
  }
}

/* ================== Acciones generales (sin handlers inline, por la CSP) ================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  const a = el.dataset.act;
  if(a==='nuevoPedido') openPedido();
  else if(a==='nuevoCliente') openCliente();
  else if(a==='nuevoProveedor') openProveedor();
  else if(a==='cerrar') closeModal();
  else if(a==='verEntregados'){ S.showAllDone = true; render(); }
  else if(a==='ocultarEntregados'){ S.showAllDone = false; render(); }
  else if(a==='salir') salir();
  else if(a==='reintentar') boot();
});

/* ================== Login y arranque ================== */
function showLogin(msg){
  if(S.modal) closeModal();
  $('#modal2').classList.add('hidden');
  $('#boot').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#lgErr').textContent = msg || '';
  $('#lgPass').value = '';
  setTimeout(() => ($('#lgUser').value ? $('#lgPass') : $('#lgUser')).focus(), 50);
}
$('#lgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#lgBtn'); const u = $('#lgUser').value.trim(); const p = $('#lgPass').value;
  if(!u || !p){ $('#lgErr').textContent = 'Completá usuario y contraseña'; return; }
  btn.disabled = true; btn.textContent = 'Ingresando…'; $('#lgErr').textContent = '';
  try{
    const d = await call('login', {usuario:u, password:p});
    setToken(d.token, $('#lgRemember').checked);
    $('#lgPass').value = '';
    $('#login').classList.add('hidden');
    boot();
  }catch(err){ $('#lgErr').textContent = err.message; $('#lgPass').value = ''; $('#lgPass').focus(); }
  finally{ btn.disabled = false; btn.textContent = 'Ingresar'; }
});
async function salir(){
  try{ await call('logout'); }catch(e){}
  clearToken(); S.d = null; location.reload();
}
async function boot(){
  if(!API_OK(window.RUMA_API_URL)){ $('#boot').innerHTML = 'RUMA<small style="color:var(--bad)">Falta pegar el link de la API en el archivo config.js (ver guía).</small>'; return; }
  if(!getToken()){ showLogin(''); return; }
  const bt = $('#boot'); bt.classList.remove('hidden'); bt.innerHTML = 'RUMA<small>Cargando el CRM…</small>';
  try{
    S.d = await call('bootstrap');
    $('#lnkSheet').href = S.d.sheetUrl; $('#lnkFolder').href = S.d.folderUrl; $('#who').textContent = S.d.user ? '👤 ' + S.d.user : '';
    bt.classList.add('hidden');
    render();
  }catch(e){
    if(!$('#login').classList.contains('hidden')) return;
    bt.innerHTML = `RUMA<small style="color:var(--bad)">No se pudo cargar: ${esc(e.message)}</small><button class="btn" data-act="reintentar">Reintentar</button>`;
  }
}
boot();