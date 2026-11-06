const projects = {
  movieshub: { name: 'Movieshub', react: true },
  connecthub: { name: 'ConnectHub' },
  shopsphere: { name: 'ShopSphere' },
  sprintboard: { name: 'SprintBoard' },
  gameshub: { name: 'Gameshub' },
};
const site = document.querySelector('#site');
const portfolioTitle = document.title;
const view = document.createElement('section');
view.id = 'projectView';
view.hidden = true;
view.innerHTML = `<header class="app-toolbar"><a href="/#projects" id="portfolioReturn">&#8592; Portfolio</a><strong id="activeProjectName"></strong><span id="appStatus" role="status" aria-live="polite"></span></header><div id="projectStage"></div>`;
document.body.append(view);
const stage = view.querySelector('#projectStage');
const status = view.querySelector('#appStatus');
const styles = document.createElement('style');
styles.textContent = `
.app-toolbar{position:sticky;top:0;z-index:100;height:48px;padding:0 clamp(16px,4vw,64px);display:flex;align-items:center;gap:24px;background:#090a0e;color:#fff;border-bottom:1px solid #ffffff20;font:14px/1.4 system-ui}
.app-toolbar a{color:#fff;font-weight:700}.app-toolbar strong{flex:1}.app-toolbar [role=status]{font-size:12px;color:#b9bbc5}
#projectView{min-height:100dvh;background:#090a0e}#projectView[hidden],.project-host[hidden]{display:none!important}.app-error{padding:60px 24px;max-width:600px;margin:auto}.app-error button{padding:10px 20px;border:0;border-radius:5px;font-weight:700}
.app-loading{position:fixed;inset:auto 20px 20px auto;z-index:250;background:#17191f;color:white;border:1px solid #ffffff30;border-radius:8px;padding:12px 18px;font:14px system-ui}
`;
document.head.append(styles);

let active = null;
let requestId = 0;
let portfolioScroll = 0;
let lastCard = null;
let zoom = null;
const cache = new Map();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const projectOf = url => projects[url.pathname.split('/')[1]] ? url.pathname.split('/')[1] : null;
const scopedCSS = text => text.replace(/@import\s+url\(['"]?['"]?\);?/g, '')
  .replace(/:root\b/g, ':host').replace(/(^|[{}]\s*)body(?=\s*[{,])/g, '$1.project-document');

async function resource(url) {
  // Many smart-TV browsers support AbortController but not AbortSignal.timeout.
  // Keep a bounded wait even on older browsers without cancellation support.
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const response = await Promise.race([
      fetch(url, controller ? { signal: controller.signal } : {}),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new Error('The project took too long to load. Check your connection and try again.'));
        }, 15000);
      }),
    ]);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function scopedDocument(shadow, body) {
  return new Proxy(document, { get(target, key) {
    if (key === 'body') return body;
    if (key === 'activeElement') return shadow.activeElement || target.activeElement;
    if (key === 'querySelector' || key === 'querySelectorAll' || key === 'getElementById') return shadow[key].bind(shadow);
    if (key === 'addEventListener' || key === 'removeEventListener') return shadow[key].bind(shadow);
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

async function prepare(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const promise = (async () => {
    const config = projects[slug];
    let entry, css;
    if (config.react) {
      const manifest = await (await resource('/movieshub/portfolio-entry.json')).json();
      entry = manifest.entry;
      css = manifest.css;
    } else {
      entry = `/${slug}/app.js`;
      css = [`/${slug}/style.css`];
    }
    const [module, sheets] = await Promise.all([
      import(entry), Promise.all(css.map(async url => scopedCSS(await (await resource(url)).text()))),
    ]);
    const host = document.createElement('div');
    host.className = 'project-host'; host.dataset.project = slug; host.hidden = true;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{display:block;font:16px/1.5 system-ui;color:#20232b;background:#fff;color-scheme:normal}.project-document{min-height:calc(100dvh - 48px)}\n${sheets.join('\n')}\n.sidebar{top:48px;height:calc(100dvh - 48px)}.top,.header{top:48px}#root>.App .Navbar{top:0}`;
    shadow.append(style);
    if (config.react) {
      const bootstrap = document.createElement('link');
      bootstrap.rel = 'stylesheet';
      bootstrap.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css';
      shadow.prepend(bootstrap);
    }
    const body = document.createElement('div'); body.className = 'project-document';
    body.innerHTML = config.react ? '<div id="root"></div>' : '<div id="app"></div><div id="toast" role="status"></div>';
    shadow.append(body); stage.append(host);
    return { host, shadow, body, module, instance: null, scroll: 0 };
  })();
  cache.set(slug, promise);
  try { return await promise; } catch (error) { cache.delete(slug); throw error; }
}

function beginZoom(card) {
  if (!card || reducedMotion() || !card.animate) return Promise.resolve();
  const bounds = card.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'project-zoom'; overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, borderRadius: '8px', backgroundImage: getComputedStyle(card.querySelector('.project-screenshot')).backgroundImage });
  overlay.innerHTML = '<div class="project-zoom-shade"></div>';
  document.body.append(overlay); card.classList.add('project-opening');
  zoom = overlay;
  overlay.firstChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' });
  return overlay.animate([
    { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, borderRadius: '8px' },
    { left: '0px', top: '0px', width: `${innerWidth}px`, height: `${innerHeight}px`, borderRadius: '0px' },
  ], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).finished.catch(() => {});
}

function clearZoom() {
  zoom?.remove(); zoom = null;
  document.querySelectorAll('.project-opening').forEach(card => card.classList.remove('project-opening'));
  document.querySelector('.app-loading')?.remove();
}

async function leaveActive() {
  if (!active) return;
  const entry = await cache.get(active);
  entry.scroll = scrollY;
  entry.instance?.deactivate?.();
  // React's router belongs to the current URL; unmount it before showing another app.
  if (projects[active].react) { entry.instance?.destroy(); entry.instance = null; }
  entry.host.hidden = true;
  active = null;
}

async function renderRoute({ card = null, pop = false } = {}) {
  const id = ++requestId;
  const url = new URL(location.href);
  const slug = projectOf(url);
  stage.querySelectorAll('.app-error').forEach(panel => panel.remove());
  if (slug === active && slug) {
    const entry = await cache.get(slug); entry.instance?.route?.(); return;
  }
  if (!active && slug) portfolioScroll = scrollY;
  const animation = beginZoom(card);
  const outgoing = active && !card && !reducedMotion()
    ? (async () => {
      const previous = await cache.get(active);
      await previous.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished.catch(() => {});
    })() : Promise.resolve();
  const loader = document.createElement('div'); loader.className = 'app-loading';
  loader.setAttribute('role', 'status'); loader.textContent = slug ? `Opening ${projects[slug].name}…` : 'Returning to portfolio…';
  if (slug) document.body.append(loader);
  try {
    const entry = slug ? await prepare(slug) : null;
    await Promise.all([animation, outgoing]);
    if (id !== requestId) return;
    await leaveActive();
    if (id !== requestId) return;
    if (!slug) {
      clearZoom(); view.hidden = true; site.classList.remove('hidden'); site.inert = false;
      document.title = portfolioTitle;
      window.scrollTo({ top: portfolioScroll, behavior: 'instant' });
      lastCard?.focus({ preventScroll: true });
      const section = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
      if (!pop && section) section.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
      return;
    }
    document.querySelector('#profiles').classList.add('hidden');
    site.classList.add('hidden'); site.inert = true; view.hidden = false;
    view.querySelector('#activeProjectName').textContent = projects[slug].name;
    document.title = `${projects[slug].name} | ${portfolioTitle.split('|')[0].trim()}`;
    entry.host.hidden = false;
    active = slug;
    if (!entry.instance) {
      entry.instance = projects[slug].react
        ? entry.module.mountProject(entry.shadow.querySelector('#root'))
        : entry.module.mountProject(scopedDocument(entry.shadow, entry.body));
    } else entry.instance.activate?.();
    entry.instance.route?.();
    window.scrollTo({ top: pop ? entry.scroll : 0, behavior: 'instant' });
    status.textContent = '';
    if (!reducedMotion()) entry.host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    if (zoom && !reducedMotion()) await zoom.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.catch(() => {});
    if (id !== requestId) return;
    clearZoom();
    view.querySelector('#portfolioReturn').focus({ preventScroll: true });
  } catch (error) {
    if (id !== requestId) return;
    clearZoom(); await leaveActive();
    site.classList.add('hidden'); view.hidden = false;
    status.textContent = 'Unable to open project';
    const panel = document.createElement('div'); panel.className = 'app-error';
    const title = document.createElement('h2'); title.textContent = 'The project could not load.';
    const message = document.createElement('p'); message.textContent = error.message;
    const retry = document.createElement('button'); retry.textContent = 'Try again';
    retry.onclick = () => { panel.remove(); renderRoute(); };
    panel.append(title, message, retry); stage.append(panel);
  } finally {
    loader.remove();
  }
}

function navigate(url, options) {
  // Render explicitly rather than broadcasting a synthetic browser pop event.
  history.pushState(history.state, '', url);
  renderRoute(options);
}
document.querySelectorAll('.project-card').forEach(card => {
  card.addEventListener('pointerenter', () => { const slug = projectOf(new URL(card.href)); if (slug) prepare(slug).catch(() => {}); }, { once: true });
  card.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (zoom) return;
    lastCard = card; navigate(card.href, { card });
  });
});
view.querySelector('#portfolioReturn').addEventListener('click', event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('/#projects'); });
window.addEventListener('popstate', () => renderRoute({ pop: true }));
window.addEventListener('hashchange', () => { if (active) renderRoute(); });
// React Router owns routes within Movieshub. A location event only changes the shell
// when navigation crosses between projects (ordinary in-project renders stay intact).
document.addEventListener('click', event => {
  const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
  if (!link || !active || event.defaultPrevented || link.target || link.download || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (projectOf(url) !== active) { event.preventDefault(); navigate(url); }
});
history.scrollRestoration = 'manual';
if (projectOf(new URL(location.href))) {
  document.querySelector('#profiles').classList.add('hidden');
  renderRoute();
}
