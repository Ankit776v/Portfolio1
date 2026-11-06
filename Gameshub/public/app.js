const BASE = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const image = game => game.image?.startsWith('/gameshub/') ? BASE+game.image.slice('/gameshub'.length) : game.image || `${BASE}/images/library.svg`;

export function mountProject(document) {
  const root = document.getElementById('app');
  root.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)event.target.classList.remove('gh-image-loading')},true);
  root.addEventListener('error',event=>{const img=event.target;if(!(img instanceof HTMLImageElement))return;img.classList.remove('gh-image-loading');if(!img.dataset.fallback){img.dataset.fallback='true';img.classList.add('gh-image-loading');img.src=`${BASE}/images/library.svg`}},true);
  const state = { games: [], game: null, id: null, section: 'world', mode: 'spoiler-free', query: '', genre: 'All', franchise: 'All', platform: 'All', sort: 'year-asc', page: 1, communityBrowse: false, threads: [], loading: false, error: '', dialog: false, replyTo: null };
  let featuredId = 'portal-2';
  let igdbEnabled = false, rawgEnabled = false, enrichmentTimer;
  const prefKey='gameshub-preferences-v2';
  let preferences={lowData:false,language:'en'};
  try{preferences={...preferences,...JSON.parse(localStorage.getItem(prefKey)||'{}')}}catch{}
  const readerKey='gameshub-reader-v1';
  let reader='';try{reader=localStorage.getItem(readerKey)||'';if(!/^[a-zA-Z0-9_-]{20,90}$/.test(reader)){reader=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');localStorage.setItem(readerKey,reader)}}catch{}
  let myLibrary={bookmarks:[],progress:[]};
  let missions=[];let relations=[];
  function savePreferences(){try{localStorage.setItem(prefKey,JSON.stringify(preferences))}catch{}document.body.classList.toggle('gh-low-data',preferences.lowData)}
  savePreferences();
  async function personal(url,options={}){return api(url,{...options,headers:{...options.headers,'X-Gameshub-Reader':reader}})}
  async function refreshPersonal(){if(!reader)return;try{myLibrary=await personal('/me/library');render()}catch{}}
  async function refreshExtras(id,mode){
    const token=sequence;
    const results=await Promise.allSettled([api(`/games/${encodeURIComponent(id)}/missions?mode=${mode}`),api(`/games/${encodeURIComponent(id)}/relationships?mode=${mode}`)]);
    if(token!==sequence)return;
    missions=results[0].status==='fulfilled'?results[0].value.missions:[];
    relations=results[1].status==='fulfilled'?results[1].value.links:[];
    render();
  }
  const covers = new Map(), requested = new Set();
  let sequence = 0, discussionSequence = 0, returnFocus = null;
  async function api(url, options = {}) {
    const response = await fetch(BASE + '/api' + url, { ...options, headers: { 'Content-Type':'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Gameshub could not load.');
    return data;
  }
  const button = (action, label, extra = '', className = '') => `<button type="button" data-action="${action}" ${extra} class="${className}">${label}</button>`;
  const nav = () => `<header class="gh-nav"><a class="gh-brand" href="${BASE}/#" data-action="library"><span class="gh-brand-icon">&#9672;</span>GAMES<span>HUB</span><i> / DISCOVER GAMES</i></a><nav aria-label="Gameshub navigation">${button('library','Discover','',!state.id?'is-current':'')}${button('community','Community') }${button('low-data',preferences.lowData?'Full visuals':'Data saver')}<span class="gh-nav-tag"><b></b> YOUR NEXT ADVENTURE</span></nav></header>`;
  function navigate(id, section = 'world') {
    history.pushState(null, '', `${BASE || ''}/#${id ? new URLSearchParams({ game: id, section }) : ''}`);
    route();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  const PAGE_SIZE=18;
  function filteredGames(){
    const terms=state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return state.games.filter(game=>(state.genre==='All'||game.genre===state.genre)&&(state.franchise==='All'||game.franchise===state.franchise)&&(state.platform==='All'||game.platforms.includes(state.platform))&&terms.every(term=>`${game.title} ${game.genre} ${game.franchise} ${game.subseries} ${game.platforms.join(' ')} ${(game.aliases||[]).join(' ')} ${game.year||''}`.toLowerCase().includes(term))).sort((a,b)=>state.sort==='title'?a.title.localeCompare(b.title):((state.sort==='year-desc'?-1:1)*((a.year||9999)-(b.year||9999))||a.title.localeCompare(b.title)));
  }
  function cards() {
    const filtered=filteredGames();
    state.page=Math.min(state.page,Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)));
    const games=filtered.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);
    return games.length?games.map(game=>`<a class="gh-game-card" href="${BASE}/#game=${game.id}" data-action="game" data-id="${game.id}" style="--game-accent:${game.accent}"><div class="gh-card-art"><img class="gh-image-loading" src="${esc(covers.get(game.id)?.image || image(game))}" alt="${esc(game.title)} artwork" loading="lazy"><span class="gh-card-number">${esc(game.franchise)} / ${game.status==='Upcoming'?'UPCOMING':esc(game.year||'UNDATED')}</span><span class="gh-card-open" aria-hidden="true">&#8599;</span></div><div class="gh-card-info"><div class="gh-card-meta">${esc(game.year||'Year not listed')} <span>${esc(game.genre)}</span>${game.hasDossier?'<span class="gh-guide-tag">STORY GUIDE</span>':''}</div><h3>${esc(game.title)}</h3><p>${esc(game.tagline)}</p><div class="gh-platform-tags">${game.platforms.slice(0,2).map(platform=>`<span>${esc(platform)}</span>`).join('')}${game.platforms.length>2?`<span>+${game.platforms.length-2} platforms</span>`:''}</div><div class="gh-card-bottom"><span>${game.hasDossier?`${game.characters} character profiles`:'Library entry'}</span><span>Explore game &#8594;</span></div></div></a>`).join(''):'<div class="gh-empty"><h3>No games found</h3><p>Try another title, franchise, platform, or genre.</p></div>';
  }
  function pagination(){const total=filteredGames().length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));return `<span id="libraryResultCount" role="status">${total} game${total===1?'':'s'}${total?` / showing ${(state.page-1)*PAGE_SIZE+1} to ${Math.min(state.page*PAGE_SIZE,total)}`:''}</span><div>${button('page','&#8592; Previous',`data-page="${state.page-1}" ${state.page===1?'disabled':''}`)}<span>Page ${state.page} of ${pages}</span>${button('page','Next &#8594;',`data-page="${state.page+1}" ${state.page>=pages?'disabled':''}`)}</div>`}
  function updateLibrary(){document.querySelector('#libraryGrid').innerHTML=cards();document.querySelector('#libraryPagination').innerHTML=pagination();scheduleCovers()}
  function scheduleCovers(){
    clearTimeout(enrichmentTimer);
    if(!rawgEnabled || state.id || preferences.lowData)return;
    enrichmentTimer=setTimeout(async()=>{
      const visible=filteredGames().slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);const featured=state.games.find(g=>g.id===featuredId);const entries=[...new Map([featured,...visible].filter(Boolean).map(g=>[g.id,g])).values()].filter(g=>!requested.has(g.id)).slice(0,18);
      if(!entries.length)return;
      entries.forEach(g=>requested.add(g.id));
      try{const data=await api('/rawg/library?ids='+encodeURIComponent(entries.map(g=>g.id).join(',')));let matched=0;for(const match of data.matches){if(match.game){covers.set(match.localId,match.game);if(match.game.image)matched++}if(match.unavailable)requested.delete(match.localId)}
        for(const card of root.querySelectorAll('.gh-game-card,.gh-feature,.gh-spotlight')){const cover=covers.get(card.dataset.id);if(cover?.image){const img=card.querySelector('img');img.dataset.fallback='';img.classList.add('gh-image-loading');img.src=cover.image}}
        const status=root.querySelector('#rawgStatus');if(status)status.textContent=matched?`RAWG returned artwork for ${matched} game${matched===1?'':'s'}.`:'RAWG responded, but found no unambiguous artwork matches for these titles.';
      }catch(error){entries.forEach(g=>requested.delete(g.id));const status=root.querySelector('#rawgStatus');if(status)status.textContent=`Could not load RAWG artwork: ${error.message}`}
    },350);
  }
  function mediaPanel(){
    if(!rawgEnabled)return '';
    if(preferences.lowData)return '<p>Gameplay images are paused in low-data mode.</p>';
    const media=state.game?.media;
    if(!media)return '<p role="status">'+esc(state.game?.mediaError||'Loading game images...')+'</p>';
    return '<section class="gh-media"><h3>Gameplay screenshots</h3><p>Images may show locations or moments from later in the game.</p><details><summary>Show screenshots</summary><div class="gh-screenshot-grid">'+media.screenshots.map((src,i)=>'<a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(src)+'" alt="'+esc(state.game.title)+' gameplay screenshot '+(i+1)+'" loading="lazy"></a>').join('')+'</div>'+(media.screenshots.length?'':'<p>No screenshots available for this entry.</p>')+'</details><a href="'+esc(media.url)+'" target="_blank" rel="noopener noreferrer">Images supplied by RAWG &#8599;</a></section>';
  }
  async function loadMedia(id,token){
    try{const data=await api('/games/'+encodeURIComponent(id)+'/media');if(token!==sequence)return;state.game.media=data.media;if(data.media){covers.set(id,data.media);const banner=root.querySelector('.gh-game-banner img');if(banner&&data.media.image)banner.src=data.media.image}else state.game.mediaError='No unique RAWG match. You can add a rawgId to this library entry.'}
    catch(error){if(token!==sequence)return;state.game.mediaError=error.message}
    const panel=document.querySelector('#rawgMedia');if(panel)panel.innerHTML=mediaPanel();
  }
  function igdbPanel(){
    const data=state.game?.igdb;
    if(!igdbEnabled)return '';
    if(!data)return '<aside class="gh-igdb"><p>'+esc(state.game?.igdbError||'Looking up IGDB metadata...')+'</p></aside>';
    return '<aside class="gh-igdb"><h3>From IGDB</h3><p>'+esc([data.year,...data.developers,...data.genres].filter(Boolean).join(' / '))+'</p><p>'+esc(data.platforms.join(', '))+'</p><a href="'+esc(data.url)+'" target="_blank" rel="noopener noreferrer">View on IGDB &#8599;</a>'+(state.mode==='deep-dive'?'<h4>Story overview</h4><p>'+esc(data.storyline||data.summary||'No story overview available.')+'</p><p>IGDB overviews may be incomplete; authored full story guides appear above.</p>'+((data.characters||[]).map(c=>'<article><h4>'+esc(c.name)+'</h4><p>'+esc(c.bio)+'</p></article>').join('')):'<p>IGDB plot summaries and character descriptions are available in deep-dive mode.</p>')+'</aside>';
  }
  function libraryTools(){
    const franchises=['All',...new Set(state.games.map(game=>game.franchise))];
    const platforms=[...new Set(state.games.flatMap(game=>game.platforms))].sort((a,b)=>a.localeCompare(b));
    const genres=[...new Set(state.games.map(game=>game.genre))].sort((a,b)=>a.localeCompare(b));
    return `<div class="gh-tools"><div class="gh-filters" role="group" aria-label="Filter games by franchise">${franchises.map(franchise=>button('franchise',esc(franchise),`data-franchise="${esc(franchise)}" aria-pressed="${state.franchise===franchise}"`,state.franchise===franchise?'is-active':'')).join('')}</div><label class="gh-search"><span aria-hidden="true">&#8981;</span><input id="gameSearch" type="search" placeholder="Search games, aliases, or platforms..." aria-label="Search the game library" value="${esc(state.query)}"></label></div><div class="gh-library-selects"><label>Platform<select id="platformFilter"><option value="All">All platforms</option>${platforms.map(platform=>`<option value="${esc(platform)}" ${state.platform===platform?'selected':''}>${esc(platform)}</option>`).join('')}</select></label><label>Genre<select id="genreFilter"><option value="All">All genres</option>${genres.map(genre=>`<option value="${esc(genre)}" ${state.genre===genre?'selected':''}>${esc(genre)}</option>`).join('')}</select></label><label>Sort<select id="gameSort">${[['year-asc','Oldest first'],['year-desc','Newest first'],['title','Title A-Z']].map(([value,label])=>`<option value="${value}" ${state.sort===value?'selected':''}>${label}</option>`).join('')}</select></label>${button('reset-filters','Reset filters','','gh-text-button')}</div><p class="gh-library-note">Historical platforms are listed; availability varies by edition and region. Story guides are marked separately.</p>`;
  }
  function library() {
    const spotlights = ['portal-2','half-life-2','portal','grand-theft-auto-v-2013','super-mario-bros-1985'].map(id=>state.games.find(g=>g.id===id)).filter(Boolean);
    const featured = state.games.find(game => game.id === featuredId) || spotlights[0] || state.games[0];
    return `<main><div class="gh-discover-bar"><span>Discover</span><a href="#library" data-action="explore">Browse</a><button type="button" data-action="community">Community</button><span class="gh-discover-count">${state.games.length} games. Countless stories.</span></div><section class="gh-hero" aria-label="Featured games">${featured ? `<a class="gh-feature" href="${BASE}/#game=${featured.id}" data-action="game" data-id="${featured.id}"><img src="${esc(covers.get(featured.id)?.image || image(featured))}" alt="${esc(featured.title)} artwork"><div class="gh-feature-top"><span>FEATURED GAME</span><span>${esc(featured.franchise)} / ${featured.year}</span></div><div class="gh-feature-bottom"><span class="gh-kicker">DISCOVER THE WORLD BEHIND THE GAME</span><h1>${esc(featured.title)}</h1><p>${esc(featured.hasDossier?featured.tagline:'Explore the game, discover its world, and join the conversation.')}</p><span class="gh-feature-cta">Explore game <span aria-hidden="true">&#8599;</span></span><span class="gh-feature-note">Spoiler-free by default</span></div></a>`:''}<nav class="gh-spotlights" aria-label="Choose a featured game">${spotlights.map(game=>`<button type="button" class="gh-spotlight ${game.id===featured.id?'is-active':''}" data-action="feature" data-id="${game.id}" aria-pressed="${game.id===featured.id}"><img src="${esc(covers.get(game.id)?.image||image(game))}" alt=""><span><small>${esc(game.franchise)}</small>${esc(game.title)}</span></button>`).join('')}</nav></section>
<section class="gh-library" id="library"><div class="gh-section-head"><div><div class="gh-kicker">EXPLORE YOUR NEXT WORLD</div><h2>${state.communityBrowse?'Find your conversation':'The library'}<span>.</span></h2></div><span class="gh-section-note">${state.communityBrowse?'Choose a game to open its discussion board.':'A growing collection of worlds worth exploring.'}</span></div>${libraryTools()}<div class="gh-game-grid" id="libraryGrid">${cards()}</div><nav class="gh-library-pagination" id="libraryPagination" aria-label="Game library pages">${pagination()}</nav></section><section class="gh-reading-guide"><div><div class="gh-kicker">YOU CONTROL THE REVEAL</div><h2>How deep<br>do you want to go?</h2></div><article><span class="gh-mode-icon">&#9671;</span><h3>Spoiler-free</h3><p>The world, the premise, and the people. Get your bearings without giving away the journey.</p><span class="gh-safe-label">THE DEFAULT. ALWAYS.</span></article><article><span class="gh-mode-icon gh-orange">&#9662;</span><h3>Deep dive</h3><p>Every turning point, character revelation, and the ending. Only when you choose to go further.</p><span class="gh-deep-label">MAJOR STORY SPOILERS</span></article></section></main>`;
  }
  function tabs() {
    return `<nav class="gh-dossier-tabs" aria-label="Game dossier sections">${[['world','World & setting'],['history','Game history'],['characters','Characters'],['story','Full story'],['missions','Missions'],['connections','Connections'],['discussion','Discussion']].map(([section,label])=>button('section',label,`data-section="${section}" aria-current="${state.section===section?'page':'false'}"`,state.section===section?'is-active':'')).join('')}</nav>`;
  }
  function renderHistory(game) {
    return `<div class="gh-article-heading"><div class="gh-kicker">BEHIND THE GAME</div><h2>${game.hasDossier?'A place in gaming history.':'Release record.'}</h2><p>${esc(game.history)}</p></div><ol class="gh-timeline">${game.timeline.map(([year,title,description])=>`<li><span class="gh-timeline-year">${esc(year)}</span><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></li>`).join('')}</ol>`;
  }
  function characters(game) {
    if(!game.characters.length)return '<div class="gh-empty"><h3>Character profiles are not written yet.</h3><p>This game is listed with its platforms. Add character biographies to its dossier to expand this section.</p></div>';
    return `<div class="gh-article-heading"><div class="gh-kicker">THE PEOPLE BEHIND THE STORY</div><h2>Meet the cast.</h2><p>${state.mode==='spoiler-free'?'Introductions only. Character revelations stay in deep-dive mode.':'Full profiles, including character revelations and fates.'} This dossier covers ${game.characters.length} notable characters and entities.</p></div><div class="gh-character-grid">${game.characters.map((character,index)=>`<article class="gh-character"><span class="gh-character-avatar" aria-hidden="true">${esc(character.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</span><span class="gh-character-number">${String(index+1).padStart(2,'0')}</span><h3>${esc(character.name)}</h3><span class="gh-character-role">${esc(character.role)}</span><p>${esc(character.bio)}</p></article>`).join('')}</div>`;
  }
  function story(game) {
    if(!game.hasDossier)return '<div class="gh-empty"><h3>The story guide is not written yet.</h3><p>This is a library entry. Its name, platforms, and discussions are available; a full story can be added separately.</p></div>';
    if (state.mode!=='deep-dive') return `<div class="gh-locked"><span aria-hidden="true">&#9672;</span><div class="gh-kicker">THE STORY IS YOURS TO DISCOVER</div><h2>Some things are better<br>experienced first.</h2><p>The full story includes major twists, character fates, and the ending. Switch modes only when you are ready.</p>${button('deep','Enter deep dive &#8599;','','gh-primary')}</div>`;
    return `<div class="gh-article-heading"><div class="gh-kicker gh-deep-label">FULL STORY / SPOILERS AHEAD</div><h2>From the beginning.<br>Through the ending.</h2><p>An original, condensed account of the complete main campaign. This is a story summary, not a walkthrough or transcript.</p></div><div class="gh-story-layout"><nav aria-label="Story chapters">${game.story.map(([title],i)=>`<a href="#chapter-${i}" data-action="chapter" data-index="${i}"><span>${String(i+1).padStart(2,'0')}</span>${esc(title)}</a>`).join('')}</nav><div>${game.story.map(([title,text],i)=>`<article id="chapter-${i}" class="gh-chapter"><span class="gh-kicker">CHAPTER ${String(i+1).padStart(2,'0')}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('')}</div></div>`;
  }
  function missionView(){
    if(state.mode!=='deep-dive')return `<div class="gh-locked"><h2>Missions contain story spoilers.</h2><p>Unlock Deep Dive to browse mission stories.</p>${button('deep','Unlock missions','','gh-primary')}</div>`;
    if(!missions.length)return `<div class="gh-empty"><h2>Mission archive not yet available</h2><p>This game does not have a verified mission-by-mission dataset. Existing story chapters are available in Full story; they are not being mislabeled as missions.</p></div>`;
    return `<div class="gh-article-heading"><h2>Mission archive</h2><p>Follow the narrative mission by mission.</p></div>${missions.map((m,i)=>`<article class="gh-chapter"><span class="gh-kicker">MISSION ${i+1}</span><h3>${esc(m.title)}</h3><p>${esc(m.story)}</p><p><strong>Why it matters:</strong> ${esc(m.consequence||'Not documented')}</p></article>`).join('')}`;
  }
  function connectionsView(game){
    if(state.mode!=='deep-dive')return `<div class="gh-locked"><h2>Cross-game connections may contain spoilers.</h2>${button('deep','Unlock connections','','gh-primary')}</div>`;
    return `<div class="gh-article-heading"><h2>Across the universe</h2><p>Possible recurring characters from the local catalogue. Matching names do not prove identity; relationships need verification.</p></div>${relations.length?relations.map(r=>`<article class="gh-chapter"><h3>${esc(r.character)}</h3><p>Also listed in ${esc(r.gameTitle)}</p>${button('other-game','Explore game',`data-id="${esc(r.gameId)}"`,'gh-secondary')}</article>`).join(''):'<div class="gh-empty"><h3>No cross-game character matches found</h3><p>Automatic matching is limited by available character data.</p></div>'}`;
  }
  function readerTools(game){
    const marked=myLibrary.bookmarks.includes(game.id);
    const progress=myLibrary.progress.find(p=>p.game_id===game.id);
    return `<section class="gh-reader-tools" aria-label="Reader tools"><div>${button('bookmark',marked?'★ Bookmarked':'☆ Bookmark game','','gh-secondary')}${progress&&game.story?.length?button('resume',`Continue chapter ${progress.chapter_index+1}`,'','gh-secondary'):''}${button('narrate','▶ Narrate visible story','','gh-secondary')}${button('stop-narration','■ Stop','','gh-secondary')}</div><label>Story language <select id="ghLanguage"><option value="en" ${preferences.language==='en'?'selected':''}>English</option><option value="hi" ${preferences.language==='hi'?'selected':''}>Hindi (narration only)</option></select></label><p class="gh-muted">Written translations are not yet available. Narration uses the selected device voice when supported.</p></section>`;
  }
  function correctionForm(){return `<details class="gh-correction"><summary>Report a story or source correction</summary><form id="ghCorrection"><label>Section <select name="section">${['world','history','characters','story','missions','sources'].map(s=>`<option value="${s}">${s}</option>`).join('')}</select></label><label>What should be corrected? <textarea name="description" minlength="15" maxlength="2000" required></textarea></label><label>Evidence URL (optional) <input name="sourceUrl" type="url" placeholder="https://..."></label><button class="gh-primary" type="submit">Submit for review</button><p class="gh-feedback" role="status"></p></form></details>`}
  function threadMarkup(thread, reply = false) {
    const date = new Date(thread.created_at.replace(' ','T')+'Z');
    return `<article class="gh-thread${reply?' gh-reply':''}"><div class="gh-thread-heading"><span class="gh-thread-avatar">${esc(thread.author.slice(0,1).toUpperCase())}</span><strong>${esc(thread.author)}</strong><time datetime="${date.toISOString()}">${date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time></div><p>${esc(thread.body)}</p>${reply?'':`${button('reply','Reply',`data-thread="${thread.id}"`,'gh-text-button')}${thread.replies.map(item=>threadMarkup(item,true)).join('')}${state.replyTo===thread.id?postForm(thread.id):''}`}</article>`;
  }
  function postForm(parentId = null) {
    let author='';try{author=localStorage.getItem('gameshub-name')||''}catch{}
    return `<form class="gh-discussion-form" data-parent="${parentId||''}"><label>Your display name<input name="author" minlength="2" maxlength="40" required value="${esc(author)}" placeholder="What should we call you?"></label><label>${parentId?'Your reply':'Start a conversation'}<textarea name="body" minlength="3" maxlength="2000" required rows="4" placeholder="${state.mode==='spoiler-free'?'Talk about the setting, puzzles, or atmosphere. No plot spoilers.':'What moment, character, or interpretation stayed with you?'}"></textarea></label><div class="gh-form-bottom"><span>Posting as a guest. Names are not verified accounts.</span><button class="gh-primary" type="submit">${parentId?'Post reply':'Post discussion'} &#8599;</button></div><p class="gh-feedback" role="status" aria-live="polite"></p></form>`;
  }
  function discussion() {
    return `<div class="gh-article-heading"><div class="gh-kicker">THE CONVERSATION CONTINUES</div><h2>What is your take?</h2><p>${state.mode==='spoiler-free'?'This is the spoiler-free board. Keep twists and endings out of your posts.':'This is the deep-dive board. Discussions here may include the entire story.'} The two boards are separate.</p></div>${postForm()}<div class="gh-discussion-heading"><h3>${state.mode==='spoiler-free'?'Spoiler-free':'Deep-dive'} discussions</h3>${button('refresh-discussion','Refresh','','gh-text-button')}</div><div id="discussionThreads">${state.threads.length?state.threads.map(thread=>threadMarkup(thread)).join(''):'<div class="gh-empty"><span>&#9671;</span><h3>A new conversation starts with you.</h3><p>Ask a question, share a perspective, or talk about the world.</p></div>'}</div>`;
  }
  function dossier() {
    const game=state.game;
    if (!game) return `<main class="gh-dossier"><p role="status">${state.error?esc(state.error):'Opening the archive...'}</p>${state.error?button('retry','Try again','','gh-primary'):''}</main>`;
    const content=state.section==='history'?renderHistory(game):state.section==='characters'?characters(game):state.section==='story'?story(game):state.section==='missions'?missionView():state.section==='connections'?connectionsView(game):state.section==='discussion'?discussion():`<div class="gh-world"><div><div class="gh-kicker">NO TWISTS. JUST YOUR BEARINGS.</div><h2>${game.hasDossier?`Welcome to ${game.id==='half-life-2'?'City 17':'Aperture'}.`:'Game overview.'}</h2><p>${esc(game.setting)}</p><div class="gh-world-actions">${button('section','Meet the characters &#8599;','data-section="characters"','gh-primary')}${button('section','Explore the history','data-section="history"','gh-secondary')}</div></div><aside><span class="gh-kicker">DOSSIER NOTES</span><dl><div><dt>Developer</dt><dd>${esc(game.developer)}</dd></div><div><dt>First released</dt><dd>${esc(game.release)}</dd></div><div><dt>Genre</dt><dd>${esc(game.genre)}</dd></div><div><dt>Franchise</dt><dd>${esc(game.franchise)}</dd></div><div><dt>Status</dt><dd>${esc(game.status)}</dd></div><div><dt>Platforms</dt><dd class="gh-platform-list">${game.platforms.map(platform=>`<span>${esc(platform)}</span>`).join('')}</dd></div><div><dt>Story cast covered</dt><dd>${game.hasDossier?`${game.characters.length} profiles`:'Not written yet'}</dd></div></dl><p>${game.hasDossier?'Choose a character, trace the history, or join the discussion. Story reveals are kept behind deep-dive mode.':'Browse the platforms and join the discussion. A written history, story, and character guide can be added separately.'}</p></aside></div>`;
    return `<main class="gh-dossier"><a class="gh-back" href="${BASE}/#" data-action="library">&#8592; Back to the library</a><section class="gh-game-banner" style="--game-accent:${game.accent}"><img src="${esc(state.game?.media?.image || covers.get(game.id)?.image || image(game))}" alt=""><div><span class="gh-kicker">${esc(game.developer)} / ${game.year} / ${esc(game.genre)}</span><h1>${esc(game.title)}</h1><p>${esc(game.tone)}</p></div></section><div class="gh-modebar"><div><span class="gh-reading-light ${state.mode==='deep-dive'?'is-deep':''}"></span><strong>${state.mode==='spoiler-free'?'You are in spoiler-free territory.':'Deep dive is on. Full story spoilers are visible.'}</strong></div><div role="group" aria-label="Reading mode">${button('safe','&#9671; Spoiler-free',`aria-pressed="${state.mode==='spoiler-free'}"`,state.mode==='spoiler-free'?'is-selected':'')}${button('deep','&#9662; Deep dive',`aria-pressed="${state.mode==='deep-dive'}"`,state.mode==='deep-dive'?'is-selected is-deep':'')}</div></div>${readerTools(game)}${tabs()}<section class="gh-dossier-content" aria-live="polite">${content}<div id="rawgMedia">${mediaPanel()}</div><div id="igdbDetails">${igdbPanel()}</div></section><div class="gh-sources"><span>READ FURTHER</span>${game.sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} &#8599;</a>`).join('')}</div>${correctionForm()}</main>`;
  }
  function render() {
    root.innerHTML=nav()+(state.id?dossier():state.games.length?library():`<main class="gh-loading"><h1>Opening the archive...</h1><p role="status">${esc(state.error||'Loading game dossiers')}</p>${state.error?button('retry-library','Try again','','gh-primary'):''}</main>`)+`<footer class="gh-footer"><span class="gh-brand">&#9672; GAMES<span>HUB</span></span><p>An independent fan archive. Original summaries; game names and artwork belong to their respective owners. <a href="https://rawg.io/" target="_blank" rel="noopener noreferrer">Game images: RAWG</a>. Game details: IGDB.</p><span>STAY CURIOUS. PLAY FIRST.</span></footer>`;
    if(!state.id&&root.querySelector('#libraryGrid')){const status=document.createElement('p');status.className='gh-library-note';status.id='rawgStatus';status.setAttribute('role','status');status.textContent=preferences.lowData?'Data saver is on; external game images are paused.':rawgEnabled?'Loading game artwork from RAWG…':'RAWG images are not configured on this server.';root.querySelector('#libraryGrid').before(status)}
    scheduleCovers();
  }
  async function loadGame(id, mode) {
    const token=++sequence;state.game=null;state.error='';state.threads=[];state.replyTo=null;missions=[];relations=[];render();
    try{const game=await api(`/games/${encodeURIComponent(id)}?mode=${mode}`);if(token!==sequence)return;state.game=game;render();refreshExtras(id,mode);if(igdbEnabled)loadIGDB(id,mode,token);if(rawgEnabled&&!preferences.lowData)loadMedia(id,token);if(state.section==='discussion')loadDiscussion()}catch(error){if(token===sequence){state.error=error.message;render()}}
  }
  async function loadIGDB(id,mode,token){
    try{const data=await api('/games/'+encodeURIComponent(id)+'/igdb?mode='+mode);if(token!==sequence)return;state.game.igdb=data.game;if(!data.game)state.game.igdbError='No unambiguous IGDB match. Add an igdbId in mlist.jsx to link this entry.';
    }catch(error){if(token!==sequence)return;state.game.igdbError=error.message}
    const panel=document.querySelector('#igdbDetails');if(panel)panel.innerHTML=igdbPanel();
  }
  async function loadDiscussion() {
    const token=++discussionSequence,scope=`${state.id}:${state.mode}`;
    try{const data=await api(`/games/${state.id}/discussions?mode=${state.mode}`);if(token!==discussionSequence||scope!==`${state.id}:${state.mode}`)return;state.threads=data.threads;if(state.section==='discussion'){const container=document.querySelector('#discussionThreads');if(container)container.innerHTML=data.threads.length?data.threads.map(t=>threadMarkup(t)).join(''):'<div class="gh-empty"><h3>Be the first to start a conversation.</h3><p>Share a question or a perspective on this game.</p></div>'}}catch(error){const container=document.querySelector('#discussionThreads');if(container)container.textContent=error.message}
  }
  function route() {
    const params=new URLSearchParams(location.hash.slice(1));const id=params.get('game');const section=params.get('section')||'world';
    state.section=['world','history','characters','story','missions','connections','discussion'].includes(section)?section:'world';
    if(id!==state.id){state.id=id;state.mode='spoiler-free';state.game=null;state.threads=[];sequence++;closeDialog();if(id)loadGame(id,'spoiler-free');else render()}
    else{render();if(id&&state.section==='discussion'&&state.game)loadDiscussion()}
  }
  function closeDialog(){document.querySelector('.gh-dialog-backdrop')?.remove();state.dialog=false;returnFocus?.focus();returnFocus=null}
  function openDeep(){
    if(state.mode==='deep-dive')return;
    returnFocus=document.activeElement;state.dialog=true;
    const element=document.createElement('div');element.className='gh-dialog-backdrop';element.innerHTML=`<section class="gh-dialog" role="dialog" aria-modal="true" aria-labelledby="ghSpoilerTitle"><span class="gh-deep-label">SPOILER CHECKPOINT</span><h2 id="ghSpoilerTitle">Ready for the whole story?</h2><p>Deep dive reveals major plot events, character fates, and the ending of ${esc(state.game?.title||'this game')}. The discussion board will also include spoilers.</p><div>${button('cancel-deep','Stay spoiler-free','','gh-secondary')}${button('confirm-deep','Reveal the story &#8599;','','gh-primary')}</div></section>`;document.body.append(element);element.querySelector('button').focus();
  }
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-action]');if(!target)return;if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();
    const action=target.dataset.action;
    if(action==='library'){state.communityBrowse=false;navigate(null);}
    if(action==='feature'){featuredId=target.dataset.id;render();root.querySelector('.gh-spotlight.is-active')?.focus({preventScroll:true})}
    if(action==='game')navigate(target.dataset.id,state.communityBrowse?'discussion':'world');
    if(action==='explore')document.querySelector('#library')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    if(action==='community'){if(state.id)navigate(state.id,'discussion');else{state.communityBrowse=true;render();document.querySelector('#library')?.scrollIntoView({behavior:'smooth'});document.querySelector('#library h2')?.setAttribute('tabindex','-1');document.querySelector('#library h2')?.focus({preventScroll:true})}}
    if(action==='franchise'){state.franchise=target.dataset.franchise;state.page=1;render()}
    if(action==='page'){state.page=Number(target.dataset.page);updateLibrary();document.querySelector('#libraryGrid').scrollIntoView({block:'start',behavior:'auto'})}
    if(action==='reset-filters'){state.query='';state.platform='All';state.franchise='All';state.genre='All';state.page=1;render()}
    if(action==='section')navigate(state.id,target.dataset.section);
    if(action==='other-game')navigate(target.dataset.id,'world');
    if(action==='low-data'){preferences.lowData=!preferences.lowData;savePreferences();render()}
    if(action==='bookmark'&&reader){const marked=myLibrary.bookmarks.includes(state.id);personal('/me/bookmarks/'+encodeURIComponent(state.id),{method:marked?'DELETE':'PUT'}).then(refreshPersonal).catch(e=>alert(e.message))}
    if(action==='resume'){const p=myLibrary.progress.find(p=>p.game_id===state.id);if(p){navigate(state.id,'story');if(state.mode!=='deep-dive')openDeep();else requestAnimationFrame(()=>document.getElementById('chapter-'+p.chapter_index)?.scrollIntoView())}}
    if(action==='narrate'){if(!('speechSynthesis' in window))return alert('Narration is not supported by this browser.');speechSynthesis.cancel();const content=document.querySelector('.gh-dossier-content');const utterance=new SpeechSynthesisUtterance(content?.innerText?.slice(0,20000)||'');utterance.lang=preferences.language==='hi'?'hi-IN':'en-US';speechSynthesis.speak(utterance)}
    if(action==='stop-narration'&&'speechSynthesis' in window)window.speechSynthesis.cancel();
    if(action==='deep')openDeep();
    if(action==='safe'&&state.mode!=='spoiler-free'){state.mode='spoiler-free';loadGame(state.id,state.mode)}
    if(action==='reply'){state.replyTo=Number(target.dataset.thread);render();document.querySelector(`form[data-parent="${state.replyTo}"] textarea`)?.focus()}
    if(action==='refresh-discussion')loadDiscussion();
    if(action==='retry')loadGame(state.id,state.mode);
    if(action==='retry-library')loadLibrary();
    if(action==='chapter'){document.getElementById(`chapter-${target.dataset.index}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(reader&&state.mode==='deep-dive')personal('/me/progress/'+encodeURIComponent(state.id),{method:'PUT',body:JSON.stringify({chapterIndex:Number(target.dataset.index)})}).then(refreshPersonal).catch(()=>{})}
  });
  // Dialogs live alongside the mounted app so their event scope stays isolated too.
  document.body.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action==='cancel-deep')closeDialog();if(action==='confirm-deep'){closeDialog();state.mode='deep-dive';if(state.section==='world'){state.section='story';history.replaceState(null,'',`${BASE}/#${new URLSearchParams({game:state.id,section:'story'})}`)}loadGame(state.id,state.mode)}});
  document.body.addEventListener('keydown',event=>{if(!state.dialog)return;const dialog=document.querySelector('.gh-dialog');if(event.key==='Escape'){event.preventDefault();closeDialog()}if(event.key==='Tab'){const controls=[...dialog.querySelectorAll('button')];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus()}else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus()}}});
  root.addEventListener('input',event=>{if(event.target.id==='gameSearch'){state.query=event.target.value;state.page=1;updateLibrary()}});
  root.addEventListener('change',event=>{if(event.target.id==='ghLanguage'){preferences.language=event.target.value;savePreferences()} const key={platformFilter:'platform',genreFilter:'genre',gameSort:'sort'}[event.target.id];if(key){state[key]=event.target.value;state.page=1;updateLibrary()}});
  root.addEventListener('submit',async event=>{
    if(event.target.id==='ghCorrection'){
      event.preventDefault();const form=event.target,feedback=form.querySelector('.gh-feedback');const values=Object.fromEntries(new FormData(form));feedback.textContent='Submitting...';
      try{await api('/games/'+encodeURIComponent(state.id)+'/corrections',{method:'POST',body:JSON.stringify(values)});feedback.textContent='Correction received for review.';form.reset()}catch(e){feedback.textContent=e.message}return;
    }
    if(!event.target.matches('.gh-discussion-form'))return;event.preventDefault();const form=event.target;const data=Object.fromEntries(new FormData(form));const submit=form.querySelector('[type=submit]'),feedback=form.querySelector('.gh-feedback');submit.disabled=true;feedback.textContent='Posting...';
    const id=state.id,mode=state.mode;
    try{await api(`/games/${id}/discussions`,{method:'POST',body:JSON.stringify({author:data.author,body:data.body,mode,parentId:form.dataset.parent?Number(form.dataset.parent):null})});try{localStorage.setItem('gameshub-name',data.author)}catch{}if(id!==state.id||mode!==state.mode)return;state.replyTo=null;render();await loadDiscussion();document.querySelector('.gh-discussion-form .gh-feedback').textContent='Your message has been posted.'}catch(error){feedback.textContent=error.message;submit.disabled=false}
  });
  let metadataGeneration=0;
  async function hydrateMetadata(){
    const generation=++metadataGeneration;
    for(let offset=0;offset<state.games.length;offset+=18){
      if(generation!==metadataGeneration)return;
      try{const data=await api('/metadata?ids='+encodeURIComponent(state.games.slice(offset,offset+18).map(g=>g.id).join(',')));
        if(generation!==metadataGeneration)return;
        for(const game of data.games){const index=state.games.findIndex(g=>g.id===game.id);if(index>=0)state.games[index]=game}
        if(!state.id&&document.querySelector('#libraryGrid')){
          const focus=document.activeElement;if(!focus?.closest('.gh-game-card'))updateLibrary();
          for(const [id,values,current,label] of [['platformFilter',[...new Set(state.games.flatMap(g=>g.platforms))],state.platform,'All platforms'],['genreFilter',[...new Set(state.games.map(g=>g.genre))],state.genre,'All genres']]){
            const select=document.getElementById(id);if(select&&focus!==select){select.innerHTML='<option value="All">'+label+'</option>'+values.sort().map(value=>'<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(value)+'</option>').join('')}
          }
        }
      }catch{/* Keep the editable library usable while the provider is unavailable. */}
    }
  }
  async function loadLibrary(){try{const data=await api('/games');state.games=data.games;igdbEnabled=Boolean(data.igdb?.configured);rawgEnabled=Boolean(data.rawg?.configured);state.error='';route();if(igdbEnabled)hydrateMetadata()}catch(error){state.error=error.message;render()}}
  render();loadLibrary();refreshPersonal();
  return {route,deactivate(){closeDialog()},destroy(){metadataGeneration++;clearTimeout(enrichmentTimer);sequence++;discussionSequence++;closeDialog()}};
}
if(!document.documentElement.hasAttribute('data-portfolio-spa')){
  const project=mountProject(document);window.addEventListener('popstate',project.route);window.addEventListener('hashchange',project.route);
}
