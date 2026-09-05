import { firebaseConfig } from './firebaseConfig.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const APP_VERSION = '1.0.0';
const isFirebaseConfigured = Object.values(firebaseConfig).every(v => typeof v === 'string' && v && !v.includes('COLE_AQUI') && !v.includes('SEU-PROJETO'));

let auth = null;
let db = null;
let currentUser = null;
let authMode = 'login';
let entries = {};
let weeklyPlans = {};
let profile = { targetWater: 4, targetWeight: '', targetCardioWeek: 120, targetTrainingWeek: 5, theme: 'dark' };
let selectedWeekOffset = 0;
const $ = id => document.getElementById(id);

const todayISO = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
};
const formatDate = iso => new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${iso}T12:00:00`));
const dateShort = iso => new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit' }).format(new Date(`${iso}T12:00:00`));
const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
const bool = id => $(id).checked;
const showToast = message => { const t=$('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2600); };
const userKey = () => currentUser?.uid || 'local-demo';
const localKey = () => `cuttingTracker:${userKey()}`;
const saveLocal = () => localStorage.setItem(localKey(), JSON.stringify({entries,weeklyPlans,profile}));
const loadLocal = () => { const raw=localStorage.getItem(localKey()); if(raw){ try { const x=JSON.parse(raw); entries=x.entries||{}; weeklyPlans=x.weeklyPlans||{}; profile={...profile,...(x.profile||{})}; } catch{} } };

if(isFirebaseConfigured){
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  $('connectionBadge').textContent = 'NUVEM';
  onAuthStateChanged(auth, async user => { currentUser=user; if(user) await enterApp(); else showAuth(); });
} else {
  $('setupHint').classList.remove('hidden');
  $('connectionBadge').textContent='LOCAL';
  loadLocal();
  showAuth(true);
}

function showAuth(localMode=false){ $('authScreen').classList.remove('hidden'); $('appScreen').classList.add('hidden'); if(localMode) { $('setupHint').classList.remove('hidden'); } }
async function enterApp(){
  $('authScreen').classList.add('hidden'); $('appScreen').classList.remove('hidden'); $('userEmail').textContent=currentUser?.email || 'Modo local';
  if(isFirebaseConfigured){ await loadCloudData(); } else { loadLocal(); }
  applyTheme(profile.theme || 'dark'); setDefaults(); renderAll();
}

async function loadCloudData(){
  try{
    const p=await getDoc(doc(db,'users',currentUser.uid));
    if(p.exists()) profile={...profile,...(p.data().profile||{})};
    const snap=await getDocs(collection(db,'users',currentUser.uid,'dailyEntries'));
    entries={}; snap.forEach(d=>entries[d.id]=d.data());
    const weeks=await getDocs(collection(db,'users',currentUser.uid,'weeklyPlans'));
    weeklyPlans={}; weeks.forEach(d=>weeklyPlans[d.id]=d.data());
  }catch(err){ console.error(err); showToast('Não foi possível carregar alguns dados da nuvem.'); }
}
async function saveProfile(){
  if(isFirebaseConfigured && currentUser){ await setDoc(doc(db,'users',currentUser.uid),{profile,lastUpdated:serverTimestamp()},{merge:true}); }
  else saveLocal();
}
async function saveEntry(date,data){
  entries[date]=data;
  if(isFirebaseConfigured && currentUser){ await setDoc(doc(db,'users',currentUser.uid,'dailyEntries',date),data,{merge:true}); }
  else saveLocal();
}
async function removeEntry(date){
  delete entries[date];
  if(isFirebaseConfigured && currentUser){ await deleteDoc(doc(db,'users',currentUser.uid,'dailyEntries',date)); }
  else saveLocal();
}
async function saveWeek(weekId,data){
  weeklyPlans[weekId]=data;
  if(isFirebaseConfigured && currentUser){ await setDoc(doc(db,'users',currentUser.uid,'weeklyPlans',weekId),data,{merge:true}); }
  else saveLocal();
}

$('authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('authEmail').value.trim(); const password=$('authPassword').value;
  if(!isFirebaseConfigured){ currentUser={uid:'local-demo',email:email||'local@demo'}; showToast('Modo local ativado. Os dados ficam neste navegador.'); await enterApp(); return; }
  try{
    if(authMode==='login') await signInWithEmailAndPassword(auth,email,password);
    else await createUserWithEmailAndPassword(auth,email,password);
  }catch(err){ showToast(mapAuthError(err.code)); }
});
$('resetPassword').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim();
  if(!email) return showToast('Digite seu e-mail primeiro.');
  if(!isFirebaseConfigured) return showToast('O modo local não usa recuperação de senha.');
  try { await sendPasswordResetEmail(auth,email); showToast('Link de recuperação enviado.'); } catch(err){ showToast(mapAuthError(err.code)); }
});

document.querySelectorAll('.auth-tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.auth-tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); authMode=btn.dataset.mode;
  $('authSubmit').textContent=authMode==='login'?'Entrar':'Criar conta'; $('resetPassword').classList.toggle('hidden',authMode!=='login');
}));
$('logoutBtn').addEventListener('click',async()=>{ if(isFirebaseConfigured) await signOut(auth); else { currentUser=null; showAuth(true); } });

function mapAuthError(code){
  const map={
    'auth/invalid-credential':'E-mail ou senha incorretos.', 'auth/email-already-in-use':'Este e-mail já possui uma conta.',
    'auth/weak-password':'Use uma senha com pelo menos 6 caracteres.', 'auth/invalid-email':'Digite um e-mail válido.',
    'auth/too-many-requests':'Muitas tentativas. Tente novamente mais tarde.'
  }; return map[code] || 'Não foi possível concluir a operação.';
}

function setDefaults(){ if(!$('dailyDate').value) $('dailyDate').value=todayISO(); loadDailyForm($('dailyDate').value); renderSettings(); }
function readDailyForm(){
  return {
    weight:num('weight'), water:num('water'), calories:num('calories'), protein:num('protein'), cardio:num('cardio'), steps:num('steps'), sleep:num('sleep'), energy:num('energy'),
    training:bool('training'), diet:bool('diet'), cardioDone:bool('cardioDone'), sleepGood:bool('sleepGood'), notes:$('notes').value.trim(), updatedAt:new Date().toISOString()
  };
}
function loadDailyForm(date){
  const x=entries[date]||{};
  ['weight','water','calories','protein','cardio','steps','sleep','energy'].forEach(id=>$(id).value=x[id] ?? '');
  ['training','diet','cardioDone','sleepGood'].forEach(id=>$(id).checked=!!x[id]); $('notes').value=x.notes||'';
}
$('dailyDate').addEventListener('change',()=>loadDailyForm($('dailyDate').value));
$('dailyForm').addEventListener('submit',async e=>{e.preventDefault(); const date=$('dailyDate').value; try{ await saveEntry(date,readDailyForm()); showToast('Registro salvo.'); renderAll(); }catch(err){console.error(err);showToast('Não foi possível salvar.');}});
$('clearDaily').addEventListener('click',()=>{loadDailyForm($('dailyDate').value); showToast('Formulário restaurado.');});
$('quickCheckin').addEventListener('click',()=>goSection('daily'));
$('goDashboard').addEventListener('click',()=>goSection('dashboard'));
document.querySelectorAll('[data-go]').forEach(x=>x.addEventListener('click',()=>goSection(x.dataset.go)));
document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',()=>goSection(x.dataset.section)));
function goSection(section){ document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===section)); document.querySelectorAll('.page-section').forEach(x=>x.classList.toggle('active-section',x.id===`section-${section}`)); window.scrollTo({top:0,behavior:'smooth'}); }

function sortedEntries(){ return Object.entries(entries).filter(([,x])=>x && typeof x==='object').sort((a,b)=>a[0].localeCompare(b[0])); }
function latestEntry(){ const x=sortedEntries(); return x.length?x[x.length-1][1]:null; }
function previousEntry(){ const x=sortedEntries(); return x.length>1?x[x.length-2][1]:null; }
function renderDashboard(){
  const items=sortedEntries(); const latest=items.at(-1)?.[1]; const prev=items.at(-2)?.[1];
  $('statCheckins').textContent=items.length;
  $('statWeight').textContent=latest?.weight!=null?`${latest.weight.toFixed(1)} kg`:'—';
  if(latest?.weight!=null && prev?.weight!=null) { const d=latest.weight-prev.weight; $('statWeightDelta').textContent=`${d>0?'+':''}${d.toFixed(1)} kg vs. anterior`; } else $('statWeightDelta').textContent='Sem comparação';
  const t=profile.targetWater||0, w=latest?.water||0; $('statWater').textContent=`${w.toFixed(1)} L`; $('statWaterTarget').textContent=t?`Meta ${t.toFixed(1)} L`:'Meta não definida';
  const recent=items.slice(-7); const score=recent.length?Math.round(recent.reduce((s,[,x])=>s+(['training','diet','cardioDone','sleepGood'].reduce((a,k)=>a+(x[k]?1:0),0)/4),0)/recent.length*100):0;
  $('statConsistency').textContent=`${score}%`;
  const waterToday=entries[todayISO()]?.water||0; updateWater(waterToday);
  renderChart(items.slice(-14)); renderRecent(items.slice(-5).reverse()); renderMiniChecklist();
}
function renderChart(items){
  const box=$('weightChart'); const vals=items.filter(([,x])=>Number.isFinite(x.weight));
  if(vals.length<2){ box.innerHTML='<div class="empty-state">Registre pelo menos dois pesos para ver a evolução.</div>'; return; }
  const width=700,height=250,pad={l:46,r:20,t:16,b:32}; const ys=vals.map(([,x])=>x.weight); const min=Math.min(...ys)-.5,max=Math.max(...ys)+.5;
  const px=i=>pad.l+(i/(vals.length-1))*(width-pad.l-pad.r); const py=v=>pad.t+(1-(v-min)/(max-min))*(height-pad.t-pad.b);
  const pts=vals.map(([d,x],i)=>({x:px(i),y:py(x.weight),d,v:x.weight})); const poly=pts.map(p=>`${p.x},${p.y}`).join(' ');
  const grids=[0,.5,1].map(q=>{const y=pad.t+q*(height-pad.t-pad.b); const label=(max-(max-min)*q).toFixed(1); return `<line class="chart-grid" x1="${pad.l}" x2="${width-pad.r}" y1="${y}" y2="${y}"/><text class="chart-label" x="0" y="${y+4}">${label}</text>`}).join('');
  const points=pts.map(p=>`<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="5"><title>${formatDate(p.d)} — ${p.v.toFixed(1)} kg</title></circle>`).join('');
  const labels=pts.filter((_,i)=>i===0||i===pts.length-1||i===Math.floor(pts.length/2)).map(p=>`<text class="chart-label" text-anchor="middle" x="${p.x}" y="${height-7}">${dateShort(p.d)}</text>`).join('');
  box.innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grids}<polyline class="chart-line" points="${poly}"/>${points}${labels}</svg>`;
  $('chartRange').textContent=`${vals.length} registros`; }
function renderRecent(items){ const el=$('recentList'); if(!items.length){el.innerHTML='<div class="empty-state">Ainda não há registros.</div>';return;} el.innerHTML=items.map(([d,x])=>`<div class="record-row"><span class="record-date">${formatDate(d)}</span><div><div class="record-main">${x.weight!=null?x.weight.toFixed(1)+' kg':'Peso não informado'}</div><div class="record-sub">${x.water!=null?x.water.toFixed(1)+' L de água':''}${x.cardio!=null?' · '+x.cardio+' min cardio':''}</div></div><span class="record-value">${x.training?'✓ treino':'—'}</span></div>`).join(''); }
function updateWater(value){ const target=profile.targetWater||0; const pct=target?Math.min(100,Math.round(value/target*100)):0; $('waterPercent').textContent=`${pct}%`; $('waterDonutValue').textContent=value.toFixed(1); $('waterDonut').style.background=`conic-gradient(var(--accent) ${pct}%, var(--panel2) ${pct}%)`; $('waterMessage').textContent=target?(pct>=100?'Meta de água atingida. 💧':`Faltam ${(Math.max(0,target-value)).toFixed(1)} L para a meta.`):'Defina sua meta de água nas configurações.'; }

document.querySelectorAll('[data-water-add]').forEach(b=>b.addEventListener('click',async()=>{ const d=todayISO(); const cur=entries[d]?.water||0; const next=+(cur+parseFloat(b.dataset.waterAdd)).toFixed(1); await saveEntry(d,{...(entries[d]||{}),water:next,updatedAt:new Date().toISOString()}); $('dailyDate').value=d; loadDailyForm(d); renderAll(); showToast('Água atualizada.'); }));

function weekStartISO(offset=0){ const d=new Date(); d.setHours(12,0,0,0); const day=d.getDay(); const diff=day===0?-6:1-day; d.setDate(d.getDate()+diff+(offset*7)); return d.toISOString().slice(0,10); }
function addDays(iso,n){ const d=new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function weekId(){ return weekStartISO(selectedWeekOffset); }
function weekLabel(){ const s=weekStartISO(selectedWeekOffset),e=addDays(s,6); return `${dateShort(s)} – ${dateShort(e)}`; }
const defaultGoals=()=>[
  {id:'water',text:'Cumprir a meta de água na maioria dos dias',done:false},
  {id:'training',text:'Cumprir a meta de treinos da semana',done:false},
  {id:'diet',text:'Manter a dieta dentro do planejamento',done:false},
  {id:'cardio',text:'Cumprir a meta semanal de cardio',done:false}
];
function currentGoals(){ const id=weekId(); if(!weeklyPlans[id]) weeklyPlans[id]={goals:defaultGoals()}; return weeklyPlans[id].goals||[]; }
async function toggleGoal(id){ const goals=currentGoals().map(g=>g.id===id?{...g,done:!g.done}:g); await saveWeek(weekId(),{goals}); renderWeekly(); renderDashboard(); }
async function deleteGoal(id){ const goals=currentGoals().filter(g=>g.id!==id); await saveWeek(weekId(),{goals}); renderWeekly(); renderDashboard(); }
function renderWeekly(){ const goals=currentGoals(); $('weekLabel').textContent=weekLabel(); const done=goals.filter(g=>g.done).length; const pct=goals.length?Math.round(done/goals.length*100):0; $('weekPercent').textContent=`${pct}% concluído`; $('weekProgress').style.width=`${pct}%`; $('weeklyGoals').innerHTML=goals.map(g=>`<div class="goal-card ${g.done?'done':''}"><input class="goal-check" type="checkbox" ${g.done?'checked':''} data-goal="${g.id}"/><span class="goal-text">${escapeHTML(g.text)}</span><button class="goal-delete" type="button" data-delete-goal="${g.id}" title="Excluir">×</button></div>`).join(''); document.querySelectorAll('[data-goal]').forEach(x=>x.addEventListener('change',()=>toggleGoal(x.dataset.goal))); document.querySelectorAll('[data-delete-goal]').forEach(x=>x.addEventListener('click',()=>deleteGoal(x.dataset.deleteGoal))); }
$('prevWeek').addEventListener('click',()=>{selectedWeekOffset--;renderWeekly();}); $('nextWeek').addEventListener('click',()=>{selectedWeekOffset++;renderWeekly();});
$('addGoalForm').addEventListener('submit',async e=>{e.preventDefault(); const text=$('newGoal').value.trim(); if(!text)return; const goals=[...currentGoals(),{id:`goal-${Date.now()}`,text,done:false}]; await saveWeek(weekId(),{goals}); $('newGoal').value=''; renderWeekly(); renderDashboard(); showToast('Meta adicionada.');});
function renderMiniChecklist(){ const goals=currentGoals().slice(0,5); $('miniChecklist').innerHTML=goals.length?goals.map(g=>`<label class="mini-item"><input type="checkbox" ${g.done?'checked':''} data-goal-mini="${g.id}">${escapeHTML(g.text)}</label>`).join(''):'<div class="empty-state">Nenhuma meta cadastrada.</div>'; document.querySelectorAll('[data-goal-mini]').forEach(x=>x.addEventListener('change',()=>toggleGoal(x.dataset.goalMini))); }

function renderHistory(){ const rows=sortedEntries().reverse(); $('historyBody').innerHTML=rows.length?rows.map(([d,x])=>`<tr><td>${formatDate(d)}</td><td>${x.weight!=null?x.weight.toFixed(1)+' kg':'—'}</td><td>${x.water!=null?x.water.toFixed(1)+' L':'—'}</td><td>${x.calories??'—'}</td><td>${x.protein!=null?x.protein+' g':'—'}</td><td>${x.cardio!=null?x.cardio+' min':'—'}</td><td>${x.training?'✓':'—'}</td><td><button class="row-action" data-edit="${d}">Editar</button></td></tr>`).join(''):'<tr><td class="table-empty" colspan="8">Nenhum registro salvo.</td></tr>'; document.querySelectorAll('[data-edit]').forEach(x=>x.addEventListener('click',()=>{goSection('daily');$('dailyDate').value=x.dataset.edit;loadDailyForm(x.dataset.edit);})); }

$('exportData').addEventListener('click',()=>{ const payload={version:APP_VERSION,exportedAt:new Date().toISOString(),profile,entries,weeklyPlans}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`cutting-tracker-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(url); showToast('Backup exportado.'); });

$('settingsForm').addEventListener('submit',async e=>{e.preventDefault(); profile.targetWater=num('targetWater')||0; profile.targetWeight=num('targetWeight')||''; profile.targetCardioWeek=parseInt($('targetCardioWeek').value||0,10); profile.targetTrainingWeek=parseInt($('targetTrainingWeek').value||0,10); profile.theme=document.querySelector('input[name="theme"]:checked')?.value||'dark'; applyTheme(profile.theme); await saveProfile(); renderAll(); showToast('Configurações salvas.');});
function renderSettings(){ $('targetWater').value=profile.targetWater??''; $('targetWeight').value=profile.targetWeight??''; $('targetCardioWeek').value=profile.targetCardioWeek??''; $('targetTrainingWeek').value=profile.targetTrainingWeek??''; document.querySelectorAll('input[name="theme"]').forEach(r=>r.checked=r.value===(profile.theme||'dark')); $('firebaseStatus').innerHTML=isFirebaseConfigured?'<strong>Sincronização:</strong> Firebase configurado. Seus registros são armazenados por conta e protegidos por regras do Firestore.':'<strong>Modo atual:</strong> local. Para sincronizar entre dispositivos, preencha <code>firebaseConfig.js</code>, habilite Authentication por e-mail/senha e publique as regras de <code>firestore.rules</code>.'; }
$('themeToggle').addEventListener('click',()=>{ const next=(document.documentElement.classList.contains('light')?'dark':'light'); profile.theme=next; applyTheme(next); saveProfile(); renderSettings(); });
function applyTheme(theme){ const mode=theme==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme; document.documentElement.classList.toggle('light',mode==='light'); }

function escapeHTML(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function renderAll(){ renderDashboard(); renderWeekly(); renderHistory(); renderSettings(); $('dailyDate').value=$('dailyDate').value||todayISO(); }
