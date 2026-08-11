'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=s=>{const n=parseFloat(String(s??'').replace(',','.'));return isNaN(n)?0:n};
const fmt=n=>n.toFixed(2).replace('.',',');
const round2=x=>Math.round(x*100)/100;
const norm=s=>(s||'').toLowerCase().replace(/ё/g,'е');
function toast(msg,type){const el=document.createElement('div');el.className='toast'+(type?' '+type:'');el.textContent=msg;$('#toastWrap').appendChild(el);setTimeout(()=>el.remove(),3400)}
let _noteId=100; function mkNote(text,done){return{id:'n'+(_noteId++),text:text,done:!!done}}
const state={view:'oc',tab:'general',openOi:null,expanded:{},viewer:null,viewerDoc:null,mechMode:'mono',mechKind:'МЕХ',heatOpen:false,letterEdit:false,mechDocs:[],accOpen:{},doneOpen:{},notesOpen:false,photoQuery:'',photoSel:[],moveWizard:null};
const VS={zoom:100,docs:{},photos:{},openTabs:{}};
function ensureDocPages(d){if(!d.pages)d.pages=Array.from({length:3},(_,i)=>({kind:i===0?'title':'skel'}))}
function docListFor(scope){ if(scope==='oc')return DOCS; if(scope==='mech-new')return state.mechDocs||[]; return ((OI.find(o=>o.id===scope)||{}).docs||[]); }
function scopeLabel(sc){return sc==='oc'?'ОЦ':(sc==='mech-new'?'Новый':'ОИ')}
function photoPages(oi){const a=[];Object.keys(oi.photos||{}).forEach(cat=>{for(let i=0;i<oi.photos[cat];i++)a.push({cat:cat,i:i})});return a}
function photoGroups(oi){return Object.keys(oi.photos||{}).map(c=>({cat:c,items:Array.from({length:oi.photos[c]},(_,i)=>({cat:c,i:i}))}))}
function autoCategory(oi){ if(oi.kind==='vehicle')return 'Движимое · ТС'; if(oi.kind==='mech')return 'Движимое · Механизм'; if(oi.kind==='office')return 'Движимое · Офисная техника'; if(oi.kind==='land')return 'Земельный участок'; return oi.catClass||'Гражданское'; }
function requiredFlags(oi){const p=(oi.catClass||'')==='Производственно-складское';return{height:p,walls:p,buildType:!p}}
function oiVerbal(oi){const f=oi.flags||{}; if(f.entered&&f.matched)return{t:'сверен с осмотром',c:'pill-done'}; if(f.entered)return{t:'заполнен',c:'pill-pend'}; return{t:'не заполнено',c:'pill-gray'}}
function buildFloors(oi){const n=Math.max(1,oi.floors|0);const he=oi.heights.ext||'';const hi=oi.heights.int||'';const keep=oi.floorList||[];const list=[];const mk=(name,on,special)=>{const ex=keep.find(f=>f.name===name&&!!f.special===special);return ex||{name,on,special,area:'',hExt:special?'':he,hInt:special?'':hi}};for(let i=0;i<n;i++)list.push(mk('Этаж '+(i+1),true,false));['Подвал','Мансарда','Цоколь'].forEach(sp=>list.push(mk(sp,false,true)));oi.floorList=list;recalcFloors(oi)}
function recalcFloors(oi){const total=num(oi.areas.tp);const manual=oi.floorList.filter(f=>!f.on);const auto=oi.floorList.filter(f=>f.on);const mSum=manual.reduce((s,f)=>s+num(f.area),0);const rem=Math.max(0,total-mSum);if(auto.length){const base=Math.floor(rem/auto.length*100)/100;let acc=0;auto.forEach((f,i)=>{const a=i===auto.length-1?round2(rem-acc):base;acc+=a;f.area=fmt(a)})}}
function floorsSum(oi){return (oi.floorList||[]).reduce((s,f)=>s+num(f.area),0)}
function currentOI(){return state.view==='oi'?OI.find(o=>o.id===state.openOi):null}
function findNote(scope,id){ if(scope==='oc')return (OC.notes||[]).find(n=>n.id===id); const oi=OI.find(o=>o.id===scope); return oi?(oi.notes||[]).find(n=>n.id===id):null; }
function totalPendingNotes(){return (OC.notes||[]).filter(n=>!n.done).length + OI.reduce((s,o)=>s+(o.notes||[]).filter(n=>!n.done).length,0)}
function noteCounts(scope){const notes=scope==='oc'?(OC.notes||[]):((OI.find(o=>o.id===scope)||{}).notes||[]);return{p:notes.filter(n=>!n.done).length,d:notes.filter(n=>n.done).length}}
function extractLetterRef(qn){let m=qn.match(/лит(?:ера)?\s*([а-яa-z])/);if(m)return{letter:m[1].toUpperCase(),rest:qn.replace(m[0],' ')};const tokens=qn.split(/\s+/).filter(Boolean);const lt=tokens.find(t=>t.length===1&&LETTER_SEQ.includes(t.toUpperCase()));if(lt)return{letter:lt.toUpperCase(),rest:tokens.filter(t=>t!==lt).join(' ')};return null}
function photoMatches(oi,cat,idx,q){ if(!q||!q.trim())return true; const qn=norm(q); const ref=extractLetterRef(qn); if(ref&&ref.letter!==oi.letter.toUpperCase())return false; const rest=ref?ref.rest:qn; const words=rest.split(/\s+/).filter(w=>w.length>2); if(!words.length)return true; const hay=norm(oi.letter+' '+oi.name+' '+cat+' фото'); return words.some(w=>hay.includes(w)); }
OI.filter(o=>o.kind==='realty').forEach(buildFloors);