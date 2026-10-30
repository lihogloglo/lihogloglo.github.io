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
    // the slideshow plays those; on a card, a tap opens the project instead
    if (v.closest('.media.slides') || (!still && v.closest('[data-slides]'))) continue;
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

// Slideshows: a picture stays DWELL ms, a video stays until it has played through once.
// One the visitor picked by hand stays PICKED ms, so they have time to look at it.
const DWELL = 4000;
const PICKED = 8000;

function slideshow(items, show) {
  let i = 0;
  let timer = 0;
  let running = false;
  const video = (k) => items[k].querySelector('video');
  const wrap = (k) => (k + items.length) % items.length;

  function hold(wait = DWELL) {
    clearTimeout(timer);
    const v = video(i);
    if (!v) {
      timer = setTimeout(next, wait);
      return;
    }
    v.currentTime = 0;
    v.onended = next;
    v.play().catch(() => (timer = setTimeout(next, wait))); // autoplay refused: treat it as a picture
  }

  function leave() {
    const v = video(i);
    if (v) v.onended = null;
    v?.pause();
  }

  function next() {
    if (!running) return;
    leave();
    i = wrap(i + 1);
    show(i);
    hold();
  }

  return {
    get index() {
      return i;
    },
    start(from = i, wait) {
      if (running) return;
      running = true;
      i = wrap(from);
      show(i);
      hold(wait);
    },
    stop() {
      running = false;
      clearTimeout(timer);
      leave();
    },
    // show slide k now; if the show is running, it moves on from there after `wait`
    go(k, wait) {
      leave();
      i = wrap(k);
      show(i);
      if (running) hold(wait);
    },
  };
}

// A horizontal drag (finger or mouse) calls step(±1) once it's clearly sideways.
// Returns whether the last press turned into a swipe, so its click can be ignored.
function swipe(el, step) {
  let from = null;
  let swiped = false;
  el.addEventListener('pointerdown', (e) => {
    from = e.isPrimary ? [e.clientX, e.clientY] : null;
    swiped = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!from || !e.buttons) return;
    const dx = e.clientX - from[0];
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(e.clientY - from[1])) return;
    from = null;
    swiped = true;
    step(dx < 0 ? 1 : -1);
  });
  for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, () => (from = null));
  el.addEventListener('dragstart', (e) => e.preventDefault());
  return () => swiped;
}

// Cards: slides cross-fade and move on by themselves while the card is on screen.
// A swipe, an arrow or a dot picks one; a tap anywhere else opens the project.
{
  const shows = new Map();
  const onScreen = !still && 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) e.isIntersecting ? shows.get(e.target).start() : shows.get(e.target).stop();
        },
        { threshold: 0.4 }
      )
    : null;
  for (const el of document.querySelectorAll('.grid [data-slides]')) {
    const slides = [...el.querySelectorAll('.slide')];
    const dots = [...el.querySelectorAll('.dots button')];
    const show = slideshow(slides, (k) => {
      slides.forEach((s, n) => s.classList.toggle('active', n === k));
      dots.forEach((d, n) => d.classList.toggle('active', n === k));
    });
    shows.set(el, show);
    onScreen?.observe(el);

    const swiped = swipe(el, (step) => show.go(show.index + step, PICKED));
    el.addEventListener('click', (e) => {
      if (swiped()) return;
      const b = e.target.closest('button');
      if (!b) el.closest('.card').querySelector('a.open').click();
      else if (b.classList.contains('prev')) show.go(show.index - 1, PICKED);
      else if (b.classList.contains('next')) show.go(show.index + 1, PICKED);
      else show.go(dots.indexOf(b), PICKED);
    });
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
  let show = null;
  let idle = 0;
  let fit = null;

  // The sheet's strip scrolls itself from shot to shot. When the visitor scrolls or
  // taps it, it stops, and picks up again from where they are after a while.
  // The arrows step from shot to shot and keep it going from there.
  function gallery(wrap) {
    const strip = wrap.querySelector('.shots');
    const shots = [...strip.children];
    const centre = (s) => s.getBoundingClientRect().left + s.offsetWidth / 2 - strip.getBoundingClientRect().left;
    let aim = null; // the shot a smooth scroll is heading for, until the visitor scrolls by hand
    show = slideshow(shots, (k) => {
      aim = k;
      strip.scrollTo({ left: strip.scrollLeft + centre(shots[k]) - strip.clientWidth / 2, behavior: 'smooth' });
    });
    const nearest = () => {
      const d = shots.map((s) => Math.abs(centre(s) - strip.clientWidth / 2));
      return d.indexOf(Math.min(...d));
    };
    const takeOver = () => {
      aim = null;
      show.stop();
      clearTimeout(idle);
      if (!still) idle = setTimeout(() => show.start(nearest()), PICKED);
    };
    for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown']) strip.addEventListener(type, takeOver, { passive: true });
    for (const [side, step] of [['.prev', -1], ['.next', 1]])
      wrap.querySelector(side).addEventListener('click', () => {
        const k = (aim ?? nearest()) + step;
        clearTimeout(idle);
        if (still) show.go(k);
        else {
          show.stop();
          show.start(k, PICKED);
        }
      });
    // no arrows when every shot is already in view
    fit = new ResizeObserver(() => wrap.classList.toggle('fits', strip.scrollWidth <= strip.clientWidth + 1));
    fit.observe(strip);
    if (!still) show.start(0);
  }

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
    const wrap = body.querySelector('.gallery');
    if (wrap) gallery(wrap);
  }

  sheet.addEventListener('close', () => {
    show?.stop();
    show = null;
    clearTimeout(idle);
    fit?.disconnect();
    fit = null;
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
