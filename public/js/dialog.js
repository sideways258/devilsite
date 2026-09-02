import { beatById, CHARS } from './story.js';

// A classic text box: speaker name + typewriter body, advance with Space/Enter/E/click.
const el = {
  root: document.getElementById('dialog'),
  name: document.getElementById('dialog-name'),
  body: document.getElementById('dialog-body'),
  hint: document.getElementById('dialog-hint')
};

let queue = [];          // array of { who, line }
let pageIndex = 0;
let typed = '';
let target = '';
let typeTimer = 0;
let onComplete = null;
let open = false;

export const Dialog = {
  get isOpen() { return open; },

  /** play one or more beats (by id) back to back */
  play(ids, done) {
    const list = Array.isArray(ids) ? ids : [ids];
    const pages = [];
    for (const id of list) {
      const beat = beatById(id);
      if (!beat) continue;
      for (const line of beat.lines) pages.push({ who: beat.who, line });
    }
    if (!pages.length) { if (done) done(); return; }
    queue = pages;
    pageIndex = 0;
    onComplete = done || null;
    open = true;
    el.root.classList.add('is-open');
    showPage();
  },

  advance() {
    if (!open) return;
    if (typed.length < target.length) {
      typed = target;              // fast-forward the typewriter
      render();
      return;
    }
    pageIndex++;
    if (pageIndex >= queue.length) {
      close();
      if (onComplete) onComplete();
      return;
    }
    showPage();
  },

  tick(dt) {
    if (!open) return;
    if (typed.length < target.length) {
      typeTimer += dt;
      const step = 0.018;
      while (typeTimer >= step && typed.length < target.length) {
        typed += target[typed.length];
        typeTimer -= step;
      }
      render();
    }
  }
};

function showPage() {
  const page = queue[pageIndex];
  const ch = CHARS[page.who] || { name: '???', color: '#fff' };
  el.name.textContent = ch.name;
  el.name.style.color = ch.color;
  target = page.line;
  typed = '';
  typeTimer = 0;
  render();
}

function render() {
  el.body.textContent = typed;
  const done = typed.length >= target.length;
  el.hint.textContent = done
    ? (pageIndex >= queue.length - 1 ? 'Space — close' : 'Space — next')
    : 'Space — skip';
  el.hint.style.opacity = done ? '1' : '0.5';
}

function close() {
  open = false;
  queue = [];
  el.root.classList.remove('is-open');
}
