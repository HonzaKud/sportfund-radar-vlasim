"use strict";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STATUS = {open:"Otevřený program",verify:"Ověřit podmínky",watch:"Hlídáme další možnost",idea:"Námět k rozpracování",awarded:"Již získáno",closed:"Termín uplynul"};
const ICONS = {"Nadace":"◇","Dotace":"▤","Vybavení":"↗","Vzdělávání":"⌁","Soutěže":"◈","Rodiny":"◌","Spolupráce":"⊕","Firmy":"▥","Crowdfunding":"◎","Inspirace":"✧","Infrastruktura":"▱","Historie":"↺"};
let data, filter = "all", shown = 9, signalsShown = 8, selected = {}, storageOK = true, lastFocus;
const KEY = "sportfund-vlasim-selection-v1";
try { const raw = JSON.parse(localStorage.getItem(KEY) || "{}"); if (raw && typeof raw === "object" && !Array.isArray(raw)) selected = raw; } catch { storageOK = false; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])); }
const e = escapeHTML;
function url(value) { try { const parsed = new URL(value); return parsed.protocol === "https:" ? parsed.href : "#"; } catch { return "#"; } }
function date(value) { if (!value) return "Nepotvrzeno"; const d = new Date(value.length === 10 ? value + "T12:00:00+02:00" : value); return Number.isNaN(d.getTime()) ? "Nepotvrzeno" : new Intl.DateTimeFormat("cs-CZ",{day:"numeric",month:"numeric",year:"numeric",timeZone:"Europe/Prague"}).format(d); }
function dayNow() { return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date()); }
function currentStatus(item) { return item.deadline && item.deadline < dayNow() && ["open","verify"].includes(item.status) ? "closed" : item.status; }
function isFresh(item) { return !item.needsReview && Date.now() - new Date(item.verifiedAt + "T12:00:00Z").getTime() < 31*86400000; }
function money(value) { return new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:0}).format(value) + " Kč"; }
function range(item) { if (item.confirmedAmount) return money(item.confirmedAmount); if (!item.amount) return "Částku ověřit"; return (item.amount.min/1000).toLocaleString("cs-CZ")+"–"+(item.amount.max/1000).toLocaleString("cs-CZ")+" tis. Kč"; }
function saveState() { try { localStorage.setItem(KEY,JSON.stringify(selected)); return true; } catch { storageOK=false; return false; } }
function toast(message) { $("#toast").textContent=message; $("#toast").classList.add("visible"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$("#toast").classList.remove("visible"),3800); }
function saveItem(id) {
  if (selected[id]) { delete selected[id]; toast("Odebráno z výběru."); }
  else { selected[id]={at:new Date().toISOString(),checks:[]}; toast("Uloženo do výběru. Checklist najdeš v detailu."); }
  if (!saveState()) toast("Prohlížeč nepovolil ukládání. Výběr zůstane jen do zavření stránky; stáhni si plán.");
  renderCards(); renderSaved(); renderSecondary();
}
function card(item) {
 const state = currentStatus(item), saved=Boolean(selected[item.id]);
 return '<article class="card"><div class="card-top"><span class="category"><span class="category-icon" aria-hidden="true">'+e(ICONS[item.category]||"◇")+'</span>'+e(item.category)+'</span><span class="grade" title="Priorita, nikoli pravděpodobnost úspěchu"><b>'+e(item.grade)+'</b>'+item.score+'/100</span></div><div class="tags"><span class="status '+state+'">'+e(STATUS[state])+'</span>'+(item.existing?'<span class="status">Navazuje na zkušenost</span>':"")+(!isFresh(item)?'<span class="status verify">Aktuálnost ověřit</span>':"")+'</div><h3>'+e(item.title)+'</h3><p class="desc">'+e(item.why)+'</p><div class="card-meta"><div class="card-value">'+e(range(item))+'<span class="estimate-label">'+(item.confirmedAmount?"Doloženo klubem · mimo nový potenciál":item.amount?"Pracovní odhad · není příslib":"Nezapočítáno do finančního odhadu")+'</span></div><div class="deadline">'+(item.deadline?'<strong>'+date(item.deadline)+'</strong>'+e(item.deadlineLabel):e(item.effort)+' náročnost')+'</div></div><div class="card-actions"><button class="button outline" data-detail="'+e(item.id)+'">Detail a další krok <span>↗</span></button><button class="save-button '+(saved?"saved":"")+'" data-save="'+e(item.id)+'" aria-pressed="'+saved+'" aria-label="'+(saved?"Odebrat":"Uložit")+': '+e(item.title)+'">'+(saved?"★":"☆")+'</button></div></article>';
}
function filtered() {
 const query=$("#search").value.trim().toLocaleLowerCase("cs");
 return data.opportunities.filter(item=>{
  const state=currentStatus(item);
  const matches=filter==="all" || (filter==="action"&&["open","verify"].includes(state)) || (filter==="watch"&&state==="watch") || (filter==="idea"&&state==="idea") || (filter==="archive"&&["awarded","closed"].includes(state));
  return matches && (!query || [item.title,item.why,item.fact,item.category].join(" ").toLocaleLowerCase("cs").includes(query));
 }).sort((a,b)=>{
  if ($("#sort").value==="deadline") return (a.deadline||"9999").localeCompare(b.deadline||"9999");
  if ($("#sort").value==="newest") return b.firstFound.localeCompare(a.firstFound)||b.score-a.score;
  return Number(["awarded","closed"].includes(currentStatus(a)))-Number(["awarded","closed"].includes(currentStatus(b)))||b.score-a.score;
 });
}
function renderCards() {
 const items=filtered();
 $("#cards").innerHTML=items.length?items.slice(0,shown).map(card).join(""):'<div class="empty">Tomuto hledání neodpovídá žádná karta. Zkus jiné slovo nebo zobrazení Všechny.</div>';
 $("#result-count").textContent=items.length+" možností";
 $("#show-more").hidden=items.length<=shown;
 $("#show-more").textContent="Zobrazit další příležitosti ("+(items.length-shown)+")";
}
function renderSaved() {
 const saved=data.opportunities.filter(item=>selected[item.id]);
 $("#saved").innerHTML=saved.length?saved.map(card).join(""):'<div class="empty">Co vás zaujalo? Otevřete detail a zvolte „Chci tuto příležitost“.<br>Tady vznikne plán dalších kroků.</div>';
 $("#saved-count").textContent=saved.length;
 $("#export").disabled=!saved.length;
}
function renderSecondary() {
 $("#company-cards").innerHTML=data.opportunities.filter(item=>item.category==="Firmy").map(card).join("");
 $("#inspiration-cards").innerHTML=data.opportunities.filter(item=>["Inspirace","Crowdfunding"].includes(item.category)).map(card).join("");
}
function openDetail(id) {
 const item=data.opportunities.find(x=>x.id===id); if(!item)return;
 if(!$("#detail").open)lastFocus=document.activeElement;
 const sources=item.sourceIds.map(sid=>data.sources.find(x=>x.id===sid)).filter(Boolean);
 const checks=selected[id]?.checks||[];
 $("#detail-body").innerHTML='<div class="dialog-content"><div class="dialog-top"><span class="pill">'+e(item.category)+' · priorita '+item.grade+' / '+item.score+'</span><button class="close" data-close aria-label="Zavřít detail">×</button></div><h2>'+e(item.title)+'</h2><span class="status '+currentStatus(item)+'">'+e(STATUS[currentStatus(item)])+'</span><div class="dialog-stats"><span><small>Potenciál</small>'+e(range(item))+'</span><span><small>Náročnost</small>'+e(item.effort)+'</span><span><small>'+e(item.deadlineLabel)+'</small>'+date(item.deadline)+'</span></div>'+(item.amount?'<p class="tiny">'+e(item.amount.note)+' Odhad nebyl spočítán z neveřejného rozpočtu klubu.</p>':"")+(item.amountNote?'<p>'+e(item.amountNote)+'</p>':"")+(!isFresh(item)?'<p class="notice">Zdroj se změnil nebo od ověření uplynulo více než 30 dní. Před rozhodnutím znovu ověř aktuální podmínky.</p>':"")+'<h3>Co je doloženo</h3><p class="fact">'+e(item.fact)+'</p><h3>Proč je to relevantní</h3><p>'+e(item.why)+'</p><h3>Co udělat teď</h3><p>'+e(item.next)+'</p><button class="button" data-save="'+e(id)+'">'+(selected[id]?"Odebrat z mého výběru":"Chci tuto příležitost")+'</button><p class="tiny">Uloží výběr pouze do tohoto prohlížeče. Nic neodesílá.</p><h3>První kroky</h3>'+item.checklist.map((step,index)=>'<label class="check-row"><input type="checkbox" data-check="'+index+'" data-item="'+e(id)+'" '+(checks.includes(index)?"checked":"")+'> <span>'+e(step)+'</span></label>').join("")+'<h3>Původní zdroje</h3><ul>'+sources.map(s=>'<li><a class="source-link text-link" href="'+e(url(s.url))+'" target="_blank" rel="noopener">'+e(s.name)+' ↗</a></li>').join("")+'</ul><h3>Historie a důvěryhodnost</h3><p class="tiny">První nález: '+date(item.firstFound)+' · Poslední kontrola hlavního zdroje: '+date(item.lastChecked)+' · Redakční ověření faktů: '+date(item.verifiedAt)+'. Kontrola dostupnosti nepotvrzuje způsobilost.</p><p class="tiny">'+(item.recurring?"Opakující se program nebo vztah. Další ročník vyžaduje nové ověření.":"Námět nebo jednorázová možnost.")+'</p><ul>'+item.history.slice(-8).map(h=>'<li>'+date(h.date)+' — '+e(h.event)+'</li>').join("")+'</ul></div>';
 if(!$("#detail").open)$("#detail").showModal();
 $("[data-close]").focus();
}
function renderSources() {
 const map=Object.fromEntries(data.sourceChecks.map(s=>[s.sourceId,s]));
 $("#source-count").textContent=data.sources.length;
 $("#sources").innerHTML=data.sources.map(s=>{
  const check=map[s.id];
  return '<div class="source-row"><div><a href="'+e(url(s.url))+'" target="_blank" rel="noopener">'+e(s.name)+' ↗</a><br><small>'+e(s.category)+'</small></div><small class="'+(check?.status==="error"?"error":"")+'">'+(check?check.status==="ok"?"Dostupný · "+date(check.lastSuccess):"Kontrola se nezdařila":"Čeká na první běh")+(check?.status==="error"&&check.lastSuccess?"<br>Poslední úspěch: "+date(check.lastSuccess):"")+'</small></div>';
 }).join("");
 const run=data.lastRun;
 $("#run-status").textContent=run?"Poslední běh "+date(run.at)+": "+run.ok+" z "+run.sources+" zdrojů dostupných, "+run.failed+" vyžaduje kontrolu. Načteno "+run.pages+" stránek. Selhání zdroje neznamená, že nemá nové příležitosti.":"Úvodní rešerše hotová. První automatický běh dosud nepotvrzen.";
 $("#runs").innerHTML=data.runs.length?data.runs.slice().reverse().slice(0,60).map(r=>'<div class="run-row">'+e(new Intl.DateTimeFormat("cs-CZ",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Prague"}).format(new Date(r.at)))+' · '+r.ok+'/'+r.sources+' zdrojů · '+r.pages+' stránek · '+r.failed+' chyb</div>').join(""):'<div class="run-row">Historie vznikne po prvním spuštění.</div>';
}
function renderSignals() {
 $("#signals").innerHTML=data.signals.length?data.signals.slice(0,signalsShown).map(s=>'<article class="signal"><span class="status verify">Automatický podnět · ověřit</span><h4><a href="'+e(url(s.url))+'" target="_blank" rel="noopener">'+e(s.title)+' ↗</a></h4><p>'+e(s.idea)+'</p>'+(s.knownMentions.length?'<small>Možná zmínka známého partnera: '+e(s.knownMentions.join(", "))+' — ověřit kontext.</small>':"")+'<small>'+e(s.note)+' Nalezeno '+date(s.firstFound)+'.</small></article>').join(""):'<div class="empty">Zatím žádné automatické podněty. Připravené příležitosti najdete výše.</div>';
 $("#signals-more").hidden=data.signals.length<=signalsShown;
}
function renderStats() {
 const opened=data.opportunities.filter(i=>currentStatus(i)==="open"&&isFresh(i));
 const estimates=opened.filter(i=>i.amount);
 const minimum=estimates.reduce((sum,i)=>sum+i.amount.min,0),maximum=estimates.reduce((sum,i)=>sum+i.amount.max,0);
 $("#metric-total").textContent=data.opportunities.length;
 $("#nav-count").textContent=data.opportunities.length;
 $("#metric-open").textContent=opened.length;
 $("#metric-deadlines").textContent=data.opportunities.filter(i=>i.deadline&&["open","verify"].includes(currentStatus(i))&&i.deadline>=dayNow()&&(new Date(i.deadline)-new Date(dayNow()))<=45*86400000).length;
 $("#metric-potential").textContent=estimates.length?(minimum/1000)+"–"+(maximum/1000)+" tis. Kč":"K ověření";
 $("#potential-note").textContent=estimates.length?"Odhad vychází z "+estimates.length+" otevřeného projektu s aktuálním redakčním ověřením. Nezahrnuje již získané peníze, příspěvky rodinám, nápady ani neznámé částky. Před souběhem podpor ověřte překryv výdajů.":"Žádný projekt nyní nesplňuje podmínky pro aktuální souhrnný odhad. Historické částky a neověřené nápady se nezapočítávají.";
 const run=data.lastRun;
 $("#freshness").textContent=run?"Poslední běh: "+date(run.at)+" · "+run.ok+"/"+run.sources+" zdrojů dostupných":"Úvodní rešerše: "+date(data.asOf);
 if(run && Date.now()-new Date(run.at).getTime()>48*3600000) $("#freshness").textContent+=" · Data čekají na aktualizaci";
 const hero=opened.find(i=>i.amount)||data.opportunities.find(i=>["open","verify"].includes(currentStatus(i)))||data.opportunities[0];
 if(hero) {
  $("#hero-title").textContent=hero.title;
  $("#hero-description").textContent=hero.next;
  $("#hero-action").dataset.detail=hero.id;
  $("#hero-action").disabled=false;
 }
}
function exportPlan() {
 const items=data.opportunities.filter(i=>selected[i.id]);
 const text=["SPORTFUND RADAR — MŮJ PLÁN","Možnosti pro hokej Vlašim","Export: "+date(new Date().toISOString()),"Pracovní podklad. Odhady nejsou garantované peníze.","",...items.flatMap(i=>[i.title,"Stav: "+STATUS[currentStatus(i)],"Priorita: "+i.grade+" ("+i.score+"/100), nikoli pravděpodobnost","Potenciál: "+range(i)+(i.amount?" — odhad":""),"Fakt: "+i.fact,"Další krok: "+i.next,"Termín: "+date(i.deadline)+" — "+i.deadlineLabel,...i.checklist.map((c,n)=>(selected[i.id].checks?.includes(n)?"[x] ":"[ ] ")+c),...i.sourceIds.map(id=>data.sources.find(s=>s.id===id)?.url||""),""])].join("\n");
 const blob=new Blob(["\uFEFF"+text],{type:"text/plain;charset=utf-8"}),href=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=href;a.download="SportFund-Radar-muj-plan.txt";a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
async function init() {
 try {
  const response=await fetch("./data/radar.json",{cache:"no-cache"});
  if(!response.ok)throw Error("HTTP "+response.status);
  data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.opportunities)||!Array.isArray(data.sources))throw Error("Neplatný formát dat");
  for(const id of Object.keys(selected))if(!data.opportunities.some(i=>i.id===id))delete selected[id];
  $("#partners").innerHTML=data.partners.map(p=>{const s=data.sources.find(s=>s.id===p.sourceId);return '<article class="partner-row"><span class="partner-mark">'+e(p.name.split(" ").slice(0,2).map(w=>w[0]).join(""))+'</span><div><strong>'+e(p.name)+'</strong><small>'+e(p.status)+'</small><small>'+e(p.note)+'</small></div><a href="'+e(url(s.url))+'" target="_blank" rel="noopener" aria-label="Zdroj: '+e(p.name)+'">↗</a></article>';}).join("");
  renderStats();renderCards();renderSaved();renderSecondary();renderSources();renderSignals();
  if(!storageOK)toast("Trvalé ukládání není dostupné. Použij stažení plánu.");
 } catch(error) {
  $("#load-error").hidden=false;$("#load-error").textContent="Data se nepodařilo načíst. Obnov stránku nebo otevři repozitář v patičce.";
  $("#cards").innerHTML='<div class="empty">Přehled je dočasně nedostupný.</div>';
  $("#freshness").textContent="Data se nepodařilo načíst.";
  console.error("Radar data load failed",error);
 }
}
document.addEventListener("click",event=>{
 const button=event.target.closest("button");
 if(button?.dataset.detail)openDetail(button.dataset.detail);
 if(button?.dataset.save){const id=button.dataset.save;const inDialog=$("#detail").contains(button);saveItem(id);if(inDialog)openDetail(id);}
 if(button?.hasAttribute("data-close"))$("#detail").close();
 if(button?.dataset.filter){filter=button.dataset.filter;shown=9;$$("[data-filter]").forEach(b=>{b.classList.toggle("selected",b===button);b.setAttribute("aria-pressed",String(b===button));});if(data)renderCards();}
});
$("#detail").addEventListener("close",()=>{if(lastFocus?.isConnected)lastFocus.focus();});
$("#detail").addEventListener("click",event=>{if(event.target===$("#detail")){const r=$("#detail").getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$("#detail").close();}});
document.addEventListener("change",event=>{
 if(event.target.matches("[data-check]")){
  const id=event.target.dataset.item,index=Number(event.target.dataset.check);
  selected[id]||={at:new Date().toISOString(),checks:[]};
  const checks=new Set(selected[id].checks||[]);event.target.checked?checks.add(index):checks.delete(index);selected[id].checks=[...checks];
  if(!saveState())toast("Checklist je uložen jen pro tuto návštěvu. Stáhni plán.");
  const selectionButton=$("[data-save]",$("#detail"));
  if(selectionButton)selectionButton.textContent="Odebrat z mého výběru";
  renderSaved();renderCards();renderSecondary();
 }
});
$("#search").addEventListener("input",()=>{shown=9;if(data)renderCards();});
$("#sort").addEventListener("change",()=>{if(data)renderCards();});
$("#show-more").addEventListener("click",()=>{shown+=9;renderCards();});
$("#signals-more").addEventListener("click",()=>{signalsShown+=12;renderSignals();});
$("#export").addEventListener("click",exportPlan);
$$(".nav-link").forEach(a=>a.addEventListener("click",()=>{$$(".nav-link").forEach(n=>n.classList.toggle("active",n===a));}));
init();

