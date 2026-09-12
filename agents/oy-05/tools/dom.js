/* Tiny DOM good enough for the markup geolive-student.js emits. */
const VOID = new Set(['input', 'br', 'img', 'hr']);

class El {
  constructor(tag, attrs) {
    this.tagName = (tag || 'div').toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.parent = null;
    this.text = '';
    this.style = {};
    this.listeners = {};
    this.value = this.attrs.value || '';
    this.disabled = 'disabled' in this.attrs;
  }
  get className() { return this.attrs.class || ''; }
  get classes() { return this.className.split(/\s+/).filter(Boolean); }
  getAttribute(n) { return this.attrs[n] === undefined ? null : this.attrs[n]; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  get classList() {
    const self = this;
    return {
      add(...c) { const set = new Set(self.classes); c.forEach(x => set.add(x)); self.attrs.class = [...set].join(' '); },
      remove(...c) { const set = new Set(self.classes); c.forEach(x => set.delete(x)); self.attrs.class = [...set].join(' '); },
      contains(c) { return self.classes.includes(c); }
    };
  }
  set textContent(v) { this.text = String(v); }
  get textContent() {
    if (this.children.length === 0) return this.text;
    return this.children.map(c => c.textContent).join('');
  }
  matches(sel) {
    if (sel.startsWith('.')) return this.classes.includes(sel.slice(1));
    if (sel.startsWith('#')) return this.attrs.id === sel.slice(1);
    const at = /^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (at) return at[2] === undefined ? at[1] in this.attrs : this.attrs[at[1]] === at[2];
    return this.tagName === sel.toUpperCase();
  }
  closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  walk(fn) { fn(this); this.children.forEach(c => c.walk(fn)); }
  querySelector(sel) { let hit = null; this.children.forEach(c => c.walk(n => { if (!hit && n.matches(sel)) hit = n; })); return hit; }
  querySelectorAll(sel) { const out = []; this.children.forEach(c => c.walk(n => { if (n.matches(sel)) out.push(n); })); return out; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  /* bubble from target up to this node */
  fire(type, target, extra) {
    const ev = Object.assign({ type, target, preventDefault() {} }, extra || {});
    let n = target;
    const chain = [];
    while (n) { chain.push(n); n = n.parent; }
    for (const node of chain) (node.listeners[type] || []).forEach(fn => fn(ev));
  }
  set innerHTML(html) { this.children = parse(String(html), this); }
  get innerHTML() { return this._raw || ''; }
}

function parse(html, parent) {
  const root = [];
  const stack = [];
  const re = /<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const [full, tag, rawAttrs, textChunk] = m;
    if (textChunk !== undefined) {
      const t = textChunk.trim();
      if (t && stack.length) stack[stack.length - 1].text += t;
      continue;
    }
    if (full.startsWith('</')) { stack.pop(); continue; }
    const attrs = {};
    (rawAttrs || '').replace(/([a-zA-Z-]+)(?:="([^"]*)")?/g, (_, k, v) => { attrs[k] = v === undefined ? '' : v; return ''; });
    const node = new El(tag, attrs);
    const top = stack[stack.length - 1];
    node.parent = top || parent;
    if (top) top.children.push(node); else root.push(node);
    if (!VOID.has(tag.toLowerCase())) stack.push(node);
  }
  return root;
}
module.exports = { El };
