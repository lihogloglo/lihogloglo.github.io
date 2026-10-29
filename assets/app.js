const lang = document.documentElement.lang;
const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// "3 days ago" instead of a fixed date, and a colour for how recent it is.
function relativeDates(root) {
  for (const el of root.querySelectorAll('.activity[data-last]')) {
    // calendar days in the viewer's time zone, so last night reads "yesterday"
    const days = Math.round((midnight(new Date()) - midnight(new Date(el.dataset.last))) / 864e5);
    const time = el.querySelector('time');
    if (days < 1) time.textContent = rtf.format(0, 'day');
    else if (days < 14) time.textContent = rtf.format(-days, 'day');
    else if (days < 60) time.textContent = rtf.format(-Math.floor(days / 7), 'week');
    else if (days < 365) time.textContent = rtf.format(-Math.floor(days / 30), 'month');
    else time.textContent = rtf.format(-Math.floor(days / 365), 'year');
    el.classList.add(days <= 3 ? 'hot' : days <= 14 ? 'warm' : days <= 60 ? 'cool' : 'cold');
  }
}

// Clips play only while on screen. With reduced motion, a tap plays them instead.
const io = 'IntersectionObserver' in window && !still
  ? new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.play().catch(() => {});
          else e.target.pause();
        }
      },
      { threshold: 0.4 }
    )
  : null;

function watchVideos(root) {
  for (const v of root.querySelectorAll('video')) {
    if (io) io.observe(v);
    else {
      v.preload = 'metadata';
      v.addEventListener('click', (e) => {
        e.preventDefault();
        v.paused ? v.play() : v.pause();
      });
    }
  }
}

relativeDates(document);
watchVideos(document.querySelector('.grid') ?? document.createElement('div'));

// The project sheet: a card opens it, the URL gets #id (shareable, and the phone's
// back button closes it), × / Escape / a tap outside close it.
const sheet = document.querySelector('dialog.sheet');

if (sheet) {
  const body = sheet.querySelector('.sheet-body');
  let current = null;

  function open(id, push) {
    const tpl = document.getElementById(`detail-${id}`);
    if (!tpl) return;
    body.replaceChildren(tpl.content.cloneNode(true));
    relativeDates(body);
    watchVideos(body);
    current = id;
    if (push) history.pushState({ project: id }, '', `#${id}`);
    sheet.showModal();
    sheet.scrollTop = 0;
  }

  sheet.addEventListener('close', () => {
    for (const v of body.querySelectorAll('video')) io?.unobserve(v);
    body.replaceChildren();
    if (location.hash === `#${current}`) {
      if (history.state?.project === current) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    current = null;
  });

  sheet.querySelector('.close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close();
  });

  for (const a of document.querySelectorAll('a[data-project]')) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      open(a.dataset.project, true);
    });
  }

  addEventListener('popstate', () => {
    const id = location.hash.slice(1);
    if (sheet.open && id !== current) sheet.close();
    if (id && !sheet.open) open(id, false);
  });

  if (location.hash) open(decodeURIComponent(location.hash.slice(1)), false);
}

// Remember the language picked by hand, so the home page stops guessing.
for (const a of document.querySelectorAll('a[data-lang]')) {
  a.addEventListener('click', () => {
    try { localStorage.setItem('lang', a.dataset.lang); } catch {}
    a.href += location.hash;
  });
}
