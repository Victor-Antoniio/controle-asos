// Controle de ASOs — versão para GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const configurado = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("COLE");
let db = null, auth = null;

const TIPOS=["Admissional","Periódico","Retorno ao trabalho","Mudança de risco ocupacional","Demissional","Não informado"];
const RESULTADOS=["Apto","Apto com restrição","Inapto"];
const SITUACOES=["Ativo","Férias","Afast. Aux. Doença","Afast. Acid. Trabalho","Atest. Médico Ac. Trabalho","Aposentadoria por Invalidez","Licença Maternidade","Cárcere","Desligado"];
const STATUS=[["vencido","Vencido"],["proximo","Próximo do vencimento"],["noprazo","No prazo"],["semaso","Sem ASO"],["desligado","Desligado"]];
const MESES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const S={rows:[],cfg:{diasPadrao:364,alertaDias:30,excecoes:{"JOVEM APRENDIZ":728}},f:{q:"",status:"",setor:"",equipe:"",cargo:"",sit:"",mes:""},sort:{k:"prox",d:1},email:"",loaded:false,readOnly:false};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();

/* datas em ISO AAAA-MM-DD, calculadas em UTC */
function todayISO(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
const TODAY=todayISO();
const toMs=s=>Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10));
const fromMs=ms=>new Date(ms).toISOString().slice(0,10);
const addDays=(s,n)=>fromMs(toMs(s)+n*864e5);
const diff=(a,b)=>Math.round((toMs(a)-toMs(b))/864e5);
const br=s=>s?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"—";
function cpfFmt(c,mask){c=String(c||"").replace(/\D/g,"");if(!c)return"—";c=c.padStart(11,"0");return mask?"***."+c.slice(3,6)+"."+c.slice(6,9)+"-**":c.slice(0,3)+"."+c.slice(3,6)+"."+c.slice(6,9)+"-"+c.slice(9)}

function ultimo(c){let u=null;for(const e of c.exames||[]){if(e.tipo==="Demissional"||!e.data)continue;if(!u||e.data>u)u=e.data}return u}
function periodo(c){if(c.periodicidadeDias)return +c.periodicidadeDias;const x=S.cfg.excecoes||{};const k=String(c.cargo||"").toUpperCase().trim();return x[k]!=null?+x[k]:+S.cfg.diasPadrao}
function calc(c){
  const ult=ultimo(c);const prox=ult?addDays(ult,periodo(c)):null;
  let st;
  if(c.situacao==="Desligado")st="desligado";else if(!prox)st="semaso";else{const d=diff(prox,TODAY);st=d<0?"vencido":d<=+S.cfg.alertaDias?"proximo":"noprazo"}
  return{ult,prox,dias:prox?diff(prox,TODAY):null,st};
}
const stLabel=k=>(STATUS.find(s=>s[0]===k)||[,""])[1];

/* toast */
let tt;function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,3200)}

/* filtros e lista */
function filtered(){
  const f=S.f,q=norm(f.q),qd=f.q.replace(/\D/g,"");
  const list=[];
  for(const c of S.rows){
    const k=c._k;
    if(q){const hit=norm(c.nome).includes(q)||String(c.matricula).includes(f.q.trim())||(qd.length>=3&&String(c.cpf||"").padStart(11,"0").includes(qd));if(!hit)continue}
    if(f.status){if(f.status==="agendado"){if(!(c.agendamento&&c.agendamento>=TODAY))continue}else if(k.st!==f.status)continue}
    else if(!f.sit&&k.st==="desligado")continue;
    if(f.setor&&c.setor!==f.setor)continue;
    if(f.equipe&&(c.equipe||"(sem equipe)")!==f.equipe)continue;
    if(f.cargo&&c.cargo!==f.cargo)continue;
    if(f.sit&&c.situacao!==f.sit)continue;
    if(f.mes){if(!k.prox||k.st==="desligado")continue;if(f.mes==="vencidos"){if(k.dias>=0)continue}else if(k.prox.slice(0,7)!==f.mes||k.dias<0)continue}
    list.push(c);
  }
  const {k:sk,d}=S.sort;const rank={vencido:0,proximo:1,noprazo:2,semaso:3,desligado:4};
  const val=c=>({matricula:+c.matricula||0,nome:norm(c.nome),setor:norm(c.setor)+norm(c.equipe),ult:c._k.ult||"9",prox:c._k.prox||"9",dias:c._k.dias??1e9,status:rank[c._k.st],ag:c.agendamento||"9",sit:norm(c.situacao)})[sk];
  list.sort((a,b)=>{const x=val(a),y=val(b);return(x<y?-1:x>y?1:norm(a.nome)<norm(b.nome)?-1:1)*d});
  return list;
}

function fillSelect(id,values,all,labels){
  const el=$(id),cur=el.value;
  el.innerHTML=`<option value="">${all}</option>`+values.map((v,i)=>`<option value="${esc(v)}">${esc(labels?labels[i]:v)}</option>`).join("");
  el.value=values.includes(cur)?cur:"";
}
function uniq(fn){return[...new Set(S.rows.map(fn).filter(Boolean))].sort((a,b)=>norm(a)<norm(b)?-1:1)}

function renderFilters(){
  fillSelect("fstatus",[...STATUS.map(s=>s[0]),"agendado"],"Todas",[...STATUS.map(s=>s[1]),"Com agendamento"]);
  fillSelect("fsetor",uniq(c=>c.setor),"Todos");
  fillSelect("fequipe",uniq(c=>c.equipe||"(sem equipe)"),"Todas");
  fillSelect("fcargo",uniq(c=>c.cargo),"Todos");
  fillSelect("fsit",uniq(c=>c.situacao),"Todas");
  $("fstatus").value=S.f.status;$("fsetor").value=S.f.setor;$("fequipe").value=S.f.equipe;$("fcargo").value=S.f.cargo;$("fsit").value=S.f.sit;
}

function renderTiles(){
  const n={vencido:0,proximo:0,noprazo:0,semaso:0,agendado:0};
  for(const c of S.rows){const st=c._k.st;if(st==="desligado")continue;n[st]++;if(c.agendamento&&c.agendamento>=TODAY)n.agendado++}
  const T=[["vencido","bad","Vencidos"],["proximo","warn",`Vencem em até ${S.cfg.alertaDias} dias`],["agendado","info","Com agendamento"],["noprazo","ok","No prazo"],["semaso","idle","Sem ASO registrado"]];
  $("tiles").innerHTML=T.map(([k,cls,l])=>`<button type="button" class="tile ${cls}" data-st="${k}" aria-pressed="${S.f.status===k}"><span class="n">${S.loaded?n[k]:"–"}</span><span class="l">${l}</span></button>`).join("");
}

function renderBars(){
  const cols=[{key:"vencidos",label:"venc.",n:0,over:true}];
  const d=new Date();let y=d.getFullYear(),m=d.getMonth();
  for(let i=0;i<12;i++){cols.push({key:y+"-"+String(m+1).padStart(2,"0"),label:MESES[m]+(m===0||i===0?" "+String(y).slice(2):""),n:0,far:i>=6});m++;if(m>11){m=0;y++}}
  const idx=Object.fromEntries(cols.map((c,i)=>[c.key,i]));
  for(const c of S.rows){const k=c._k;if(!k.prox||k.st==="desligado")continue;if(k.dias<0)cols[0].n++;else{const i=idx[k.prox.slice(0,7)];if(i!=null)cols[i].n++}}
  const max=Math.max(1,...cols.map(c=>c.n));
  $("bars").innerHTML=cols.map(c=>`<button type="button" class="bar${c.over?" over":""}${c.far?" far":""}" data-mes="${c.key}" aria-pressed="${S.f.mes===c.key}" aria-label="${c.n} ASOs ${c.over?"vencidos":"em "+c.label}"><span class="v">${S.loaded?c.n:""}</span><span class="col" style="height:${S.loaded?Math.round(c.n/max*100):0}%"></span><span class="m">${c.label}</span></button>`).join("");
}

function renderTable(){
  const list=filtered();
  const tb=$("tbody"),em=$("empty");
  $("count").textContent=S.loaded?`${list.length} de ${S.rows.length} colaboradores`:"Carregando…";
  if(!S.loaded){tb.innerHTML="";em.hidden=false;em.innerHTML="Carregando colaboradores…";return}
  if(!S.rows.length){tb.innerHTML="";em.hidden=false;em.innerHTML=`<b>Nenhum colaborador cadastrado ainda.</b><span>Importe a sua planilha de controle de ASOs (.xlsx ou .csv) ou cadastre o primeiro colaborador.</span><div class="actions"><button type="button" class="primary" data-act="import">Importar planilha</button><button type="button" data-act="novo">Novo colaborador</button></div>`;return}
  if(!list.length){tb.innerHTML="";em.hidden=false;em.innerHTML="Nenhum colaborador corresponde aos filtros.";return}
  em.hidden=true;
  tb.innerHTML=list.map(c=>{const k=c._k;const sitAlert=c.situacao&&c.situacao!=="Ativo"&&c.situacao!=="Desligado";
    return `<tr data-id="${esc(c._id)}" tabindex="0">
    <td class="num">${esc(c.matricula)}</td>
    <td class="name">${esc(c.nome)}<small>${esc(c.cargo||"")}</small></td>
    <td>${esc(c.setor||"—")}<br><span class="sit">${esc(c.equipe||"")}</span></td>
    <td class="num">${br(k.ult)}</td>
    <td class="num">${br(k.prox)}</td>
    <td class="dias${k.dias!=null&&k.dias<0?" neg":""}">${k.dias==null?"":(k.dias<0?k.dias:"+"+k.dias)}</td>
    <td><span class="pill s-${k.st}">${stLabel(k.st)}</span></td>
    <td class="ag">${c.agendamento?br(c.agendamento):""}</td>
    <td class="sit${sitAlert?" alert":""}">${esc(c.situacao||"")}</td></tr>`}).join("");
}
function render(){for(const c of S.rows)c._k=calc(c);renderTiles();renderBars();renderFilters();renderTable();}

/* eventos da lista */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-st]");if(t&&t.classList.contains("tile")){S.f.status=S.f.status===t.dataset.st?"":t.dataset.st;S.f.mes="";render();return}
  const b=e.target.closest(".bar");if(b){S.f.mes=S.f.mes===b.dataset.mes?"":b.dataset.mes;S.f.status="";render();return}
  const s=e.target.closest("[data-sort]");if(s){const k=s.dataset.sort;S.sort=S.sort.k===k?{k,d:-S.sort.d}:{k,d:1};renderTable();return}
  const a=e.target.closest("[data-act]");if(a){if(a.dataset.act==="import")openImport();if(a.dataset.act==="novo")openDrawer(null);return}
  const tr=e.target.closest("tbody tr");if(tr)openDrawer(tr.dataset.id);
});
$("tbody").addEventListener("keydown",e=>{if(e.key==="Enter"){const tr=e.target.closest("tr");if(tr)openDrawer(tr.dataset.id)}});
let qt;$("fq").addEventListener("input",e=>{clearTimeout(qt);qt=setTimeout(()=>{S.f.q=e.target.value;renderTable()},150)});
[["fstatus","status"],["fsetor","setor"],["fequipe","equipe"],["fcargo","cargo"],["fsit","sit"]].forEach(([id,k])=>$(id).addEventListener("change",e=>{S.f[k]=e.target.value;if(k==="status")S.f.mes="";render()}));
$("btnLimpar").onclick=()=>{S.f={q:"",status:"",setor:"",equipe:"",cargo:"",sit:"",mes:""};$("fq").value="";render()};
$("btnNovo").onclick=()=>openDrawer(null);
$("btnImport").onclick=openImport;
$("btnRegras").onclick=openRegras;
$("btnExport").onclick=exportar;

/* gravação */
const docId=m=>"m"+String(m).replace(/[^A-Za-z0-9_\-.]/g,"_");
function clean(c){const o={};for(const k in c)if(k[0]!=="_")o[k]=c[k];return o}
function corpo(c){const body=clean(c);body.atualizadoEm=new Date().toISOString();body.atualizadoPor=S.email||"";return body}
async function salvar(c){await setDoc(doc(db,"colaboradores",c._id||docId(c.matricula)),corpo(c))}
function erroMsg(e){const c=e&&e.code;if(c==="permission-denied")return"Seu usuário não tem permissão para alterar os dados. Peça acesso de editor ao administrador.";if(c==="resource-exhausted")return"O limite diário do plano gratuito foi atingido. Tente de novo amanhã.";if(c==="unavailable")return"Sem conexão com o servidor. Verifique a internet e tente de novo.";return"Não foi possível salvar. Tente de novo."}

/* gaveta do colaborador */
function closeOverlay(){$("overlay").innerHTML=""}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeOverlay()});

function openDrawer(id){
  const orig=id?S.rows.find(r=>r._id===id):null;
  const c=orig?JSON.parse(JSON.stringify(clean(orig))):{matricula:"",nome:"",cpf:"",cargo:"",admissao:"",setor:"",equipe:"",situacao:"Ativo",agendamento:"",exames:[]};
  c.exames=c.exames||[];
  const novo=!orig;
  const opts=(arr,v)=>arr.map(x=>`<option${x===v?" selected":""}>${esc(x)}</option>`).join("");
  const dl=(lid,vals)=>`<datalist id="${lid}">${vals.map(v=>`<option value="${esc(v)}">`).join("")}</datalist>`;
  function draw(){
    const k=calc(c);
    const hist=[...c.exames].map((e,i)=>({...e,i})).sort((a,b)=>a.data<b.data?1:-1);
    $("overlay").innerHTML=`<div class="scrim" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dtitle">
      <div class="dh"><div><h3 id="dtitle" style="font-size:20px">${novo?"Novo colaborador":esc(c.nome)}</h3>${novo?"":`<p>Matrícula ${esc(c.matricula)} · ${esc(c.cargo||"")}</p>`}</div><button type="button" class="ghost" data-close aria-label="Fechar">Fechar</button></div>
      <div class="db">
        ${novo?"":`<div class="sum"><div><span>Último ASO</span><b>${br(k.ult)}</b></div><div><span>Próximo ASO</span><b>${br(k.prox)}</b></div><div><span>Situação</span><div><span class="pill s-${k.st}">${stLabel(k.st)}</span></div></div></div>`}
        <div class="sec"><h2>Cadastro</h2>
        <div class="grid2">
          <label>Matrícula<input id="d_mat" value="${esc(c.matricula)}" ${novo?"":"readonly"} inputmode="numeric"></label>
          <label>CPF<input id="d_cpf" value="${esc(c.cpf?cpfFmt(c.cpf):"")}" inputmode="numeric"></label>
          <label class="full">Nome completo<input id="d_nome" value="${esc(c.nome)}"></label>
          <label>Cargo<input id="d_cargo" list="l_cargo" value="${esc(c.cargo)}"></label>
          <label>Data de admissão<input id="d_adm" type="date" value="${esc(c.admissao||"")}"></label>
          <label>Setor<input id="d_setor" list="l_setor" value="${esc(c.setor)}"></label>
          <label>Equipe<input id="d_equipe" list="l_equipe" value="${esc(c.equipe)}"></label>
          <label>Situação cadastro<select id="d_sit">${opts([...new Set([...SITUACOES,c.situacao].filter(Boolean))],c.situacao)}</select></label>
          <label>Agendamento do próximo ASO<input id="d_ag" type="date" value="${esc(c.agendamento||"")}"></label>
          <label class="full">Periodicidade própria (dias)<input id="d_per" type="number" min="1" placeholder="Usar regra do cargo: ${periodo({...c,periodicidadeDias:null})} dias" value="${esc(c.periodicidadeDias||"")}"></label>
        </div>${dl("l_cargo",uniq(r=>r.cargo))}${dl("l_setor",uniq(r=>r.setor))}${dl("l_equipe",uniq(r=>r.equipe))}</div>
        <div class="sec"><h2>Histórico de ASOs</h2>
          ${hist.length?`<ul class="hist">${hist.map(e=>`<li><span class="num">${br(e.data)}</span><span><span class="t">${esc(e.tipo)}</span><small>${e.resultado?`<span class="${e.resultado==="Inapto"?"res-inapto":e.resultado==="Apto"?"res-apto":"res-restr"}">${esc(e.resultado)}</span>`:""}${e.clinica?" · "+esc(e.clinica):""}${e.obs?" · "+esc(e.obs):""}</small></span><button type="button" class="ghost" data-delex="${e.i}" aria-label="Remover exame">Remover</button></li>`).join("")}</ul>`:`<p class="meta">Nenhum ASO registrado.</p>`}
          <div class="addexam">
            <label>Tipo<select id="x_tipo">${opts(TIPOS,"Periódico")}</select></label>
            <label>Data do exame<input id="x_data" type="date" value="${TODAY}"></label>
            <label>Resultado<select id="x_res">${opts(RESULTADOS,"Apto")}</select></label>
            <label>Clínica<input id="x_cli" placeholder="Opcional"></label>
            <label style="grid-column:span 2">Observação<input id="x_obs" placeholder="Opcional"></label>
            <button type="button" class="full" id="x_add">Adicionar ASO ao histórico</button>
          </div>
          <p class="note">Ao registrar um ASO com data posterior ao agendamento, o agendamento é limpo automaticamente.</p>
        </div>
        ${orig&&orig.atualizadoEm?`<p class="meta" id="d_meta">Última alteração em ${br(orig.atualizadoEm.slice(0,10))}${orig.atualizadoPor?` por ${esc(orig.atualizadoPor)}`:""}</p>`:""}
        <div id="d_conf"></div>
      </div>
      <div class="df">${novo?"<span></span>":`<button type="button" class="danger" id="d_del">Excluir colaborador</button>`}<div class="actions"><button type="button" data-close>Cancelar</button><button type="button" class="primary" id="d_save">${novo?"Cadastrar":"Salvar alterações"}</button></div></div>
    </aside>`;
    const ov=$("overlay");
    ov.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeOverlay);
    $("x_add").onclick=()=>{read();const data=$("x_data").value;if(!data){toast("Informe a data do exame.");return}
      c.exames.push({tipo:$("x_tipo").value,data,resultado:$("x_res").value,clinica:$("x_cli").value.trim(),obs:$("x_obs").value.trim()});
      if(c.agendamento&&c.agendamento<=data)c.agendamento="";
      if($("x_tipo").value==="Demissional")c.situacao="Desligado";
      draw();toast("ASO adicionado. Clique em salvar para gravar.")};
    ov.querySelectorAll("[data-delex]").forEach(b=>b.onclick=()=>{read();c.exames.splice(+b.dataset.delex,1);draw()});
    $("d_save").onclick=async()=>{read();
      if(!c.matricula||!c.nome){toast("Matrícula e nome são obrigatórios.");return}
      if(novo&&S.rows.some(r=>String(r.matricula)===String(c.matricula))){toast("Já existe um colaborador com essa matrícula.");return}
      const btn=$("d_save");btn.disabled=true;btn.textContent="Salvando…";
      try{if(orig)c._id=orig._id;await salvar(c);toast(novo?"Colaborador cadastrado.":"Alterações salvas.");closeOverlay()}catch(e){toast(erroMsg(e));btn.disabled=false;btn.textContent="Tentar de novo"}};
    if(!novo)$("d_del").onclick=()=>{$("d_conf").innerHTML=`<div class="confirm"><span>Excluir ${esc(c.nome)} e todo o histórico de ASOs? Essa ação não pode ser desfeita.</span><button type="button" class="danger" id="d_del2">Excluir definitivamente</button><button type="button" id="d_del3">Manter</button></div>`;
      $("d_del3").onclick=()=>$("d_conf").innerHTML="";
      $("d_del2").onclick=async()=>{try{await deleteDoc(doc(db,"colaboradores",orig._id));toast("Colaborador excluído.");closeOverlay()}catch(e){toast(erroMsg(e))}}};
    if(S.readOnly){ov.querySelectorAll(".db input,.db select,#d_save,#d_del,#x_add,[data-delex]").forEach(el=>el.disabled=true)}
  }
  function read(){
    {const m=$("d_mat").value.trim();c.matricula=m&&!isNaN(+m)?+m:m;}c.nome=$("d_nome").value.trim().toUpperCase();c.cpf=$("d_cpf").value.replace(/\D/g,"");
    c.cargo=$("d_cargo").value.trim().toUpperCase();c.admissao=$("d_adm").value;c.setor=$("d_setor").value.trim().toUpperCase();c.equipe=$("d_equipe").value.trim().toUpperCase();
    c.situacao=$("d_sit").value;c.agendamento=$("d_ag").value;const p=$("d_per").value;c.periodicidadeDias=p?+p:null;
  }
  draw();
}

/* regras */
function openRegras(){
  const cfg=JSON.parse(JSON.stringify(S.cfg));cfg.excecoes=cfg.excecoes||{};
  function draw(){
    $("overlay").innerHTML=`<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="rt"><div class="mcard">
      <div class="top"><h3 id="rt" style="font-size:20px">Regras de vencimento</h3><button type="button" class="ghost" data-close>Fechar</button></div>
      <div class="grid2">
        <label>Periodicidade padrão (dias)<input id="r_pad" type="number" min="1" value="${cfg.diasPadrao}"></label>
        <label>Alertar quando faltar (dias)<input id="r_al" type="number" min="1" value="${cfg.alertaDias}"></label>
      </div>
      <div class="sec"><h2>Periodicidade por cargo</h2>
        <div class="rules">${Object.entries(cfg.excecoes).map(([k,v])=>`<div class="rule"><span>${esc(k)}</span><span class="num">${v} dias</span><button type="button" class="ghost" data-rmr="${esc(k)}">Remover</button></div>`).join("")||`<p class="meta">Nenhuma exceção. Todos os cargos usam a periodicidade padrão.</p>`}</div>
        <div class="rule"><input id="r_cargo" list="l_rc" placeholder="Cargo"><input id="r_dias" type="number" min="1" placeholder="Dias"><button type="button" id="r_add">Adicionar</button></div>
        <datalist id="l_rc">${uniq(r=>r.cargo).map(v=>`<option value="${esc(v)}">`).join("")}</datalist>
        <p class="note">Use o intervalo definido no PCMSO. Um colaborador também pode ter periodicidade própria na ficha dele.</p>
      </div>
      <div class="actions" style="justify-content:flex-end"><button type="button" data-close>Cancelar</button><button type="button" class="primary" id="r_save">Salvar regras</button></div>
    </div></div>`;
    const ov=$("overlay");ov.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeOverlay);
    const keep=()=>{cfg.diasPadrao=+$("r_pad").value||364;cfg.alertaDias=+$("r_al").value||30};
    ov.querySelectorAll("[data-rmr]").forEach(b=>b.onclick=()=>{keep();delete cfg.excecoes[b.dataset.rmr];draw()});
    $("r_add").onclick=()=>{keep();const k=$("r_cargo").value.trim().toUpperCase(),d=+$("r_dias").value;if(!k||!d){toast("Informe o cargo e os dias.");return}cfg.excecoes[k]=d;draw()};
    $("r_save").onclick=async()=>{keep();try{await setDoc(doc(db,"config","geral"),cfg);S.cfg=cfg;render();toast("Regras salvas.");closeOverlay()}catch(e){toast(erroMsg(e))}};
    if(S.readOnly)ov.querySelectorAll(".mcard input,#r_save,#r_add,[data-rmr]").forEach(el=>el.disabled=true);
  }
  draw();
}

/* importação */
function toISO(v){
  if(v==null||v==="")return"";
  if(v instanceof Date&&!isNaN(v)){const d=new Date(v.getTime()+12*36e5);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  if(typeof v==="number"&&v>20000&&v<80000)return fromMs(Date.UTC(1899,11,30)+Math.round(v)*864e5);
  const s=String(v).trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){const y=m[3].length===2?"20"+m[3]:m[3];return y+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0")}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];return"";
}
function mapHeader(h){const n=norm(h);
  if(n.includes("matricula"))return"matricula";if(n.includes("nome"))return"nome";if(n.includes("cpf"))return"cpf";
  if(n.includes("cargo")||n.includes("denominacao"))return"cargo";if(n.includes("admiss"))return"admissao";
  if(n.includes("prox"))return null;if(/ult.*aso|ultimo.*aso/.test(n))return"ultAso";
  if(n.includes("equipe"))return"equipe";if(n.includes("setor"))return"setor";
  if(n.includes("situacao")&&n.includes("cadastro"))return"situacao";if(n.includes("agend"))return"agendamento";return null}
let IMP=null;
function openImport(){
  IMP=null;
  $("overlay").innerHTML=`<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="it"><div class="mcard">
    <div class="top"><h3 id="it" style="font-size:20px">Importar planilha</h3><button type="button" class="ghost" data-close>Fechar</button></div>
    <p class="note" style="margin:0">Aceita .xlsx ou .csv com cabeçalho na primeira linha: Matrícula, Nome, CPF, Cargo, Data Admissão, Data Ult. ASO, Equipe, Setor, Situação Cadastro e Agendamento. Colunas calculadas (Próx. ASO e Situação ASO) são ignoradas, o app calcula de novo. A matrícula identifica cada colaborador: quem já existe é atualizado, quem não existe é cadastrado.</p>
    <label class="drop" id="drop" for="ifile"><b>Arraste o arquivo aqui</b><span>ou clique para escolher</span><input id="ifile" type="file" accept=".xlsx,.xls,.csv" hidden></label>
    <div id="iprev"></div>
  </div></div>`;
  const ov=$("overlay");ov.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeOverlay);
  const drop=$("drop");
  drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("on")});
  drop.addEventListener("dragleave",()=>drop.classList.remove("on"));
  drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("on");if(e.dataTransfer.files[0])lerArquivo(e.dataTransfer.files[0])});
  $("ifile").onchange=e=>{if(e.target.files[0])lerArquivo(e.target.files[0])};
}
async function lerArquivo(file){
  const out=$("iprev");
  if(!window.XLSX){out.innerHTML=`<p class="banner">O leitor de planilhas não carregou. Recarregue a página e tente de novo.</p>`;return}
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});
    let best=null;
    for(const name of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});if(!rows.length)continue;const map=rows[0].map(mapHeader);const score=map.filter(Boolean).length+(map.includes("ultAso")?5:0);if(!best||score>best.score)best={name,rows,map,score}}
    if(!best||!best.map.includes("matricula")){out.innerHTML=`<p class="banner">Não encontrei a coluna de Matrícula na primeira linha de nenhuma aba.</p>`;return}
    const byMat=new Map(S.rows.map(r=>[String(r.matricula),r]));
    const recs=[];let novos=0,atual=0,asos=0;
    for(const row of best.rows.slice(1)){
      const o={};best.map.forEach((k,i)=>{if(k)o[k]=row[i]});
      const mat=String(o.matricula??"").trim();if(!mat)continue;
      const ult=toISO(o.ultAso);const exist=byMat.get(mat);
      const c=exist?JSON.parse(JSON.stringify(clean(exist))):{exames:[]};c._id=exist?exist._id:docId(mat);c.exames=c.exames||[];
      c.matricula=isNaN(+mat)?mat:+mat;
      if(o.nome)c.nome=String(o.nome).trim().toUpperCase();
      if(o.cpf!==undefined&&o.cpf!=="")c.cpf=String(o.cpf).replace(/\D/g,"").padStart(11,"0");
      if(o.cargo)c.cargo=String(o.cargo).trim().toUpperCase();
      if(o.admissao!==undefined&&toISO(o.admissao))c.admissao=toISO(o.admissao);
      if(o.equipe!==undefined)c.equipe=String(o.equipe||"").trim().toUpperCase();
      if(o.setor!==undefined)c.setor=String(o.setor||"").trim().toUpperCase();
      if(o.situacao)c.situacao=String(o.situacao).trim();else if(!c.situacao)c.situacao="Ativo";
      if(o.agendamento!==undefined)c.agendamento=toISO(o.agendamento);
      if(ult&&!c.exames.some(e=>e.data===ult)){const u=ultimo(c);if(!u||ult>u){c.exames.push({tipo:"Não informado",data:ult,resultado:"",clinica:"",obs:"Importado da planilha"});asos++}}
      if(!c.nome)continue;
      exist?atual++:novos++;recs.push(c);
    }
    IMP=recs;
    out.innerHTML=`<p class="note" style="margin:0 0 8px">Aba lida: <b>${esc(best.name)}</b> (${esc(file.name)})</p>
      <div class="prev"><div><b>${novos}</b><span>colaboradores novos</span></div><div><b>${atual}</b><span>cadastros atualizados</span></div><div><b>${asos}</b><span>ASOs novos no histórico</span></div></div>
      <div class="progress" hidden id="iprog"><i></i></div>
      <div class="actions" style="justify-content:flex-end;margin-top:12px"><button type="button" data-close2>Cancelar</button><button type="button" class="primary" id="igo" ${recs.length?"":"disabled"}>Importar ${recs.length} registros</button></div>`;
    out.querySelector("[data-close2]").onclick=closeOverlay;
    $("igo").onclick=gravarImport;
    if(S.readOnly)$("igo").disabled=true;
  }catch(e){out.innerHTML=`<p class="banner">Não consegui ler esse arquivo. Confira se é um .xlsx ou .csv válido.</p>`}
}
async function gravarImport(){
  const btn=$("igo");btn.disabled=true;const prog=$("iprog");prog.hidden=false;const bar=prog.querySelector("i");
  let done=0;
  try{
    for(let i=0;i<IMP.length;i+=400){
      const lote=writeBatch(db);
      for(const c of IMP.slice(i,i+400))lote.set(doc(db,"colaboradores",c._id),corpo(c));
      await lote.commit();
      done=Math.min(IMP.length,i+400);bar.style.width=Math.round(done/IMP.length*100)+"%";btn.textContent=`Importando ${done} de ${IMP.length}…`;
    }
    toast(`${done} registros importados.`);closeOverlay();
  }catch(e){toast((done?`${done} registros importados antes do erro. `:"")+erroMsg(e));btn.disabled=false;btn.textContent="Tentar de novo"}
}

/* exportação */
function exportar(){
  if(!window.XLSX){toast("O gerador de planilhas não carregou. Recarregue a página.");return}
  const list=filtered();
  const data=list.map(c=>{const k=c._k;return{"Matrícula":c.matricula,"Nome Completo do Colaborador":c.nome,"CPF":cpfFmt(c.cpf),"Denominação do Cargo":c.cargo,"Data Admissão":br(c.admissao),"Data Ult. ASO":br(k.ult),"Data Prox. ASO":br(k.prox),"Dias para vencer":k.dias??"","Situação ASO":stLabel(k.st),"Situação Cadastro":c.situacao,"Equipe":c.equipe,"Setor":c.setor,"Agendamento":c.agendamento?br(c.agendamento):""}});
  const ws=XLSX.utils.json_to_sheet(data);ws["!cols"]=[8,38,15,28,12,12,12,10,22,18,18,34,12].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"ASOs");
  XLSX.writeFile(wb,`controle-asos-${TODAY}.xlsx`);
  toast(`Planilha com ${list.length} colaboradores exportada.`);
}

/* ===== Login e conexão com o Firebase ===== */
const views={login:$("loginView"),setup:$("setupView"),app:$("appView")};
function show(v){for(const k in views)views[k].hidden=k!==v}
let unsubs=[];

if(!configurado){show("setup")}
else{
  const fb=initializeApp(firebaseConfig);
  auth=getAuth(fb);
  db=initializeFirestore(fb,{ignoreUndefinedProperties:true,localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});

  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const err=$("lErr");err.hidden=true;const btn=$("lBtn");btn.disabled=true;btn.textContent="Entrando…";
    try{await signInWithEmailAndPassword(auth,$("lEmail").value.trim(),$("lSenha").value)}
    catch(x){err.hidden=false;err.textContent=x.code==="auth/too-many-requests"?"Muitas tentativas. Aguarde alguns minutos.":"E-mail ou senha incorretos."}
    btn.disabled=false;btn.textContent="Entrar";
  });
  $("lReset").onclick=async()=>{const email=$("lEmail").value.trim();const err=$("lErr");err.hidden=false;
    if(!email){err.textContent="Digite seu e-mail acima e clique de novo em Esqueci minha senha.";return}
    try{await sendPasswordResetEmail(auth,email)}catch(x){}
    err.textContent="Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.";};
  $("btnSair").onclick=()=>signOut(auth);

  onAuthStateChanged(auth,async u=>{
    unsubs.forEach(f=>f());unsubs=[];
    if(!u){S.rows=[];S.loaded=false;show("login");return}
    S.email=(u.email||"").toLowerCase();$("userEmail").textContent=S.email;show("app");
    const banner=$("banner");banner.hidden=true;
    let membro=null;
    try{const m=await getDoc(doc(db,"membros",S.email));membro=m.exists()?m.data():null}catch(x){}
    if(!membro){banner.hidden=false;banner.textContent="Seu usuário ainda não foi liberado para ver os dados. Peça ao administrador para incluir seu e-mail na lista de membros.";S.loaded=true;render();return}
    S.readOnly=membro.papel!=="editor";
    ["btnNovo","btnImport"].forEach(i=>$(i).disabled=S.readOnly);
    if(S.readOnly){banner.hidden=false;banner.textContent="Você está com acesso de leitura. Para cadastrar ou alterar ASOs, peça acesso de editor ao administrador."}
    render();
    unsubs.push(onSnapshot(doc(db,"config","geral"),s=>{if(s.exists())S.cfg={...S.cfg,...s.data()};render()},()=>{}));
    unsubs.push(onSnapshot(collection(db,"colaboradores"),snap=>{S.rows=snap.docs.map(d=>({...d.data(),_id:d.id}));S.loaded=true;render()},
      e=>{banner.hidden=false;banner.textContent=e.code==="permission-denied"?"Seu usuário não tem permissão para ver os dados.":"A conexão com os dados caiu. Recarregue a página."}));
  });
}
