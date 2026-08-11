'use strict';
function bindTiles(){ document.querySelectorAll('[data-tile-photo]').forEach(t=>{ t.onclick=e=>{ const sel=t.dataset.tileSel; if(e.ctrlKey||e.metaKey){ togglePhotoSel(sel); return; } const [oiId,idx]=t.dataset.tilePhoto.split('|'); openPhotoInPlace(oiId,+idx); }; }); }
function togglePhotoSel(key){ const [oi,cat,i]=key.split('|'); const idx=+i; const ex=state.photoSel.findIndex(s=>s.oi===oi&&s.cat===cat&&s.i===idx); if(ex>=0)state.photoSel.splice(ex,1); else state.photoSel.push({oi:oi,cat:cat,i:idx}); render(); }
function startMove(){ if(!state.photoSel.length)return; state.moveWizard={step:'pick',src:state.photoSel[0].oi,query:'',items:state.photoSel.map(s=>({key:s.oi+'|'+s.cat+'|'+s.i,oi:s.oi,cat:s.cat,i:s.i,to:s.cat}))}; render(); }
function confirmMove(){ const mw=state.moveWizard; const src=OI.find(o=>o.id===mw.src); const tgt=OI.find(o=>o.id===mw.target); if(!src||!tgt)return;
  mw.items.forEach(it=>{ if(src.photos[it.cat])src.photos[it.cat]=Math.max(0,(src.photos[it.cat]||0)-1); tgt.photos[it.to]=(tgt.photos[it.to]||0)+1; });
  state.photoSel=[]; state.moveWizard=null; render(); toast('Фото перенесены в Лит '+tgt.letter,'ok'); }
function bind(){
  document.querySelectorAll('[data-crumb]').forEach(s=>s.onclick=()=>{state.view='oc';state.viewer=null;state.tab='general';render()});
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; if(state.tab==='docs'){state.viewer={mode:'doc'};if(!state.viewerDoc&&DOCS.length)state.viewerDoc={scope:'oc',id:DOCS[0].id};} else if(state.tab==='photo'){ if(state.viewer&&state.viewer.mode!=='photo')state.viewer=null; } else state.viewer=null; render();});
  document.querySelectorAll('[data-dd-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();b.closest('.dd').classList.toggle('open')});
  document.querySelectorAll('[data-add-oi]').forEach(b=>b.onclick=e=>{e.stopPropagation();addOi(b.dataset.addOi)});
  const be=$('#btnEditOc'); if(be)be.onclick=()=>{state.view='ocform';state.viewer={mode:'doc'};state.viewerDoc=null;render()};
  const bd=$('#btnDelOc'); if(bd)bd.onclick=()=>toast('Удаление ОЦ — с подтверждением','warn');
  const al=document.querySelector('[data-add-letter]'); if(al)al.onclick=addLetter;
  const nt=document.querySelector('[data-notes-toggle]'); if(nt)nt.onclick=()=>{state.notesOpen=!state.notesOpen;const dr=$('#notesDrawer');if(dr)dr.classList.toggle('open',state.notesOpen)};
  const ps=$('#photoSearch'); if(ps)ps.oninput=()=>{state.photoQuery=ps.value;const sec=$('#photoSections');if(sec)sec.innerHTML=photoSectionsHTML();bindTiles()};
  bindTiles();
  document.querySelectorAll('[data-tile-sel]').forEach(t=>{}); // selection handled in bindTiles via ctrl
  document.querySelectorAll('[data-del-oi]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteOi(b.dataset.delOi)});
  // Аккордеоны литер: шеврон и литерная ячейка переключают аккордеон, не открывая карточку
  document.querySelectorAll('[data-acc-btn]').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleAcc(b.dataset.accBtn)});
  document.querySelectorAll('[data-acc-cell]').forEach(td=>td.onclick=e=>{e.stopPropagation();toggleAcc(td.dataset.accCell)});
  document.querySelectorAll('tr[data-open-oi]').forEach(tr=>{tr.onclick=e=>{ if(e.target.closest('button')||e.target.closest('.ph-mini')||e.target.closest('[data-acc-cell]')||e.target.closest('[data-acc-btn]'))return; openOI(tr.dataset.openOi); };});
  document.querySelectorAll('[data-vsplit]').forEach(sp=>{sp.addEventListener('pointerdown',e=>{e.preventDefault();const split=sp.parentElement;const rect=split.getBoundingClientRect();const maxVW=Math.min(70,Math.max(25,((rect.width-620)/rect.width)*100));const move=ev=>{const pct=((ev.clientX-rect.left)/rect.width)*100;split.style.setProperty('--vw',Math.min(maxVW,Math.max(25,pct))+'%')};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)})});
  document.querySelectorAll('[data-vmode]').forEach(b=>b.onclick=e=>{e.stopPropagation();const m=b.dataset.vmode; if(m==='photo')state.viewer={mode:'photo'}; else if(m==='doc'){state.viewer={mode:'doc'}; if(!state.viewerDoc){const sc=(state.view==='oi'&&currentOI()&&currentOI().kind!=='realty'&&(currentOI().docs||[]).length)?currentOI().id:'oc'; const l=docListFor(sc); if(l.length)state.viewerDoc={scope:sc,id:l[0].id};}} else {state.viewer={mode:'compare'}; if(!state.viewerDoc){const l=docListFor('oc'); if(l.length)state.viewerDoc={scope:'oc',id:l[0].id};}} render();});
  // Перенос фото
  const msb=document.querySelector('[data-move-start]'); if(msb)msb.onclick=()=>startMove();
  const mc=document.querySelector('[data-move-cancel]'); if(mc)mc.onclick=()=>{state.moveWizard=null;render()};
  const mq=document.querySelector('[data-mw-query]'); if(mq)mq.oninput=()=>{state.moveWizard.query=mq.value;render()};
  document.querySelectorAll('[data-mw-lit]').forEach(l=>l.onclick=()=>{state.moveWizard.target=l.dataset.mwLit;state.moveWizard.step='map';render()});
  const mas=document.querySelector('[data-mw-assign]'); if(mas)mas.onclick=()=>{const cat=document.querySelector('[data-mw-cat]').value; state.moveWizard.items.forEach(it=>{it.to=cat}); render();};
  const mcf=document.querySelector('[data-move-confirm]'); if(mcf)mcf.onclick=()=>confirmMove();
  document.querySelectorAll('[data-chip]').forEach(ch=>{ch.onclick=e=>{ch.classList.toggle('sel');}; ch.ondragstart=e=>{e.dataTransfer.setData('text/plain',ch.dataset.chip)};});
  document.querySelectorAll('[data-bucket]').forEach(bk=>{ bk.ondragover=e=>{e.preventDefault();bk.classList.add('over')}; bk.ondragleave=()=>bk.classList.remove('over'); bk.ondrop=e=>{e.preventDefault();bk.classList.remove('over'); const key=e.dataTransfer.getData('text/plain'); const it=state.moveWizard.items.find(x=>x.key===key); if(it){it.to=bk.dataset.bucket; render();} };});
  // Сравнение: клик по ленте выбирает независимо, прокрутка естественная
  document.querySelectorAll('[data-cmp-photo]').forEach(it=>it.onclick=()=>{const st=VS.photos[state.openOi]||(VS.photos[state.openOi]={page:1}); st.page=+it.dataset.cmpPhoto; render();});
  document.querySelectorAll('[data-cmp-doc]').forEach(it=>it.onclick=()=>{const st=vSt(); if(st){st.page=+it.dataset.cmpDoc; render();}});
  // Выбор миниатюр в рейле: ctrl — мультивыбор для переноса
  document.querySelectorAll('[data-vthumb][data-psel]').forEach(t=>{t.onclick=e=>{ if(e.target.closest('[data-vdelpage]'))return; if(e.ctrlKey||e.metaKey){togglePhotoSel(t.dataset.psel);return;} vGo(+t.dataset.vthumb); };});
  document.querySelectorAll('[data-resp]').forEach(s=>s.onchange=()=>{OC.resp[s.dataset.resp]=s.value;toast('Ответственный обновлён','ok')});
  document.querySelectorAll('[data-owner-rm]').forEach(x=>x.onclick=e=>{e.stopPropagation();OC.owners.splice(+x.dataset.ownerRm,1);render()});
  document.querySelectorAll('[data-user-rm]').forEach(x=>x.onclick=e=>{e.stopPropagation();OC.users.splice(+x.dataset.userRm,1);render()});
  document.querySelectorAll('[data-add-party]').forEach(b=>b.onclick=()=>{const who=b.dataset.addParty==='owner'?'Собственник':'Пользователь';const v=prompt(who+':');if(v){(b.dataset.addParty==='owner'?OC.owners:OC.users).push(v);render();toast(who+' добавлен','ok')}});
  document.querySelectorAll('[data-attach]').forEach(b=>b.onclick=e=>{e.stopPropagation();const t=b.dataset.attach;const n=prompt('Наименование ('+t+'):');if(n){DOCS.push({id:'d'+Date.now(),type:t,name:n,date:'07.08.2026',pages:null});render();toast('Документ прикреплён','ok')}});
  document.querySelectorAll('[data-attach-default]').forEach(b=>b.onclick=e=>{e.stopPropagation();const t=prompt('Тип: '+DOC_TYPES.join(', '),DOC_TYPES[0]);if(!t)return;const n=prompt('Наименование:');if(!n)return;DOCS.push({id:'d'+Date.now(),type:t,name:n,date:'07.08.2026',pages:null});render();toast('Документ прикреплён','ok')});
  document.querySelectorAll('[data-doc-del]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.docDel;DOCS=DOCS.filter(d=>d.id!==id);VS.openTabs.oc=(VS.openTabs.oc||[]).filter(x=>x!==id);if(state.viewerDoc&&state.viewerDoc.id===id){state.viewerDoc=(VS.openTabs.oc.length)?{scope:'oc',id:VS.openTabs.oc[VS.openTabs.oc.length-1]}:null;if(!state.viewerDoc)state.viewer=null;}render();toast('Документ откреплён')});
  document.querySelectorAll('[data-open-doc]').forEach(tr=>tr.onclick=e=>{if(e.target.closest('[data-doc-del]'))return;openDocViewer('oc',tr.dataset.openDoc)});
  document.querySelectorAll('[data-open-ocdocs]').forEach(b=>b.onclick=e=>{e.stopPropagation();const t=VS.openTabs['oc']||[];openDocViewer('oc',t.length?t[t.length-1]:(DOCS[0]?DOCS[0].id:null))});
  document.querySelectorAll('[data-open-movdoc]').forEach(tr=>tr.onclick=e=>{const [s,id]=tr.dataset.openMovdoc.split('|');openDocViewer(s,id)});
  document.querySelectorAll('[data-open-photo]').forEach(p=>p.onclick=e=>{e.stopPropagation();const [oiId,rest]=p.dataset.openPhoto.split('|');const [cat,i]=rest.split(':');const oi=OI.find(o=>o.id===oiId);const idx=photoPages(oi).findIndex(x=>x.cat===cat&&x.i===+i)+1;openPhotoViewer(oiId,idx)});
  document.querySelectorAll('[data-add-photo]').forEach(b=>b.onclick=e=>{e.stopPropagation();const oi=currentOI();if(oi){oi.photos[b.dataset.addPhoto]=(oi.photos[b.dataset.addPhoto]||0)+1;render();toast('Фото загружено','ok')}});
  document.querySelectorAll('[data-open-pviewer]').forEach(b=>b.onclick=e=>{e.stopPropagation();state.viewer={mode:'photo'};render()});
  document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{state.view='oc';state.viewer=null;state.heatOpen=false;state.letterEdit=false;render()});
  const elBtn=document.querySelector('[data-edit-letter]'); if(elBtn)elBtn.onclick=()=>{state.letterEdit=true;render();const i=document.querySelector('[data-letter-input]');if(i){i.focus();i.select()}};
  const ls=document.querySelector('[data-letter-save]'); if(ls)ls.onclick=()=>{const oi=currentOI();if(!oi)return;const inp=document.querySelector('[data-letter-input]');const v=(inp?inp.value:'').trim();if(!v||v===oi.letter){state.letterEdit=false;render();return;} if(OI.some(o=>o!==oi&&o.kind==='realty'&&o.letter===v)){toast('Литера занята','warn');return;} oi.letter=v;state.letterEdit=false;render();toast('Литера переименована','ok')};
  const lc=document.querySelector('[data-letter-cancel]'); if(lc)lc.onclick=()=>{state.letterEdit=false;render()};
  const vp=document.querySelector('[data-vpage]'); if(vp)vp.onchange=()=>vGo(+vp.value||1);
  const vpr=document.querySelector('[data-vprev]'); if(vpr)vpr.onclick=()=>vGo(vSt().page-1);
  const vn=document.querySelector('[data-vnext]'); if(vn)vn.onclick=()=>vGo(vSt().page+1);
  const vr=document.querySelector('[data-vrot]'); if(vr)vr.onclick=()=>{const st=vSt();if(!st)return;st.rot=(st.rot+90)%360;document.querySelectorAll('[data-vpageinner]').forEach(p=>p.style.transform='rotate('+st.rot+'deg)')};
  const zm=document.querySelector('[data-vzoom-]'); if(zm)zm.onclick=()=>setVZoom(VS.zoom-10);
  const zp=document.querySelector('[data-vzoom\\+]'); if(zp)zp.onclick=()=>setVZoom(VS.zoom+10);
  const vc=document.querySelector('[data-vclose]'); if(vc)vc.onclick=()=>{state.viewer=null;state.moveWizard=null;render()};
  document.querySelectorAll('[data-vthumb]:not([data-psel])]').forEach(t=>t.onclick=e=>{if(e.target.closest('[data-vdelpage]'))return;vGo(+t.dataset.vthumb)});
  document.querySelectorAll('[data-vdelpage]').forEach(b=>b.onclick=e=>{e.stopPropagation();const d=docListFor(state.viewerDoc.scope).find(x=>x.id===state.viewerDoc.id);if(!d||d.pages.length<=1){toast('Нельзя удалить единственную страницу','warn');return}d.pages.splice(+b.dataset.vdelpage-1,1);const st=vSt();if(st)st.page=Math.min(st.page,d.pages.length);render()});
  const vap=document.querySelector('[data-vaddpage]'); if(vap)vap.onclick=()=>{const d=docListFor(state.viewerDoc.scope).find(x=>x.id===state.viewerDoc.id);if(!d)return;d.pages.push({kind:'skel'});render();toast('Страница добавлена','ok')};
  const vstageEl=document.querySelector('[data-vstage]');
  if(vstageEl&&state.viewer&&state.viewer.mode!=='compare'){const st=vSt();vstageEl.scrollTop=st.scroll||0;const ribbonEl=document.querySelector('[data-vribbon]');if(ribbonEl)ribbonEl.style.zoom=String(VS.zoom/100); vstageEl.addEventListener('scroll',()=>{st.scroll=vstageEl.scrollTop;const top=vstageEl.getBoundingClientRect().top;let cur=1;ribbonEl.querySelectorAll('[data-vpageblk]').forEach(bl=>{if(bl.getBoundingClientRect().top-top<=60)cur=+bl.dataset.vpageblk});if(cur!==st.page){st.page=cur;const inp=document.querySelector('[data-vpage]');if(inp)inp.value=cur;document.querySelectorAll('[data-vthumb]').forEach(t=>t.classList.toggle('active',+t.dataset.vthumb===cur))}}); vstageEl.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setVZoom(VS.zoom+(e.deltaY<0?10:-10))},{passive:false});}
  const cmpEl=document.querySelector('[data-cmp]'); if(cmpEl){cmpEl.style.zoom=String(VS.zoom/100);}
  const oi=currentOI();
  if(oi&&state.view==='oi'){
    if(oi.kind==='realty'){
      document.querySelectorAll('[data-area]').forEach(i=>i.onchange=()=>{oi.areas[i.dataset.area]=i.value;recalcFloors(oi);updateFloorsUI(oi);updateCtxPlate()});
      document.querySelectorAll('[data-height]').forEach(i=>i.onchange=()=>{oi.heights[i.dataset.height]=i.value});
      const fn=document.querySelector('[data-floors-n]'); if(fn)fn.onchange=()=>{oi.floors=Math.max(1,parseInt(fn.value,10)||1);buildFloors(oi);rerenderFloors(oi);updateCtxPlate()};
      const rd=document.querySelector('[data-redistribute]'); if(rd)rd.onclick=e=>{e.stopPropagation();recalcFloors(oi);updateFloorsUI(oi);toast('Выровнено по остатку','ok')};
      document.querySelectorAll('[data-floor-on]').forEach(c=>c.onchange=()=>{oi.floorList[+c.dataset.floorOn].on=c.checked;recalcFloors(oi);updateFloorsUI(oi)});
      document.querySelectorAll('[data-floor-area]').forEach(i=>i.onchange=()=>{oi.floorList[+i.dataset.floorArea].area=i.value;recalcFloors(oi);updateFloorsUI(oi)});
      document.querySelectorAll('[data-floor-hext]').forEach(i=>i.onchange=()=>{oi.floorList[+i.dataset.floorHext].hExt=i.value});
      document.querySelectorAll('[data-floor-hint]').forEach(i=>i.onchange=()=>{oi.floorList[+i.dataset.floorHint].hInt=i.value});
      const bt=document.querySelector('[data-buildtype]'); if(bt)bt.onchange=()=>{oi.buildType=bt.value;updateCtxPlate()};
      const yr=document.querySelector('[data-year]'); if(yr)yr.onchange=()=>{oi.year=yr.value};
      const cm=document.querySelector('[data-comment]'); if(cm)cm.onchange=()=>{oi.comment=cm.value};
      const dis=document.querySelector('[data-dis]'); if(dis)dis.onchange=()=>{oi.dis=dis.checked};
      const cc=document.querySelector('[data-catclass]'); if(cc)cc.onchange=()=>{oi.catClass=cc.value};
    }
    document.querySelectorAll('[data-status]').forEach(s=>s.onchange=()=>{oi.status=s.value;updateCtxPlate()});
    const nm=document.querySelector('[data-oi-name]'); if(nm)nm.onchange=()=>{oi.name=nm.value;updateCtxPlate()};
    const en=document.querySelector('[data-oi-eni]'); if(en)en.onchange=()=>{oi.eni=en.value.trim()||oi.eni};
    document.querySelectorAll('[data-flag]').forEach(c=>c.onchange=()=>{oi.flags=oi.flags||{};oi.flags[c.dataset.flag]=c.checked;updateCtxPlate()});
    if(oi.kind!=='realty'&&oi.kind!=='land'){ const mn=document.querySelector('[data-mv-name]'); if(mn)mn.onchange=()=>{oi.name=mn.value;updateCtxPlate()}; const vy=document.querySelector('[data-mv-year]'); if(vy)vy.onchange=()=>{oi.year=vy.value}; const sr=document.querySelector('[data-mv-serial]'); if(sr)sr.onchange=()=>{oi.serial=sr.value}; }
    if(oi.kind==='land'){ const lp=document.querySelector('[data-land-purpose]'); if(lp)lp.onchange=()=>{oi.purpose=lp.value}; const la=document.querySelector('[data-land-area]'); if(la)la.onchange=()=>{oi.area=la.value}; }
    document.querySelectorAll('[data-struct]').forEach(s=>s.onchange=()=>{oi.struct[s.dataset.struct]=s.value});
    document.querySelectorAll('[data-ms-toggle]').forEach(c=>c.onclick=e=>{e.stopPropagation();const drop=c.parentElement.querySelector('.ms-drop');document.querySelectorAll('.ms-drop').forEach(d=>{if(d!==drop)d.hidden=true});drop.hidden=!drop.hidden;state.heatOpen=!drop.hidden});
    document.querySelectorAll('[data-heat-opt]').forEach(cb=>cb.onchange=()=>{const h=cb.dataset.heatOpt;const i=oi.heating.indexOf(h);if(i>=0)oi.heating.splice(i,1);else oi.heating.push(h);updateHeatingUI(oi)});
    document.querySelectorAll('[data-heat-rm]').forEach(x=>x.onclick=e=>{e.stopPropagation();const o2=currentOI();if(!o2)return;const h=x.dataset.heatRm;const i=o2.heating.indexOf(h);if(i>=0)o2.heating.splice(i,1);updateHeatingUI(o2)});
    const ho=document.querySelector('[data-heat-other]'); if(ho)ho.onchange=()=>{oi.heatingOther=ho.value};
    document.querySelectorAll('[data-prem-cat]').forEach(s=>s.onchange=()=>{oi.premises[+s.dataset.premCat].cat=s.value});
    document.querySelectorAll('[data-prem-name]').forEach(i=>i.onchange=()=>{oi.premises[+i.dataset.premName].name=i.value});
    document.querySelectorAll('[data-prem-area]').forEach(i=>i.onchange=()=>{oi.premises[+i.dataset.premArea].area=i.value});
    document.querySelectorAll('[data-prem-del]').forEach(b=>b.onclick=()=>{oi.premises.splice(+b.dataset.premDel,1);render()});
    const pa=document.querySelector('[data-prem-add]'); if(pa)pa.onclick=()=>{oi.premises.push({cat:'Помещение',name:'',area:''});render()};
    const am=document.querySelector('[data-add-movdoc]'); if(am)am.onclick=()=>{(oi.docs=oi.docs||[]).push({id:'md'+Date.now(),type:'ПУД',name:'Новый документ',date:'07.08.2026'});render();toast('Документ добавлен','ok')};
    const sv=document.querySelector('[data-save-oi]'); if(sv)sv.onclick=()=>{state.view='oc';state.viewer=null;state.letterEdit=false;render();toast('ОИ сохранён','ok')};
  }
  const fc=$('#fCat'); if(fc)fc.onchange=()=>{OC.category=fc.value;render()};
  const so=$('#btnSaveOc'); if(so)so.onclick=()=>{OC.type=$('#fType').value;OC.purposeTP=$('#fPurpose').value;OC.status=$('#fStatus').value;OC.eni=$('#fEni').value;OC.institution=$('#fInst').value;OC.podved=$('#fPodved').value;OC.address=$('#fAddr').value;OC.gps=$('#fGps').value;OC.complex=!!$('#fComplex')?.checked;state.view='oc';render();toast('ОЦ сохранён','ok')};
  document.querySelectorAll('[data-mech-mode]').forEach(c=>c.onclick=()=>{state.mechMode=c.dataset.mechMode;render()});
  if(state.view==='mech'){ const am=document.querySelector('[data-add-movdoc]'); if(am)am.onclick=()=>{state.mechDocs=state.mechDocs||[];state.mechDocs.push({id:'md'+Date.now(),type:'ПУД',name:'Новый документ',date:'07.08.2026'});render();toast('Документ добавлен','ok')}; }
  const ma=document.querySelector('[data-mech-add]'); if(ma)ma.onclick=()=>{const tb=$('#mechRows');tb.insertAdjacentHTML('beforeend','<tr><td><input class="input" placeholder="Наименование ОИ"></td><td><select class="select"><option>Узел</option><option>Агрегат</option><option>Станция</option><option>Прочее</option></select></td><td><input class="input" placeholder="Код ЕНИ"></td><td><button class="btn btn-ghost btn-sm" data-mech-del>×</button></td></tr>');tb.querySelectorAll('[data-mech-del]').forEach(b=>b.onclick=()=>b.closest('tr').remove())};
  const ms2=document.querySelector('[data-mech-save]'); if(ms2)ms2.onclick=()=>{const kind=state.mechKind==='МЕХ'?'mech':'office';OI.push({id:'oi-m'+Date.now(),kind:kind,name:state.mechMode==='mono'?($('#mName')?.value||'Механизм'):'Комплекс техники',eni:String(147561681360+OI.length),status:'',flags:{entered:false,matched:false},docs:(state.mechDocs||[]).slice(),year:'',serial:'',notes:[]});state.mechDocs=[];state.view='oc';render();toast('Объект добавлен','ok')};
}
function toggleAcc(id){const row=document.querySelector('[data-accrow="'+id+'"]');const btn=document.querySelector('[data-acc-btn="'+id+'"]');const open=state.expanded[id]=!state.expanded[id];if(row)row.style.display=open?'':'none';if(btn)btn.classList.toggle('open',open)}
function openOI(id){state.openOi=id;state.letterEdit=false;const oi=OI.find(o=>o.id===id);state.viewer={mode:(oi&&oi.photos&&Object.keys(oi.photos).length)?'photo':'doc'};state.viewerDoc=null;state.view='oi';render()}
function updateFloorsUI(oi){oi.floorList.forEach((f,i)=>{const a=document.querySelector('[data-floor-area="'+i+'"]');if(a){if(document.activeElement!==a)a.value=f.area;a.readOnly=f.on}const on=document.querySelector('[data-floor-on="'+i+'"]');if(on)on.checked=f.on;const he=document.querySelector('[data-floor-hext="'+i+'"]');if(he&&document.activeElement!==he)he.value=f.hExt;const hi=document.querySelector('[data-floor-hint="'+i+'"]');if(hi&&document.activeElement!==hi)hi.value=f.hInt});const s=document.querySelector('[data-floor-sum]');if(s){const ssum=floorsSum(oi),tot=num(oi.areas.tp);s.textContent='Σ этажей: '+fmt(ssum)+' / '+fmt(tot)+' м²';s.className=Math.abs(ssum-tot)<0.01?'sum-ok':'sum-warn'}}
function rerenderFloors(oi){const w=document.getElementById('floors-'+oi.id);if(w)w.outerHTML='<div id="floors-'+oi.id+'">'+floorsBlock(oi)+'</div>'}
function updateHeatingUI(oi){const mc=document.querySelector('[data-ms-control]');if(mc)mc.innerHTML=oi.heating.length?oi.heating.map(h=>'<span class="ms-tag">'+esc(h)+'<span data-heat-rm="'+esc(h)+'">×</span></span>').join('')+'<span class="ms-add">+ выбрать</span>':'<span class="muted">не выбрано</span><span class="ms-add">+ выбрать</span>'}
function addLetter(){const letter=nextLetter();const oi={id:'oi-r'+Date.now(),kind:'realty',letter:letter,name:'Новое строение',status:'Основное',eni:String(147561681380+OI.length),year:'',flags:{entered:false,matched:false},areas:{tp:'',pud:'',fact:'',build:''},floors:1,floorList:[],heights:{ext:'',int:''},buildType:'Отдельностоящее',struct:{foundation:'Не указано',wallsExt:'Не указано',ceilings:'Не указано',roof:'Не указано',floors:'Не указано',windows:'Не указано',doors:'Не указано'},heating:[],heatingOther:'',comment:'',catClass:'Гражданское',dis:false,premises:[],photos:{},notes:[]};buildFloors(oi);OI.push(oi);state.openOi=oi.id;state.letterEdit=false;state.viewer={mode:'doc'};state.viewerDoc=null;state.view='oi';render();toast('Литера '+letter+' добавлена','ok')}
function deleteOi(id){const oi=OI.find(o=>o.id===id);if(!oi)return;const label=oi.letter?'Литера '+oi.letter:'ОИ';if(!confirm('Удалить «'+label+'» ('+oi.name+')?'))return;OI=OI.filter(o=>o.id!==id);if(state.openOi===id){state.view='oc';state.openOi=null;state.letterEdit=false}render();toast(label+' удалён')}
function addOi(type){document.querySelectorAll('.dd').forEach(d=>d.classList.remove('open')); if(type==='МЕХ'||type==='ОФИС'){state.view='mech';state.mechKind=type;state.mechMode='mono';state.mechDocs=[];state.viewer={mode:'doc'};state.viewerDoc=null;render();return} if(type==='Земельный участок'){if(OI.find(o=>o.kind==='land')){toast('Земельный участок уже добавлен','warn');return}OI.push({id:'oi-l'+Date.now(),kind:'land',name:'Земельный участок',purpose:'',area:'',eni:String(147561681370+OI.length),flags:{entered:false,matched:false},docs:[],notes:[]});state.openOi=OI[OI.length-1].id;state.letterEdit=false;state.viewer={mode:'doc'};state.viewerDoc=null;state.view='oi';render();return} const letter=nextLetter();const oi={id:'oi-r'+Date.now(),kind:'realty',letter:letter,name:type,status:'Основное',eni:String(147561681380+OI.length),year:'',flags:{entered:false,matched:false},areas:{tp:'',pud:'',fact:'',build:''},floors:1,floorList:[],heights:{ext:'',int:''},buildType:'Отдельностоящее',struct:{foundation:'Не указано',wallsExt:'Не указано',ceilings:'Не указано',roof:'Не указано',floors:'Не указано',windows:'Не указано',doors:'Не указано'},heating:[],heatingOther:'',comment:'',catClass:type==='Производственное строение'?'Производственно-складское':'Гражданское',dis:false,premises:[],photos:{},notes:[]};buildFloors(oi);OI.push(oi);state.openOi=oi.id;state.letterEdit=false;state.viewer={mode:'doc'};state.viewerDoc=null;state.view='oi';render();toast('Литера '+letter+' создана','ok')}
function nextLetter(){const used=new Set(OI.filter(o=>o.kind==='realty').map(o=>o.letter));return LETTER_SEQ.find(x=>!used.has(x))||('Л'+(used.size+1))}
// Делегированные заметки
document.addEventListener('click',e=>{
  const addB=e.target.closest('[data-note-add]'); if(addB){e.stopPropagation();addNote(addB.dataset.noteAdd);return}
  const delB=e.target.closest('[data-note-del]'); if(delB){e.stopPropagation();const [s,id]=delB.dataset.noteDel.split('|');removeNote(s,id);return}
  const dt=e.target.closest('[data-done-toggle]'); if(dt){e.stopPropagation();toggleDoneList(dt);return}
  if(!e.target.closest('.dd'))document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open'));
  if(!e.target.closest('.ms')){document.querySelectorAll('.ms-drop').forEach(d=>d.hidden=true);state.heatOpen=false}
  const ah=e.target.closest('[data-acc-toggle]');
  if(ah&&!e.target.closest('button')&&!e.target.closest('input')&&!e.target.closest('select')){e.stopPropagation();const acc=ah.closest('.acc');if(acc){acc.classList.toggle('open');state.accOpen[ah.dataset.accToggle]=acc.classList.contains('open')}return}
  const ch=e.target.closest('[data-card-toggle]');
  if(ch&&!e.target.closest('button')&&!e.target.closest('input')&&!e.target.closest('select')){e.stopPropagation();ch.closest('.card').classList.toggle('collapsed');return}
});
document.addEventListener('change',e=>{
  const chk=e.target.closest('[data-note-check]'); if(chk){const [s,id]=chk.dataset.noteCheck.split('|');const n=findNote(s,id);if(n){n.done=chk.checked;refreshNotesRegion();toast(chk.checked?'Заметка выполнена':'Заметка возвращена в работу','ok')}return}
  const ne=e.target.closest('[data-note-edit]'); if(ne){const [s,id]=ne.dataset.noteEdit.split('|');const n=findNote(s,id);if(n){const t=ne.value.trim();n.text=t||NOTE_DEFAULT;if(!t)ne.value=n.text}return}
});
document.addEventListener('keydown',e=>{const ne=e.target.closest('[data-note-edit]');if(ne&&e.key==='Enter'){e.preventDefault();ne.blur()}});
function addNote(scope){let target; if(scope==='oc')target=(OC.notes=OC.notes||[]); else{const oi=OI.find(o=>o.id===scope);if(!oi)return;target=(oi.notes=oi.notes||[])} const n=mkNote('',false);target.push(n);state.accOpen['grp|'+scope]=true;refreshNotesRegion();const inp=document.querySelector('[data-note-edit="'+scope+'|'+n.id+'"]');if(inp)inp.focus()}
function removeNote(scope,id){if(scope==='oc')OC.notes=(OC.notes||[]).filter(n=>n.id!==id);else{const oi=OI.find(o=>o.id===scope);if(oi)oi.notes=(oi.notes||[]).filter(n=>n.id!==id)}refreshNotesRegion();toast('Заметка удалена')}
function toggleDoneList(btn){const scope=btn.dataset.doneToggle;state.doneOpen=state.doneOpen||{};state.doneOpen[scope]=!state.doneOpen[scope];const list=btn.nextElementSibling;if(list&&list.classList.contains('done-list'))list.hidden=!state.doneOpen[scope];btn.classList.toggle('open',!!state.doneOpen[scope])}
function refreshNotesRegion(){syncDrawer();updateCtxPlate()}
render();