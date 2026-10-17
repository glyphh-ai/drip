// The console: Glyphh Drip's launcher, a page the overlay shows over Claude's
// window like a game. Games and Drips tabs, a featured banner, a search, a
// grid of covers eight to a page; arrows, Tab, /, Enter and Esc, or the
// mouse. It launches nothing itself: it asks the mod ({__drip_ask__: text},
// heard by the overlay as an ask event) and closes, and the mod plays it.
//   launch game <name> · launch drip <name> · unlock
import { CLOSE_SIGNAL, GAME_SOUND } from '../arcade/games/shared.ts'

/** One tile: a game or a drip, as the console shows it. */
export type Item = {
  kind: 'game' | 'drip'
  name: string
  title: string
  about?: string
  /** "Best 1,200" for a game played; empty otherwise. */
  best?: string
  /** A cover image (data: URI), else `icon` on the tile. */
  cover?: string
  /** An SVG icon (markup) for an item without a cover. */
  icon?: string
  /** Not bought, and not free: Enter asks to unlock. */
  isLocked: boolean
  isYours: boolean
}

export type ConsoleData = {
  games: Item[]
  drips: Item[]
  /** The item each tab's banner features, by name; none, the first. */
  featured: { game?: string; drip?: string }
  isBought: boolean
  price: string
  /** The logo: the Mohawk cat and "drip" (data: URIs). */
  logo: { cat: string; word: string }
  /** The tab it opens on. */
  tab: 'games' | 'drips'
  /** Sounds off: the console's ticks are silent. */
  quiet: boolean
}

/** Covers to a page: two rows of four. */
export const PAGE = 8

/** Text and attributes as the page writes them. */
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%;background:transparent;overflow:hidden}
body{font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;color:#f4f2f8;display:flex;align-items:center;justify-content:center;-webkit-user-select:none;user-select:none}
.scrim{position:fixed;inset:0;background:rgba(8,6,12,.72)}
.console{position:relative;width:min(1280px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:hidden;border-radius:20px;background:radial-gradient(1100px 600px at 50% 0%,rgba(147,51,234,.25),transparent 60%),#0d0b13;padding:0 clamp(20px,3.5vw,48px) 28px;box-shadow:0 40px 120px rgba(0,0,0,.6);display:flex;flex-direction:column}
.top{height:88px;display:flex;align-items:center;gap:28px;flex:none}
.logo{display:flex;align-items:center;gap:12px}.logo .cat{height:56px}.logo .word{height:32px}
.tabs{display:flex;gap:8px;background:rgba(255,255,255,.06);padding:6px;border-radius:999px;margin:0 auto}
.tab{padding:10px 22px;border-radius:999px;font-size:16px;font-weight:600;color:#a9a4b6;cursor:pointer;border:0;background:none;font-family:inherit}.tab.on{background:#fff;color:#141318}
.key{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:26px;padding:0 8px;border-radius:7px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);font-size:13px;font-weight:600;color:#e9e6f0}
.esc{display:flex;align-items:center;gap:10px;font-size:14px;color:#a9a4b6;cursor:pointer;background:none;border:0;font-family:inherit}
.body{overflow:auto;flex:1;min-height:0;padding-bottom:4px}
.banner{height:clamp(200px,30vh,300px);border-radius:24px;overflow:hidden;margin:8px 0 28px;display:flex;cursor:pointer}
.banner .art{width:62%;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center}
.banner .art svg{width:40%;height:auto}
.banner .txt{flex:1;padding:clamp(20px,3vw,40px) clamp(20px,3vw,44px);display:flex;flex-direction:column;justify-content:center}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px;opacity:.85}
.banner h1{font-size:clamp(28px,3vw,44px);margin:0 0 8px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
.banner p{font-size:17px;margin:0 0 22px;opacity:.9}
.cta{display:inline-flex;align-items:center;gap:12px;background:#fff;color:#141318;font-size:18px;font-weight:700;padding:12px 22px;border-radius:12px;align-self:flex-start}
.cta .key{background:#141318;color:#fff;border:0}
.bar{display:flex;align-items:center;gap:16px;margin:0 0 18px}
.bar .h{font-size:20px;font-weight:700}.bar .n{font-size:14px;color:#8e89a0}
.search{margin-left:auto;display:flex;align-items:center;gap:10px;width:min(340px,40%);height:42px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);padding:0 12px}
.search input{flex:1;min-width:0;background:none;border:0;outline:0;color:#f4f2f8;font-size:15px;font-family:inherit}
.search input::placeholder{color:#8e89a0}
.search.on{border-color:#c79bff}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(12px,1.6vw,22px)}
.c{border-radius:16px;overflow:hidden;background:#1a1722;position:relative;cursor:pointer;outline:0}
.c .art{aspect-ratio:16/10;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center}
.c .art svg{width:34%;height:auto}
.c .meta{padding:11px 14px 13px;display:flex;align-items:baseline;gap:8px;min-width:0}
.c .t{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c .s{font-size:13px;color:#a9a4b6;margin-left:auto;white-space:nowrap}
.c.sel{box-shadow:0 0 0 3px #fff,0 18px 40px rgba(0,0,0,.5)}
.c.locked .art{filter:saturate(.55) brightness(.75)}
.c .lock{position:absolute;top:10px;right:10px;background:rgba(10,8,16,.75);border-radius:8px;width:30px;height:28px;display:flex;align-items:center;justify-content:center}
.yours{font-size:12px;color:#c79bff;font-weight:700}
.empty{padding:40px 0;text-align:center;color:#8e89a0;font-size:16px}
.pages{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:20px;font-size:14px;color:#a9a4b6}
.pages button{width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#e9e6f0;font-size:16px;border:0;cursor:pointer;font-family:inherit}
.pages button:disabled{opacity:.35;cursor:default}
.dots{display:flex;gap:7px}.dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.25);display:block;cursor:pointer}.dots i.on{background:#fff;width:22px;border-radius:5px}
.foot{margin-top:18px;display:flex;flex-wrap:wrap;gap:22px;font-size:14px;color:#a9a4b6;align-items:center;flex:none}.foot b{color:#d9d5e2;font-weight:600}
`

const LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
const MAG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e89a0" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg>'

/** The banner's colours, by the featured item's kind or the unlock. */
const BANNERS = {
  game: ['linear-gradient(120deg,#2f7d3a,#1a4d22)', '#d9f99d'],
  drip: ['linear-gradient(120deg,#0f766e,#0b3d3a)', '#99f6e4'],
  unlock: ['linear-gradient(120deg,#7c3aed,#db2777)', '#fbcfe8'],
} as const

/** The console's whole page for `d`. The data goes in as JSON; the script draws from it. */
export function consoleHtml(d: ConsoleData): string {
  const data = JSON.stringify({ ...d, LOCK, BANNERS, PAGE }).replace(/</g, '\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="scrim"></div>
<div class="console" role="dialog" aria-label="Glyphh Drip">
  <div class="top">
    <div class="logo"><img class="cat" alt="" src="${esc(d.logo.cat)}"><img class="word" alt="drip" src="${esc(d.logo.word)}"></div>
    <div class="tabs" id="tabs"><button class="tab" data-tab="games">Games</button><button class="tab" data-tab="drips">Drips</button></div>
    <button class="esc" id="close"><span class="key">esc</span>Back to Claude</button>
  </div>
  <div class="body">
    <div id="banner"></div>
    <div class="bar"><span class="h" id="h"></span><span class="n" id="n"></span>
      <label class="search" id="search">${MAG}<input id="q" type="text" autocomplete="off" spellcheck="false"><span class="key">/</span></label></div>
    <div class="grid" id="grid"></div>
    <div class="pages" id="pages"></div>
  </div>
  <div class="foot"><span><span class="key">←</span> <span class="key">→</span> <span class="key">↑</span> <span class="key">↓</span> <b>Move</b></span><span><span class="key">/</span> <b>Search</b></span><span><span class="key">tab</span> <b>Section</b></span><span><span class="key">enter</span> <b>Play</b></span><span><span class="key">esc</span> <b>Close</b></span></div>
</div>
<script>window.__dripsQuiet=${d.quiet ? 'true' : 'false'};${GAME_SOUND}</script>
<script>
var D=${data};
var S={tab:D.tab,q:'',page:0,sel:0,inSearch:false};
var $=function(id){return document.getElementById(id)};
function tick(){try{sfx.tone(880,0.04,"square",0.04)}catch(e){}}
function boop(){try{sfx.notes([[660,0.06,0],[990,0.08,0.06]],"square",0.06)}catch(e){}}
function ask(text){try{window.postMessage({__drip_ask__:text},"*")}catch(e){}boop();setTimeout(function(){${CLOSE_SIGNAL}},120)}
function close(){${CLOSE_SIGNAL}}
function items(){var all=S.tab==='games'?D.games:D.drips;var q=S.q.trim().toLowerCase();return q?all.filter(function(i){return i.title.toLowerCase().indexOf(q)>=0||i.name.indexOf(q)>=0}):all}
function pages(){return Math.max(1,Math.ceil(items().length/D.PAGE))}
function art(i,big){if(i.cover)return '<div class="art" style="background-image:url('+i.cover+')"></div>';return '<div class="art" style="background:linear-gradient(120deg,#7c3aed,#db2777)">'+(i.icon||'')+'</div>'}
function h(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function activate(i){if(!i)return;if(i.isLocked)return ask('unlock');ask('launch '+i.kind+' '+i.name)}
function banner(){
  var all=S.tab==='games'?D.games:D.drips;
  if(!D.isBought&&S.tab==='games'){var b=D.BANNERS.unlock,f=all.filter(function(i){return i.cover})[1]||all[0];
    return '<div class="banner" id="feat" data-unlock="1">'+(f?art(f):'')+'<div class="txt" style="background:'+b[0]+'"><div class="eyebrow" style="color:'+b[1]+'">Glyphh Drip</div><h1>Unlock every game</h1><p>Missiles and every drip are free. '+h(D.price)+' once unlocks every other game, and every new one.</p><div class="cta"><span class="key">enter</span>Unlock · '+h(D.price)+'</div></div></div>'}
  var want=S.tab==='games'?D.featured.game:D.featured.drip;var f=all.filter(function(i){return i.name===want})[0]||all[0];if(!f)return '';
  var b=D.BANNERS[f.kind];
  return '<div class="banner" id="feat">'+art(f)+'<div class="txt" style="background:'+b[0]+'"><div class="eyebrow" style="color:'+b[1]+'">Featured</div><h1>'+h(f.title)+'</h1><p>'+h(f.about||(f.kind==='game'?'Play it while Claude works.':'Play it over Claude.'))+'</p><div class="cta"><span class="key">enter</span>'+(f.isLocked?'Unlock · '+h(D.price):'Play')+'</div></div></div>'}
function draw(){
  var list=items(),n=pages();if(S.page>=n)S.page=n-1;if(S.page<0)S.page=0;
  var shown=list.slice(S.page*D.PAGE,(S.page+1)*D.PAGE);if(S.sel>=shown.length)S.sel=Math.max(0,shown.length-1);
  [].forEach.call(document.querySelectorAll('.tab'),function(t){t.className='tab'+(t.getAttribute('data-tab')===S.tab?' on':'')});
  $('banner').innerHTML=banner();
  var feat=$('feat');if(feat)feat.onclick=function(){if(feat.getAttribute('data-unlock'))return ask('unlock');var all=S.tab==='games'?D.games:D.drips;var want=S.tab==='games'?D.featured.game:D.featured.drip;activate(all.filter(function(i){return i.name===want})[0]||all[0])};
  var total=(S.tab==='games'?D.games:D.drips),yours=total.filter(function(i){return i.isYours}).length;
  $('h').textContent=S.tab==='games'?'All games':'All drips';
  $('n').textContent=(S.q?list.length+' of ':'')+total.length+(S.tab==='games'?' games':' drips')+(yours?' · '+yours+' yours':'');
  $('q').placeholder=S.tab==='games'?'Search games':'Search drips';
  $('search').className='search'+(S.inSearch?' on':'');
  $('grid').innerHTML=shown.length?shown.map(function(i,k){return '<div class="c'+(k===S.sel&&!S.inSearch?' sel':'')+(i.isLocked?' locked':'')+'" data-k="'+k+'">'+art(i)+(i.isLocked?'<div class="lock">'+D.LOCK+'</div>':'')+'<div class="meta"><span class="t">'+h(i.title)+'</span>'+(i.isYours?'<span class="yours">yours</span>':'')+'<span class="s">'+h(i.best||'')+'</span></div></div>'}).join(''):'<div class="empty" style="grid-column:1/-1">Nothing matches “'+h(S.q)+'”.</div>';
  [].forEach.call(document.querySelectorAll('.c'),function(el){el.onclick=function(){S.sel=+el.getAttribute('data-k');S.inSearch=false;$('q').blur();activate(shown[S.sel])};el.onmouseenter=function(){if(S.sel!==+el.getAttribute('data-k')){S.sel=+el.getAttribute('data-k');draw()}}});
  var dots='';for(var p=0;p<n;p++)dots+='<i data-p="'+p+'" class="'+(p===S.page?'on':'')+'"></i>';
  $('pages').innerHTML=n>1?'<button id="prev" aria-label="Previous page"'+(S.page===0?' disabled':'')+'>‹</button><div class="dots">'+dots+'</div><span>'+(S.page+1)+' of '+n+'</span><button id="next" aria-label="Next page"'+(S.page===n-1?' disabled':'')+'>›</button>':'';
  if(n>1){$('prev').onclick=function(){turn(-1)};$('next').onclick=function(){turn(1)};[].forEach.call(document.querySelectorAll('.dots i'),function(el){el.onclick=function(){S.page=+el.getAttribute('data-p');S.sel=0;tick();draw()}})}
}
function turn(by){var n=pages(),p=Math.max(0,Math.min(n-1,S.page+by));if(p!==S.page){S.page=p;S.sel=by>0?0:D.PAGE-1;tick();draw()}}
function tab(t){if(t!==S.tab){S.tab=t;S.page=0;S.sel=0;S.q='';$('q').value='';tick();draw()}}
function move(dx,dy){var shown=items().slice(S.page*D.PAGE,(S.page+1)*D.PAGE);if(!shown.length)return;var col=S.sel%4,row=Math.floor(S.sel/4),rows=Math.ceil(shown.length/4);
  if(dx){var nc=col+dx;if(nc<0||(nc>3)||row*4+nc>=shown.length){if(dx>0&&S.page<pages()-1){S.page++;S.sel=row*4;draw();tick();return}if(dx<0&&S.page>0){S.page--;S.sel=row*4+3;draw();tick();return}return}S.sel=row*4+nc}
  if(dy){var nr=row+dy;if(nr<0){S.inSearch=true;$('q').focus();draw();return}if(nr>=rows)return;S.sel=Math.min(nr*4+col,shown.length-1)}
  tick();draw()}
[].forEach.call(document.querySelectorAll('.tab'),function(t){t.onclick=function(){tab(t.getAttribute('data-tab'))}});
$('close').onclick=close;
$('q').oninput=function(){S.q=$('q').value;S.page=0;S.sel=0;draw()};
$('q').onfocus=function(){S.inSearch=true;draw()};
document.addEventListener('keydown',function(e){
  var k=e.key;
  if(S.inSearch){if(k==='Escape'){e.preventDefault();if(S.q){S.q='';$('q').value='';draw()}else{S.inSearch=false;$('q').blur();draw()}}else if(k==='ArrowDown'||k==='Enter'){e.preventDefault();S.inSearch=false;$('q').blur();S.sel=0;draw();if(k==='Enter'){var s=items().slice(S.page*D.PAGE)[0];if(s&&items().length===1)activate(s)}}return}
  if(k==='Escape'){e.preventDefault();close()}
  else if(k==='Tab'){e.preventDefault();tab(S.tab==='games'?'drips':'games')}
  else if(k==='/'){e.preventDefault();S.inSearch=true;$('q').focus();draw()}
  else if(k==='ArrowRight'){e.preventDefault();move(1,0)}else if(k==='ArrowLeft'){e.preventDefault();move(-1,0)}
  else if(k==='ArrowDown'){e.preventDefault();move(0,1)}else if(k==='ArrowUp'){e.preventDefault();move(0,-1)}
  else if(k==='PageDown'){turn(1)}else if(k==='PageUp'){turn(-1)}
  else if(k==='Enter'||k===' '){e.preventDefault();activate(items().slice(S.page*D.PAGE,(S.page+1)*D.PAGE)[S.sel])}
},true);
draw();
</script></body></html>`
}
