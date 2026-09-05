(() => {
  'use strict';
  const PARTS = ['seed/part1.txt','seed/part2.txt','seed/part3.txt','seed/part4.txt'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v ?? '').trim();
  const normLine = v => norm(v).toUpperCase().replace(/[-_]/g,' ').replace(/\s+/g,' ');
  const statusRank = s => ({'REVISAR':6,'INCONFORMIDADE':5,'IMPEDIDA / NÃO REALIZADA':4,'OK':2,'COMISSIONADA · CONDIÇÃO NÃO CLASSIFICADA':1}[s] || 0);
  const statusClass = s => s === 'OK' ? 'ok' : s === 'INCONFORMIDADE' ? 'bad' : s === 'IMPEDIDA / NÃO REALIZADA' ? 'warn' : s === 'REVISAR' ? 'review' : 'violet';
  const statusLabel = s => s || 'N/I';
  const cleanPending = s => norm(s).replace(/^"|"$/g,'').replace(/","/g,' · ');
  const serialDate = n => {
    const x = Number(n); if (!Number.isFinite(x) || x <= 0) return '';
    const d = new Date(Date.UTC(1899,11,30) + x * 86400000);
    return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(d);
  };
  const towerCodes = raw => norm(raw).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
    const m=x.match(/(\d{1,3})(?:\s*[-_ ]?([A-Z]))?/i); if(!m) return x.toUpperCase();
    return 'T'+String(Number(m[1])).padStart(3,'0')+(m[2]?'-'+m[2].toUpperCase():'');
  });
  const towerNum = code => Number((String(code).match(/\d+/)||['0'])[0]);
  const recordEffectiveStatus = r => /^REVISAR/i.test(r.validation) ? 'REVISAR' : r.status;

  let records=[], observedEvidence=[], evidence=[], towers=[], installPrompt=null;

  async function loadSeed(){
    const chunks = await Promise.all(PARTS.map(async p=>{
      const res=await fetch(p,{cache:'no-store'}); if(!res.ok) throw new Error('Falha ao abrir '+p); return res.text();
    }));
    const lines=chunks.flatMap(t=>t.split(/\r?\n/)).map(x=>x.trim()).filter(Boolean);
    records=lines.map((line,index)=>{
      const f=line.split('|');
      while(f.length<12) f.push('');
      return {idx:index+1,id:f[0],dateSerial:Number(f[1])||0,date:serialDate(f[1]),activity:f[2],line:normLine(f[3]),towersRaw:f[4],obs:f[5],os:f[6],pending:cleanPending(f[7]),nc:Number(f[8])||0,status:f[9],reason:f[10],validation:f.slice(11).join('|')};
    });
    observedEvidence=[];
    records.forEach(r=>towerCodes(r.towersRaw).forEach(t=>observedEvidence.push({...r,tower:t,synthetic:false,effectiveStatus:recordEffectiveStatus(r)})));
    evidence=[...observedEvidence];
    for(let n=377;n<=606;n++){
      evidence.push({idx:0,id:'waimiri-'+n,dateSerial:0,date:'Regra operacional',activity:'Comissionamento',line:'LEEQ LTI7',towersRaw:String(n),tower:'T'+String(n).padStart(3,'0'),obs:'Reserva Indígena Waimiri Atroari — comissionamento contabilizado em 100%.',os:'',pending:'Condição técnica individual não classificada na ausência de evidência observada.',nc:0,status:'COMISSIONADA · CONDIÇÃO NÃO CLASSIFICADA',effectiveStatus:'COMISSIONADA · CONDIÇÃO NÃO CLASSIFICADA',reason:'Regra operacional Waimiri T377–T606',validation:'REGRA SINTÉTICA',synthetic:true});
    }
    buildTowers();
  }

  function buildTowers(){
    const map=new Map();
    evidence.forEach(ev=>{
      const key=ev.line+'|'+ev.tower;
      if(!map.has(key)) map.set(key,{key,line:ev.line,tower:ev.tower,all:[],latestByActivity:new Map()});
      const t=map.get(key); t.all.push(ev);
      const cur=t.latestByActivity.get(ev.activity);
      if(!cur || ev.dateSerial>cur.dateSerial || (ev.dateSerial===cur.dateSerial && statusRank(ev.effectiveStatus)>statusRank(cur.effectiveStatus))) t.latestByActivity.set(ev.activity,ev);
    });
    towers=[...map.values()].map(t=>{
      const latest=[...t.latestByActivity.values()];
      const worst=latest.reduce((a,b)=>statusRank(b.effectiveStatus)>statusRank(a?.effectiveStatus)?b:a,null);
      const last=latest.reduce((a,b)=>b.dateSerial>(a?.dateSerial??-1)?b:a,null);
      const alerts=latest.filter(x=>x.pending||x.effectiveStatus==='REVISAR'||x.effectiveStatus==='IMPEDIDA / NÃO REALIZADA').map(x=>x.pending||x.validation||x.reason).filter(Boolean);
      return {...t,latest,currentStatus:worst?.effectiveStatus||'',lastDate:last?.dateSerial||0,lastDateText:last?.date||'',activities:[...t.latestByActivity.keys()].sort(),alert:alerts[0]||'',hasObserved:t.all.some(x=>!x.synthetic)};
    }).sort((a,b)=>a.line.localeCompare(b.line)||towerNum(a.tower)-towerNum(b.tower)||a.tower.localeCompare(b.tower));
  }

  function currentFilters(){ return {q:norm($('#q').value).toLowerCase(),line:$('#lineFilter').value,status:$('#statusFilter').value,activity:$('#activityFilter').value}; }
  function towerMatches(t,f){
    if(f.line && t.line!==f.line) return false;
    if(f.status && t.currentStatus!==f.status) return false;
    if(f.activity && !t.latestByActivity.has(f.activity)) return false;
    if(f.q){const hay=[t.tower,t.line,t.currentStatus,t.activities.join(' '),t.alert,...t.all.map(x=>[x.os,x.pending,x.obs,x.reason,x.validation].join(' '))].join(' ').toLowerCase(); if(!hay.includes(f.q)) return false;}
    return true;
  }
  function recordMatches(r,f){
    if(f.line && r.line!==f.line) return false;
    if(f.status && recordEffectiveStatus(r)!==f.status) return false;
    if(f.activity && r.activity!==f.activity) return false;
    if(f.q && ![r.towersRaw,r.line,r.activity,r.os,r.pending,r.obs,r.reason,r.validation].join(' ').toLowerCase().includes(f.q)) return false;
    return true;
  }

  function renderKpis(){
    const counts=records.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
    const review=records.filter(r=>/^REVISAR/i.test(r.validation)).length;
    const uniqueObserved=new Set(observedEvidence.map(x=>x.line+'|'+x.tower)).size;
    const html=[
      ['Registros HF34',records.length,'snapshot estruturado',''],
      ['Evidências torre–atividade',observedEvidence.length,'após expansão multitorre',''],
      ['OK',counts.OK||0,'registros','ok'],
      ['Inconformidades',counts.INCONFORMIDADE||0,'registros','bad'],
      ['Impedidas',counts['IMPEDIDA / NÃO REALIZADA']||0,'registros','warn'],
      ['Torres observadas',uniqueObserved,review?review+' item(ns) para revisar':'sem revisão de linha','violet']
    ].map(x=>`<article class="kpi ${x[3]}"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
    $('#kpis').innerHTML=html;
  }

  function renderTowers(){
    const f=currentFilters(), list=towers.filter(t=>towerMatches(t,f));
    $('#towerCount').textContent=list.length+' torre(s)';
    $('#towerBody').innerHTML=list.map(t=>`<tr>
      <td><span class="tower-code">${esc(t.tower)}</span>${t.line==='LEEQ LTI7'&&towerNum(t.tower)>=377&&towerNum(t.tower)<=606?'<br><small class="muted">Reserva WA</small>':''}</td>
      <td>${esc(t.line.replace(' ','-'))}</td>
      <td><span class="pill ${statusClass(t.currentStatus)}">${esc(statusLabel(t.currentStatus))}</span></td>
      <td>${esc(t.activities.join(' · '))}</td>
      <td>${esc(t.lastDateText||'Regra operacional')}</td>
      <td>${t.alert?esc(t.alert):'<span class="muted">Sem alerta atual</span>'}</td>
      <td><button class="action" data-dossier="${esc(t.key)}">Abrir</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma torre encontrada com estes filtros.</td></tr>';
  }

  function renderRecords(){
    const f=currentFilters(), list=records.filter(r=>recordMatches(r,f));
    $('#recordCount').textContent=list.length+' registro(s)';
    $('#recordBody').innerHTML=list.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.line.replace(' ','-'))}</td><td class="tower-code">${esc(towerCodes(r.towersRaw).join(', '))}</td><td>${esc(r.activity)}</td><td><span class="pill ${statusClass(recordEffectiveStatus(r))}">${esc(recordEffectiveStatus(r))}</span></td><td>${esc(r.os||'—')}</td><td>${r.pending?esc(r.pending):'<span class="muted">—</span>'}</td><td>${esc(r.validation||'OK')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nenhum registro encontrado.</td></tr>';
  }

  function renderReview(){
    const f=currentFilters();
    const list=records.filter(r=>recordMatches(r,f) && (recordEffectiveStatus(r)!=='OK' || r.validation!=='OK'));
    $('#reviewCount').textContent=list.length+' item(ns)';
    $('#reviewList').innerHTML=list.map(r=>`<article class="review-item"><span class="pill ${statusClass(recordEffectiveStatus(r))}">${esc(recordEffectiveStatus(r))}</span><div><h3>${esc(r.line.replace(' ','-'))} · ${esc(towerCodes(r.towersRaw).join(', '))} · ${esc(r.activity)}</h3><p><strong>Data:</strong> ${esc(r.date)} &nbsp; <strong>OS:</strong> ${esc(r.os||'N/I')}</p><p>${esc(r.pending||r.obs||r.reason||'Sem texto adicional.')}</p><p><strong>Validação:</strong> ${esc(r.validation||'OK')} · ${esc(r.reason||'')}</p></div></article>`).join('') || '<p class="muted">Nenhum item de revisão com estes filtros.</p>';
  }

  function renderAudit(){
    const counts=records.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
    const multi=records.filter(r=>towerCodes(r.towersRaw).length>1);
    const expanded=observedEvidence.length;
    const warnings=records.filter(r=>/^REVISAR/i.test(r.validation));
    $('#reconciliation').innerHTML=`<strong>${records.length}</strong> registros estruturados → <strong>${expanded}</strong> evidências torre–atividade. Estados de origem: ${counts.OK||0} OK, ${counts.INCONFORMIDADE||0} inconformidades e ${counts['IMPEDIDA / NÃO REALIZADA']||0} impedidas. ${multi.length} registros multitorre. ${warnings.length} registro(s) marcado(s) para revisão.`;
  }

  function renderAll(){ renderKpis(); renderTowers(); renderRecords(); renderReview(); renderAudit(); }

  function openDossier(key){
    const t=towers.find(x=>x.key===key); if(!t) return;
    $('#dossierTitle').textContent=t.line.replace(' ','-')+' · '+t.tower;
    const latest=[...t.latestByActivity.values()].sort((a,b)=>a.activity.localeCompare(b.activity));
    const timeline=[...t.all].sort((a,b)=>b.dateSerial-a.dateSerial || statusRank(b.effectiveStatus)-statusRank(a.effectiveStatus));
    $('#dossierContent').innerHTML=`<div class="dossier-grid">
      <div class="dossier-card"><span>Status atual</span><strong><span class="pill ${statusClass(t.currentStatus)}">${esc(t.currentStatus)}</span></strong></div>
      <div class="dossier-card"><span>Atividades atuais</span><strong>${esc(t.activities.join(' · '))}</strong></div>
      <div class="dossier-card"><span>Última evidência</span><strong>${esc(t.lastDateText||'Regra operacional')}</strong></div>
      <div class="dossier-card"><span>Histórico</span><strong>${t.all.length} evidência(s)</strong></div>
    </div>
    <div class="timeline"><h3>Estado vigente por atividade</h3>${latest.map(e=>eventHtml(e,true)).join('')}<h3>Histórico completo</h3>${timeline.map(e=>eventHtml(e,false)).join('')}</div>`;
    $('#dossier').showModal();
  }
  function eventHtml(e,current){
    return `<article class="event ${statusClass(e.effectiveStatus)}"><h4>${esc(e.activity)} · <span class="pill ${statusClass(e.effectiveStatus)}">${esc(e.effectiveStatus)}</span>${current?' · vigente':''}</h4><p><strong>Data:</strong> ${esc(e.date||'Regra operacional')} &nbsp; <strong>OS:</strong> ${esc(e.os||'N/I')} &nbsp; <strong>Origem:</strong> ${e.synthetic?'Regra Waimiri':'Registro HF34'}</p>${e.pending?`<p><strong>Pendência:</strong> ${esc(e.pending)}</p>`:''}${e.obs&&e.obs!=='Sem observações'?`<p><strong>Observação:</strong> ${esc(e.obs)}</p>`:''}<p><strong>Motivo:</strong> ${esc(e.reason||'—')} &nbsp; <strong>Validação:</strong> ${esc(e.validation||'OK')}</p></article>`;
  }

  function setup(){
    const acts=[...new Set(records.map(r=>r.activity).filter(Boolean))].sort(); $('#activityFilter').insertAdjacentHTML('beforeend',acts.map(x=>`<option>${esc(x)}</option>`).join(''));
    ['q','lineFilter','statusFilter','activityFilter'].forEach(id=>$('#'+id).addEventListener(id==='q'?'input':'change',renderAll));
    $('#clearBtn').addEventListener('click',()=>{ $('#q').value=''; $('#lineFilter').value=''; $('#statusFilter').value=''; $('#activityFilter').value=''; renderAll(); });
    $$('.tab').forEach(b=>b.addEventListener('click',()=>{ $$('.tab').forEach(x=>x.classList.toggle('active',x===b)); $$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+b.dataset.tab)); }));
    document.addEventListener('click',e=>{ const b=e.target.closest('[data-dossier]'); if(b) openDossier(b.dataset.dossier); });
    $('#closeDossier').addEventListener('click',()=>$('#dossier').close());
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').hidden=false;});
    $('#installBtn').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#installBtn').hidden=true;});
    if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  (async()=>{
    try{ await loadSeed(); setup(); renderAll(); $('#loadState').textContent=`HF34 carregada · ${records.length} registros`; $('#loadState').className='state ready'; }
    catch(err){ console.error(err); $('#loadState').textContent='Falha ao carregar a base'; $('#loadState').className='state error'; document.body.insertAdjacentHTML('beforeend',`<div style="position:fixed;left:12px;right:12px;bottom:12px;background:#4c0519;color:#fecdd3;padding:12px;border-radius:12px;z-index:99">${esc(err.message)}</div>`); }
  })();
})();