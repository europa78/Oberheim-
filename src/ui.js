/*
 * OB-X replica — control surface widgets and panel construction.
 *
 * The layout mirrors the front panel: MASTER, CONTROL, MODULATION,
 * OSCILLATORS, FILTER, ENVELOPES on the upper row; KEYBOARD and PROGRAMMER
 * on the lower row; the performance panel sits to the left of the keybed.
 *
 * Controls address the store by id. Programmable parameters use their bare
 * parameter id; non-programmable ones (the manual's MANUAL section, the
 * performance panel, keyboard modes) use a "g:" prefix.
 */

import { PARAM_BY_ID, quantise, KEY_RANGE } from './params.js';

const KNOB_SWEEP = 300; // degrees of travel, -150..+150

// ---------------------------------------------------------------------------
// Small DOM helper
// ---------------------------------------------------------------------------
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  return n;
}

function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}

// ---------------------------------------------------------------------------
// Knob
// ---------------------------------------------------------------------------

class Knob {
  constructor(ui, { id, label, size = 'md', led = false, format }) {
    this.ui = ui;
    this.id = id;
    this.format = format;

    this.root = el('div', `ctl knob-ctl size-${size}`, { 'data-param': id });
    if (led) {
      this.led = el('i', 'led led-red knob-led');
      add(this.root, this.led);
    }
    if (label) add(this.root, el('div', 'cap', { text: label }));

    this.knob = el('div', 'knob', {
      role: 'slider', tabindex: '0',
      'aria-label': label || id,
      'aria-valuemin': '0', 'aria-valuemax': '100',
    });
    this.ticks = el('div', 'knob-ticks');
    for (let i = 0; i < 11; i++) {
      const t = el('i', 'tick');
      t.style.transform = `rotate(${-150 + i * 30}deg) translateY(-50%)`;
      add(this.ticks, t);
    }
    this.body = el('div', 'knob-body');
    this.pointer = el('div', 'knob-pointer');
    add(this.body, this.pointer);
    add(this.knob, this.ticks, this.body);
    add(this.root, this.knob);

    this.attach();
  }

  attach() {
    const knob = this.knob;
    let dragging = false, startY = 0, startX = 0, startVal = 0, moved = false;

    const onMove = (ev) => {
      if (!dragging) return;
      ev.preventDefault();
      const p = ev.touches ? ev.touches[0] : ev;
      const dy = startY - p.clientY;
      const dx = p.clientX - startX;
      const fine = ev.shiftKey ? 0.25 : 1;
      const delta = ((dy + dx) / 180) * fine;
      if (Math.abs(dy) + Math.abs(dx) > 2) moved = true;
      this.ui.setValue(this.id, clamp01(startVal + delta));
    };
    const onUp = () => {
      dragging = false;
      document.body.classList.remove('dragging');
      this.ui.hideTip();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    knob.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      knob.focus();
      dragging = true; moved = false;
      startY = ev.clientY; startX = ev.clientX;
      startVal = this.ui.getValue(this.id);
      document.body.classList.add('dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    knob.addEventListener('dblclick', () => {
      const p = PARAM_BY_ID[this.id];
      this.ui.setValue(this.id, p ? p.def : 0.5);
    });
    knob.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const step = ev.shiftKey ? 0.005 : 0.02;
      this.ui.setValue(this.id, clamp01(this.ui.getValue(this.id) - Math.sign(ev.deltaY) * step));
    }, { passive: false });
    knob.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 0.005 : 0.02;
      let d = 0;
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') d = step;
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') d = -step;
      else if (ev.key === 'Home') return this.ui.setValue(this.id, 0);
      else if (ev.key === 'End') return this.ui.setValue(this.id, 1);
      else return;
      ev.preventDefault();
      this.ui.setValue(this.id, clamp01(this.ui.getValue(this.id) + d));
    });
    knob.addEventListener('pointerenter', () => this.ui.showTip(this));
    knob.addEventListener('pointerleave', () => { if (!dragging) this.ui.hideTip(); });
  }

  render(v) {
    const p = PARAM_BY_ID[this.id];
    const shown = p ? quantise(p, v) : v;
    this.pointer.style.transform = `rotate(${-KNOB_SWEEP / 2 + shown * KNOB_SWEEP}deg)`;
    this.knob.setAttribute('aria-valuenow', Math.round(shown * 100));
    this.knob.setAttribute('aria-valuetext', this.text(shown));
    if (this.led) this.led.classList.toggle('on', Math.abs(shown - 0.5) > 0.02);
  }

  text(v) {
    return this.format ? this.format(v) : `${Math.round(v * 100)}`;
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---------------------------------------------------------------------------
// Rocker switch (on/off or multi-state, with one or two LEDs)
// ---------------------------------------------------------------------------

class Rocker {
  constructor(ui, { id, label, leds = ['red'], ledCaps, states = 2, wide = false, momentary = false }) {
    this.ui = ui;
    this.id = id;
    this.states = states;
    this.momentary = momentary;

    this.root = el('div', `ctl sw-ctl${wide ? ' wide' : ''}`, { 'data-param': id });
    if (ledCaps) {
      const caps = el('div', 'led-caps');
      for (const c of ledCaps) add(caps, el('span', 'led-cap', { text: c }));
      add(this.root, caps);
    }
    this.btn = el('button', 'rocker', { type: 'button', 'aria-label': label || id });
    add(this.btn, el('span', 'sw-label', { text: label || '' }));
    this.leds = leds.map((colour) => el('i', `led led-${colour}`));
    const ledBox = el('span', `leds n${this.leds.length}`);
    add(ledBox, ...this.leds);
    add(this.btn, ledBox, el('span', 'rocker-face'));
    add(this.root, this.btn);

    if (momentary) {
      this.btn.addEventListener('pointerdown', () => this.ui.momentary(this.id, true));
      const up = () => this.ui.momentary(this.id, false);
      this.btn.addEventListener('pointerup', up);
      this.btn.addEventListener('pointerleave', up);
    } else {
      this.btn.addEventListener('click', () => this.ui.toggle(this.id, this.states));
    }
  }

  render(v) {
    const n = Math.round(v);
    this.btn.setAttribute('aria-pressed', n > 0 ? 'true' : 'false');
    this.root.classList.toggle('on', n > 0);
    if (this.leds.length === 1) {
      this.leds[0].classList.toggle('on', n > 0);
    } else {
      // Two LEDs encode the state as a small binary display, matching the
      // panel's FIL / AMP and HALF / FULL indicator pairs.
      this.leds[0].classList.toggle('on', n === 1 || n === 3);
      this.leds[1].classList.toggle('on', n === 2 || n === 3);
    }
  }
}

// ---------------------------------------------------------------------------
// Panel construction
// ---------------------------------------------------------------------------

export class Surface {
  constructor(store) {
    this.store = store;
    this.controls = new Map(); // id -> widget[]
    this.tooltip = document.getElementById('tooltip');
  }

  // --- store plumbing ------------------------------------------------------
  getValue(id) { return this.store.get(id); }
  setValue(id, v) {
    this.store.set(id, v);
    const w = this.controls.get(id);
    if (w) for (const c of w) if (c.showTipNow !== false) this.showTip(c);
  }
  toggle(id, states) {
    const cur = Math.round(this.store.get(id) || 0);
    this.store.set(id, (cur + 1) % states);
  }
  momentary(id, down) { this.store.set(id, down ? 1 : 0); }

  register(widget) {
    if (!this.controls.has(widget.id)) this.controls.set(widget.id, []);
    this.controls.get(widget.id).push(widget);
    return widget.root;
  }

  refresh() {
    for (const id of this.controls.keys()) this.renderOne(id);
  }

  renderOne(id) {
    const widgets = this.controls.get(id);
    if (!widgets) return;
    const v = this.store.get(id);
    for (const w of widgets) w.render(typeof v === 'number' ? v : 0);
  }

  showTip(widget) {
    if (!this.tooltip || !widget.text) return;
    const r = widget.root.getBoundingClientRect();
    this.tooltip.textContent = widget.text(this.store.get(widget.id));
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${r.left + r.width / 2}px`;
    this.tooltip.style.top = `${r.top - 6}px`;
  }
  hideTip() { if (this.tooltip) this.tooltip.hidden = true; }

  // --- widget factories ----------------------------------------------------
  knob(opts) { const k = new Knob(this, opts); return this.register(k); }
  sw(opts) { const s = new Rocker(this, opts); return this.register(s); }

  // -------------------------------------------------------------------------
  build(root, perfRoot, keybedRoot) {
    add(root, this.masterPanel(), this.controlPanel(), this.modulationPanel(),
              this.oscillatorPanel(), this.filterPanel(), this.envelopePanel(),
              this.keyboardPanel(), this.programmerPanel());
    add(perfRoot, ...this.perfPanel());
    this.buildKeybed(keybedRoot);
    this.refresh();
  }

  panel(key, title, cls = '') {
    const p = el('section', `panel panel-${key} ${cls}`.trim(), { 'data-panel': key });
    p.appendChild(el('div', 'panel-inner'));
    if (title) p.appendChild(el('div', 'panel-name', { text: title }));
    return p;
  }

  row(cls, ...kids) { return add(el('div', `row ${cls}`.trim()), ...kids); }
  col(cls, ...kids) { return add(el('div', `col ${cls}`.trim()), ...kids); }

  // --- MASTER (not programmable) ------------------------------------------
  masterPanel() {
    const p = this.panel('master', 'MASTER');
    add(p.firstChild,
      this.row('knobs',
        this.knob({ id: 'g:masterVol', label: 'MASTER VOL', format: pct }),
        this.knob({ id: 'g:volBalance', label: 'VOL/BALANCE', format: pct })),
      this.row('switches',
        this.sw({ id: 'g:tune', label: 'TUNE', momentary: true }),
        this.sw({ id: 'g:hold', label: 'HOLD' }),
        this.sw({ id: 'g:chord', label: 'CHORD' })),
      this.row('knobs single',
        this.knob({ id: 'g:masterTune', label: 'MASTER TUNE', format: cents })));
    return p;
  }

  // --- CONTROL -------------------------------------------------------------
  controlPanel() {
    const p = this.panel('control', 'CONTROL');
    add(p.firstChild,
      this.row('knobs',
        this.knob({ id: 'vintage', label: 'VINTAGE', format: pct }),
        this.knob({ id: 'portamento', label: 'PORTAMENTO', format: glide })),
      this.row('switches',
        this.sw({ id: 'velo', label: 'VELO', leds: ['amber', 'red'], ledCaps: ['FIL', 'AMP'], states: 4 }),
        this.sw({ id: 'touch', label: 'TOUCH', leds: ['amber', 'red'], ledCaps: ['FIL', 'AMP'], states: 4 }),
        this.sw({ id: 'unison', label: 'UNISON' })),
      this.row('knobs single',
        this.knob({ id: 'osc2detune', label: 'OSC 2 DETUNE', led: true, format: detune })));
    return p;
  }

  // --- MODULATION ----------------------------------------------------------
  modulationPanel() {
    const p = this.panel('modulation', 'MODULATION');
    add(p.firstChild,
      this.col('mod-col',
        el('div', 'col-cap', { text: 'LFO' }),
        this.knob({ id: 'lfoRate', label: 'RATE', format: hz }),
        this.sw({ id: 'lfoSine', label: 'SINE' }),
        this.sw({ id: 'lfoSquare', label: 'SQUARE' }),
        this.sw({ id: 'lfoSH', label: 'S/H' })),
      this.col('mod-col',
        el('div', 'col-cap', { text: 'DESTINATION' }),
        this.knob({ id: 'depth1', label: 'DEPTH 1', format: pct }),
        this.sw({ id: 'd1Osc1', label: 'OSC 1' }),
        this.sw({ id: 'd1Osc2', label: 'OSC 2' }),
        this.sw({ id: 'd1Filter', label: 'FILTER' })),
      this.col('mod-col',
        el('div', 'col-cap', { text: 'DESTINATION' }),
        this.knob({ id: 'depth2', label: 'DEPTH 2', format: pct }),
        this.sw({ id: 'd2Pwm1', label: 'PWM 1' }),
        this.sw({ id: 'd2Pwm2', label: 'PWM 2' }),
        this.sw({ id: 'd2Volume', label: 'VOLUME' })));
    return p;
  }

  // --- OSCILLATORS ---------------------------------------------------------
  oscillatorPanel() {
    const p = this.panel('oscillators', 'OSCILLATORS');
    const waveGroup = (n, sawId, pulseId) => {
      const g = el('div', 'sw-group waveform');
      add(g, el('div', 'group-cap', { text: 'WAVEFORM' }),
             this.row('pair',
               this.sw({ id: sawId, label: 'SAW' }),
               this.sw({ id: pulseId, label: 'PULSE' })),
             el('div', 'group-sub', { text: 'TRIANGLE' }));
      return g;
    };
    add(p.firstChild,
      this.row('knobs',
        add(el('div', 'osc-slot'), el('div', 'osc-num', { text: '1' }),
            this.knob({ id: 'osc1Freq', label: 'FREQUENCY', format: octaves })),
        add(el('div', 'osc-slot'),
            this.knob({ id: 'pulseWidth', label: 'PULSE WIDTH', format: duty })),
        add(el('div', 'osc-slot'), el('div', 'osc-num', { text: '2' }),
            this.knob({ id: 'osc2Freq', label: 'FREQUENCY', format: semis }))),
      this.row('switches',
        waveGroup(1, 'osc1Saw', 'osc1Pulse'),
        add(el('div', 'sw-group xmod'),
            el('div', 'group-cap', { text: 'X-MOD' }),
            this.row('pair',
              this.knob({ id: 'xmod', label: 'MOD', size: 'sm', format: pct }),
              this.sw({ id: 'sync', label: 'SYNC' }))),
        waveGroup(2, 'osc2Saw', 'osc2Pulse')));
    return p;
  }

  // --- FILTER --------------------------------------------------------------
  filterPanel() {
    const p = this.panel('filter', 'FILTER');
    add(p.firstChild,
      this.row('knobs',
        this.knob({ id: 'cutoff', label: 'FREQUENCY', format: pct }),
        this.knob({ id: 'resonance', label: 'RESONANCE', format: pct }),
        this.knob({ id: 'filterMod', label: 'MODULATION', format: pct })),
      this.row('switches',
        this.sw({ id: 'filterType', label: 'TYPE', leds: ['amber', 'red'], ledCaps: ['2', '4'], states: 2 }),
        this.sw({ id: 'fOsc1', label: 'OSC 1' }),
        this.sw({ id: 'fOsc2', label: 'OSC 2', leds: ['amber', 'red'], ledCaps: ['HALF', 'FULL'], states: 3 }),
        this.sw({ id: 'fNoise', label: 'NOISE', leds: ['amber', 'red'], ledCaps: ['HALF', 'FULL'], states: 3 }),
        this.sw({ id: 'kbdTrack', label: 'KBD' })));
    return p;
  }

  // --- ENVELOPES -----------------------------------------------------------
  envelopePanel() {
    const p = this.panel('envelopes', '');
    add(p.firstChild,
      el('div', 'env-title top', { text: 'FILTER ENVELOPE' }),
      this.row('knobs adsr',
        this.knob({ id: 'fAttack', label: 'ATTACK', format: msTime }),
        this.knob({ id: 'fDecay', label: 'DECAY', format: msTime }),
        this.knob({ id: 'fSustain', label: 'SUSTAIN', format: pct }),
        this.knob({ id: 'fRelease', label: 'RELEASE', format: msTime })),
      this.row('knobs adsr',
        this.knob({ id: 'aAttack', label: 'ATTACK', format: msTime }),
        this.knob({ id: 'aDecay', label: 'DECAY', format: msTime }),
        this.knob({ id: 'aSustain', label: 'SUSTAIN', format: pct }),
        this.knob({ id: 'aRelease', label: 'RELEASE', format: msTime })),
      el('div', 'env-title bottom', { text: 'VOLUME ENVELOPE' }));
    return p;
  }

  // --- KEYBOARD ------------------------------------------------------------
  keyboardPanel() {
    const p = this.panel('keyboard', 'KEYBOARD');
    add(p.firstChild,
      this.row('switches',
        this.sw({ id: 'g:split', label: 'SPLIT' }),
        this.sw({ id: 'g:double', label: 'DOUBLE' }),
        this.sw({ id: 'g:lower', label: 'LOWER' }),
        this.sw({ id: 'g:upper', label: 'UPPER' })));
    return p;
  }

  // --- PROGRAMMER ----------------------------------------------------------
  programmerPanel() {
    const p = this.panel('programmer', 'PROGRAMMER');
    const progs = this.row('progs');
    for (let i = 1; i <= 8; i++) {
      add(progs, this.sw({ id: `g:prog${i}`, label: String(i) }));
    }
    this.display = el('div', 'lcd');
    const lcdTop = el('div', 'lcd-row lcd-top');
    add(lcdTop, el('span', 'lcd-tag', { text: 'Bank' }), el('span', 'lcd-tag right', { text: 'Prog' }));
    this.lcdBank = el('span', 'lcd-text bank', { text: 'OB-Xa' });
    this.lcdNum = el('span', 'lcd-text num', { text: 'A1' });
    this.lcdName = el('div', 'lcd-row lcd-name', { text: 'Brass Ensemble' });
    add(this.display, lcdTop, add(el('div', 'lcd-row lcd-mid'), this.lcdBank, this.lcdNum), this.lcdName);

    add(p.firstChild,
      this.row('switches lead',
        this.sw({ id: 'g:manual', label: 'MANUAL' }),
        this.sw({ id: 'g:page2', label: 'PAGE 2' })),
      add(el('div', 'lcd-block'),
        add(el('div', 'lcd-knob'), el('div', 'cap tiny', { text: 'BANK' }),
            this.knob({ id: 'g:bank', label: '', size: 'xs', format: bankName })),
        this.display,
        add(el('div', 'lcd-knob'), el('div', 'cap tiny', { text: 'GROUP' }),
            this.knob({ id: 'g:group', label: '', size: 'xs', format: groupName }))),
      progs,
      this.row('switches trail',
        this.sw({ id: 'g:global', label: 'GLOBAL' }),
        this.sw({ id: 'g:write', label: 'WRITE' })));
    return p;
  }

  setDisplay({ bank, num, name }) {
    if (bank !== undefined) this.lcdBank.textContent = bank;
    if (num !== undefined) this.lcdNum.textContent = num;
    if (name !== undefined) this.lcdName.textContent = name;
  }

  // --- performance panel (left of the keybed) ------------------------------
  perfPanel() {
    const top = el('div', 'perf-row perf-top');
    add(top,
      add(el('div', 'perf-cell'),
          this.knob({ id: 'g:arpRate', label: 'RATE', size: 'sm', led: true, format: arpRate })),
      add(el('div', 'perf-cell perf-lu'),
          this.sw({ id: 'g:perfLower', label: 'LOWER' }),
          this.sw({ id: 'g:perfUpper', label: 'UPPER' })),
      add(el('div', 'perf-cell'),
          this.knob({ id: 'g:modDepth', label: 'DEPTH', size: 'sm', format: pct })));

    const mid = el('div', 'perf-row perf-mid');
    this.bender = el('div', 'bender');
    this.benderLever = el('div', 'bender-lever', { role: 'slider', tabindex: '0', 'aria-label': 'Pitch bend / modulation lever' });
    add(this.bender, this.benderLever);
    add(mid,
      add(el('div', 'perf-cell'),
          this.sw({ id: 'g:arpMode', label: 'MODE', leds: ['red', 'amber'], ledCaps: ['Mod', 'Arp'], states: 2 })),
      this.bender,
      add(el('div', 'perf-cell'),
          this.sw({ id: 'g:arpOn', label: '' }),
          el('div', 'perf-cap', { text: 'ARPEGGIATE' })));

    const bot = el('div', 'perf-row perf-bot');
    add(bot,
      add(el('div', 'perf-group arp'),
          el('div', 'group-cap rule', { text: 'ARPEGGIATOR' }),
          add(el('div', 'perf-btns'),
              labelled('HOLD', this.sw({ id: 'g:arpHold', label: '' })),
              labelled('KBD', this.sw({ id: 'g:arpKbd', label: '' })),
              labelled('DOWN', this.sw({ id: 'g:arpDown', label: '' })),
              labelled('UP', this.sw({ id: 'g:arpUp', label: '' }))),
          add(el('div', 'perf-sublabels'),
              el('span', { }, { }),
              el('span', 'sub', { text: 'OSC 2' }))),
      add(el('div', 'perf-group bend'),
          add(el('div', 'perf-btns'),
              labelled('OSC 2 ONLY', this.sw({ id: 'g:bendOsc2Only', label: '' })),
              labelled('AMOUNT', this.sw({ id: 'g:bendRange', label: '' }))),
          el('div', 'group-cap rule', { text: 'BEND' })),
      add(el('div', 'perf-group transpose'),
          add(el('div', 'perf-btns'),
              labelled('DOWN', this.sw({ id: 'g:transposeDown', label: '' })),
              labelled('UP', this.sw({ id: 'g:transposeUp', label: '' }))),
          el('div', 'group-cap rule', { text: 'TRANSPOSE' })));

    return [top, mid, bot];
  }

  // --- keybed --------------------------------------------------------------
  buildKeybed(root) {
    this.keys = new Map();
    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    const whites = el('div', 'whites');
    const blacks = el('div', 'blacks');
    let whiteIndex = 0;

    for (let n = KEY_RANGE.first; n <= KEY_RANGE.last; n++) {
      const pc = n % 12;
      if (WHITE.includes(pc)) {
        const k = el('div', 'key white', { 'data-note': String(n) });
        add(whites, k);
        this.keys.set(n, k);
        whiteIndex++;
      } else {
        const k = el('div', 'key black', { 'data-note': String(n) });
        k.style.setProperty('--slot', String(whiteIndex));
        add(blacks, k);
        this.keys.set(n, k);
      }
    }
    root.style.setProperty('--white-count', String(whiteIndex));
    add(root, whites, blacks);
  }

  setKeyDown(note, on) {
    const k = this.keys?.get(note);
    if (k) k.classList.toggle('down', on);
  }
}

function labelled(text, node) {
  const wrap = el('div', 'perf-btn');
  add(wrap, el('span', 'perf-btn-cap', { text }), node);
  return wrap;
}

// ---------------------------------------------------------------------------
// Value formatters (tooltip readouts)
// ---------------------------------------------------------------------------
const pct = (v) => `${Math.round(v * 100)}%`;
const hz = (v) => `${(0.1 * Math.pow(200, v)).toFixed(2)} Hz`;
const glide = (v) => (v <= 0.001 ? 'off' : `${Math.round(2000 * v * v)} ms`);
const cents = (v) => `${(v - 0.5) * 100 > 0 ? '+' : ''}${Math.round((v - 0.5) * 100)} cents`;
const detune = (v) => `${(v - 0.5) * 100 > 0 ? '+' : ''}${((v - 0.5) * 100).toFixed(1)} cents`;
const octaves = (v) => `+${Math.round(v * 4)} oct`;
const semis = (v) => `+${Math.round(v * 60)} semitones`;
const duty = (v) => `${(50 - v * 45).toFixed(0)}% duty`;
const msTime = (v) => {
  const ms = 1 + 9999 * v * v * v;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
};
const arpRate = (v) => `${(0.5 + v * 15).toFixed(1)} Hz`;
const bankName = () => 'Factory';
const groupName = (v) => 'ABCD'[Math.min(3, Math.floor(v * 4))];
