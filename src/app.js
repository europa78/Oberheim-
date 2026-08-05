/*
 * OB-X replica — application layer.
 *
 * Owns the programmer (program memory, MANUAL / EDIT / WRITE), keyboard
 * routing (whole / split / double), the performance panel, the arpeggiator,
 * MIDI and computer-keyboard input, and the bridge to the AudioWorklet.
 */

import { PARAM_BY_ID, PARAM_IDS, defaultProgram, normaliseProgram, clampParam, quantise, KEY_RANGE } from './params.js';
import { Surface } from './ui.js';
import { FACTORY_BANK } from './presets.js';

const STORAGE_KEY = 'obx.state.v1';
const GROUPS = 'ABCD';
const PAGES = 2;              // PAGE 2 doubles the programmer to 64 slots
const PROGRAMS_PER_PAGE = 32; // 4 groups x 8

// ---------------------------------------------------------------------------
// Store — everything the panel can address
// ---------------------------------------------------------------------------

class Store {
  constructor() {
    this.surface = null;
    this.engine = null;

    this.bank = this.buildBank();
    this.manualPanel = defaultProgram('Manual Panel');
    this.live = [normaliseProgram(this.bank[0]), normaliseProgram(this.bank[8])];

    this.g = {
      masterVol: 0.75, volBalance: 0.5, masterTune: 0.5,
      tune: 0, hold: 0, chord: 0,
      split: 0, double: 0, lower: 0, upper: 1,
      manual: 0, page2: 0, bank: 0, group: 0, global: 0, write: 0,
      prog1: 1, prog2: 0, prog3: 0, prog4: 0, prog5: 0, prog6: 0, prog7: 0, prog8: 0,
      arpRate: 0.45, modDepth: 0, perfLower: 0, perfUpper: 1,
      arpMode: 1, arpOn: 0, arpHold: 0, arpKbd: 0, arpDown: 0, arpUp: 1,
      bendOsc2Only: 0, bendRange: 0, transposeDown: 0, transposeUp: 0,
    };

    this.sel = [{ page: 0, group: 0, prog: 0 }, { page: 0, group: 1, prog: 0 }];
    this.editLayer = 0;
    this.mode = 'program';   // 'program' | 'manual'
    this.writeArmed = false;
    this.splitNote = 60;
    this.armSplit = false;
    this.dirty = false;

    this.restore();
  }

  buildBank() {
    const bank = [];
    for (let page = 0; page < PAGES; page++) {
      for (let i = 0; i < PROGRAMS_PER_PAGE; i++) {
        const src = page === 0 ? FACTORY_BANK[i] : null;
        bank.push(normaliseProgram(src, `Program ${i + 1}`));
      }
    }
    return bank;
  }

  slotIndex(sel) { return sel.page * PROGRAMS_PER_PAGE + sel.group * 8 + sel.prog; }

  // --- addressing ----------------------------------------------------------

  get(id) {
    if (id.startsWith('g:')) return this.g[id.slice(2)] ?? 0;
    return this.live[this.editLayer][id] ?? 0;
  }

  set(id, raw) {
    if (id.startsWith('g:')) return this.setGlobal(id.slice(2), raw);

    const p = PARAM_BY_ID[id];
    if (!p) return;
    const v = quantise(p, clampParam(p, raw));
    this.live[this.editLayer][id] = v;
    this.engine?.setParam(this.editLayer, id, v);
    this.dirty = true;
    this.surface?.renderOne(id);
    this.updateDisplay();
  }

  setGlobal(key, raw) {
    const v = typeof raw === 'number' ? raw : 0;
    switch (key) {
      case 'tune':
        this.g.tune = v;
        if (v) this.engine?.autoTune();
        break;

      case 'hold':
        this.g.hold = v ? 1 : 0;
        if (!this.g.hold) this.app?.releaseHeld();
        break;

      case 'chord':
        this.g.chord = v ? 1 : 0;
        this.app?.chordChanged(this.g.chord);
        break;

      case 'split':
      case 'double': {
        const on = v ? 1 : 0;
        this.g.split = key === 'split' ? on : (on ? 0 : this.g.split);
        this.g.double = key === 'double' ? on : (on ? 0 : this.g.double);
        if (key === 'split' && on) this.armSplit = true;
        this.applyKeyboardMode();
        break;
      }

      case 'lower':
      case 'upper': {
        const layer = key === 'lower' ? 1 : 0;
        this.selectLayer(layer);
        break;
      }
      case 'perfLower': return this.selectLayer(1);
      case 'perfUpper': return this.selectLayer(0);

      case 'manual':
        this.g.manual = v ? 1 : 0;
        this.mode = this.g.manual ? 'manual' : 'program';
        if (this.mode === 'manual') this.loadProgram(this.manualPanel, false);
        else this.recallCurrent();
        break;

      case 'page2':
        this.g.page2 = v ? 1 : 0;
        this.sel[this.editLayer].page = this.g.page2;
        this.recallCurrent();
        break;

      case 'bank':
        this.g.bank = Math.min(1, Math.max(0, v));
        this.updateDisplay();
        break;

      case 'group': {
        this.g.group = Math.min(1, Math.max(0, v));
        const grp = Math.min(3, Math.floor(this.g.group * 4));
        this.sel[this.editLayer].group = grp;
        this.recallCurrent();
        break;
      }

      case 'global':
        this.g.global = v ? 1 : 0;
        this.updateDisplay();
        break;

      case 'write':
        this.writeArmed = !this.writeArmed;
        this.g.write = this.writeArmed ? 1 : 0;
        this.updateDisplay();
        break;

      case 'arpMode':
      case 'arpOn':
      case 'arpHold':
        this.g[key] = key === 'arpMode' ? Math.round(v) : (v ? 1 : 0);
        this.app?.arpChanged();
        break;

      case 'arpKbd':
        this.g.arpKbd = v ? 1 : 0;
        if (this.g.arpKbd) { this.g.arpUp = 0; this.g.arpDown = 0; }
        this.app?.arpChanged();
        break;

      case 'arpUp':
      case 'arpDown':
        this.g[key] = v ? 1 : 0;
        if (this.g[key]) this.g.arpKbd = 0;
        this.app?.arpChanged();
        break;

      case 'transposeDown':
      case 'transposeUp': {
        const on = v ? 1 : 0;
        this.g.transposeDown = key === 'transposeDown' ? on : (on ? 0 : this.g.transposeDown);
        this.g.transposeUp = key === 'transposeUp' ? on : (on ? 0 : this.g.transposeUp);
        this.engine?.setGlobal('transpose', this.g.transposeUp ? 1 : this.g.transposeDown ? -1 : 0);
        break;
      }

      default:
        if (/^prog[1-8]$/.test(key)) return this.selectProgram(Number(key.slice(4)) - 1);
        this.g[key] = v;
        break;
    }

    // Anything the engine mirrors directly.
    if (['masterVol', 'volBalance', 'masterTune', 'modDepth', 'bendRange', 'bendOsc2Only'].includes(key)) {
      this.g[key] = v;
      this.engine?.setGlobal(key, v);
    }

    this.surface?.refresh();
    this.updateDisplay();
    this.persist();
  }

  // --- programmer ----------------------------------------------------------

  selectLayer(layer) {
    if (this.g.split || this.g.double) this.editLayer = layer;
    else this.editLayer = 0;
    this.g.lower = this.editLayer === 1 ? 1 : 0;
    this.g.upper = this.editLayer === 0 ? 1 : 0;
    this.g.perfLower = this.g.lower;
    this.g.perfUpper = this.g.upper;
    const sel = this.sel[this.editLayer];
    this.g.group = sel.group / 4 + 0.125;
    this.g.page2 = sel.page;
    this.syncProgLeds();
    this.surface?.refresh();
    this.updateDisplay();
  }

  selectProgram(index) {
    const sel = this.sel[this.editLayer];
    if (this.writeArmed) {
      // "Press and hold WRITE ... continue to hold WRITE and select a GROUP
      //  ... and a PROGRAM" — here WRITE arms, then the program key commits.
      sel.prog = index;
      this.bank[this.slotIndex(sel)] = { ...this.live[this.editLayer] };
      this.writeArmed = false;
      this.g.write = 0;
      this.dirty = false;
      this.flash(`WRITTEN ${this.slotName(sel)}`);
    } else {
      sel.prog = index;
      this.mode = 'program';
      this.g.manual = 0;
      this.recallCurrent();
    }
    this.syncProgLeds();
    this.persist();
    this.surface?.refresh();
  }

  syncProgLeds() {
    const sel = this.sel[this.editLayer];
    for (let i = 1; i <= 8; i++) this.g[`prog${i}`] = sel.prog === i - 1 ? 1 : 0;
  }

  recallCurrent() {
    const sel = this.sel[this.editLayer];
    this.loadProgram(this.bank[this.slotIndex(sel)], true);
  }

  loadProgram(prog, markClean) {
    const target = normaliseProgram(prog, prog?.name);
    this.live[this.editLayer] = target;
    this.engine?.sendPatch(this.editLayer, target);
    if (markClean) this.dirty = false;
    this.syncProgLeds();
    this.surface?.refresh();
    this.updateDisplay();
  }

  slotName(sel = this.sel[this.editLayer]) {
    return `${sel.page ? 'P2 ' : ''}${GROUPS[sel.group]}${sel.prog + 1}`;
  }

  flash(text) {
    this._flash = text;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this._flash = null; this.updateDisplay(); }, 1400);
    this.updateDisplay();
  }

  updateDisplay() {
    if (!this.surface) return;
    const sel = this.sel[this.editLayer];
    let name = this._flash;
    if (!name) {
      if (this.g.global) name = `${this.app?.midiName || 'No MIDI in'}`;
      else if (this.mode === 'manual') name = 'Manual Panel';
      else name = this.live[this.editLayer].name || 'Program';
    }
    this.surface.setDisplay({
      bank: this.g.bank < 0.5 ? 'Factory' : 'User',
      num: this.mode === 'manual' ? 'MAN' : `${this.slotName(sel)}${this.dirty ? '*' : ''}`,
      name,
    });
  }

  applyKeyboardMode() {
    const mode = this.g.split ? 'split' : this.g.double ? 'double' : 'whole';
    this.mode2 = mode;
    if (mode === 'whole') {
      this.engine?.setPools([[0, 1, 2, 3, 4, 5, 6, 7], []]);
      this.selectLayer(0);
    } else {
      this.engine?.setPools([[0, 1, 2, 3], [4, 5, 6, 7]]);
      this.engine?.sendPatch(1, this.live[1]);
    }
    this.updateDisplay();
  }

  layersForNote(note) {
    if (this.g.double) return [0, 1];
    if (this.g.split) return [note < this.splitNote ? 1 : 0];
    return [0];
  }

  // --- persistence ---------------------------------------------------------

  persist() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          bank: this.bank, manualPanel: this.manualPanel, g: this.g,
          sel: this.sel, splitNote: this.splitNote,
        }));
      } catch { /* storage unavailable — run in memory only */ }
    }, 400);
  }

  restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
    if (!saved) return;
    if (Array.isArray(saved.bank) && saved.bank.length === PAGES * PROGRAMS_PER_PAGE) {
      this.bank = saved.bank.map((p, i) => normaliseProgram(p, `Program ${i + 1}`));
    }
    if (saved.manualPanel) this.manualPanel = normaliseProgram(saved.manualPanel, 'Manual Panel');
    if (saved.g) Object.assign(this.g, saved.g);
    if (Array.isArray(saved.sel)) this.sel = saved.sel;
    if (typeof saved.splitNote === 'number') this.splitNote = saved.splitNote;
    this.live = [normaliseProgram(this.bank[this.slotIndex(this.sel[0])]),
                 normaliseProgram(this.bank[this.slotIndex(this.sel[1])])];
  }

  factoryReset() {
    this.bank = this.buildBank();
    this.sel = [{ page: 0, group: 0, prog: 0 }, { page: 0, group: 1, prog: 0 }];
    this.editLayer = 0;
    this.recallCurrent();
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Engine — AudioContext + worklet bridge
// ---------------------------------------------------------------------------

class Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.ready = false;
  }

  async start() {
    if (this.ready) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(new URL('./obx-processor.js', import.meta.url));
    this.node = new AudioWorkletNode(this.ctx, 'obx-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
    });
    this.out = this.ctx.createGain();
    this.out.gain.value = 1;
    this.node.connect(this.out).connect(this.ctx.destination);
    this.ready = true;
  }

  post(msg) { if (this.ready) this.node.port.postMessage(msg); }
  sendPatch(layer, params) {
    const clean = {};
    for (const id of PARAM_IDS) clean[id] = params[id];
    this.post({ type: 'patch', layer, params: clean });
  }
  setParam(layer, id, value) { this.post({ type: 'param', layer, id, value }); }
  setGlobal(id, value) { this.post({ type: 'global', id, value }); }
  setPools(pools) { this.post({ type: 'pools', pools }); }
  noteOn(note, velocity, layer) { this.post({ type: 'noteOn', note, velocity, layer }); }
  noteOff(note, layer) { this.post({ type: 'noteOff', note, layer }); }
  pressure(value) { this.post({ type: 'pressure', value }); }
  allNotesOff() { this.post({ type: 'allNotesOff' }); }
  panic() { this.post({ type: 'panic' }); }
  autoTune() { this.post({ type: 'autoTune' }); }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

class App {
  constructor() {
    this.store = new Store();
    this.engine = new Engine();
    this.store.engine = this.engine;
    this.store.app = this;

    this.surface = new Surface(this.store);
    this.store.surface = this.surface;

    this.sounding = new Set();   // notes currently making sound
    this.physical = new Set();   // keys physically down
    this.heldByHold = new Set(); // notes latched by the HOLD button
    this.chordNotes = null;      // captured chord for CHORD mode
    this.arpNotes = [];
    this.arpIndex = 0;
    this.arpDir = 1;
    this.arpTimer = null;
    this.arpCurrent = null;
    this.midiName = '';
    this.octave = 0;
  }

  async boot() {
    this.surface.build(
      document.getElementById('control-surface'),
      document.getElementById('perf-panel'),
      document.getElementById('keybed'));

    await this.engine.start();

    // Push initial state to the DSP.
    this.engine.sendPatch(0, this.store.live[0]);
    this.engine.sendPatch(1, this.store.live[1]);
    for (const key of ['masterVol', 'volBalance', 'masterTune', 'modDepth', 'bendRange', 'bendOsc2Only']) {
      this.engine.setGlobal(key, this.store.g[key]);
    }
    this.engine.setGlobal('transpose', this.store.g.transposeUp ? 1 : this.store.g.transposeDown ? -1 : 0);
    this.store.applyKeyboardMode();
    this.store.syncProgLeds();
    this.surface.refresh();
    this.store.updateDisplay();

    this.bindKeybed();
    this.bindComputerKeyboard();
    this.bindBender();
    this.initMIDI();
  }

  // --- note handling -------------------------------------------------------

  noteOn(note, velocity = 0.8, fromKeybed = false) {
    if (note < 0 || note > 127) return;
    if (this.store.armSplit && fromKeybed) {
      this.store.splitNote = note;
      this.store.armSplit = false;
      this.store.flash(`SPLIT ${noteName(note)}`);
      this.store.persist();
      return;
    }

    this.physical.add(note);

    if (this.store.g.chord && this.chordNotes && this.chordNotes.length) {
      return this.playChord(note);
    }
    if (this.store.g.arpOn) {
      this.arpAdd(note);
      return;
    }
    this.sound(note, velocity);
  }

  noteOff(note) {
    this.physical.delete(note);

    if (this.store.g.chord && this.chordNotes && this.chordNotes.length) {
      return this.releaseChord(note);
    }
    if (this.store.g.arpOn) {
      this.arpRemove(note);
      return;
    }
    if (this.store.g.hold) { this.heldByHold.add(note); return; }
    this.unsound(note);
  }

  sound(note, velocity = 0.8) {
    for (const layer of this.store.layersForNote(note)) this.engine.noteOn(note, velocity, layer);
    this.sounding.add(note);
    this.surface.setKeyDown(note, true);
  }

  unsound(note) {
    for (const layer of this.store.layersForNote(note)) this.engine.noteOff(note, layer);
    this.sounding.delete(note);
    this.surface.setKeyDown(note, false);
  }

  releaseHeld() {
    for (const n of [...this.heldByHold]) if (!this.physical.has(n)) this.unsound(n);
    this.heldByHold.clear();
  }

  panic() {
    for (const n of [...this.sounding]) this.surface.setKeyDown(n, false);
    this.sounding.clear();
    this.physical.clear();
    this.heldByHold.clear();
    this.engine.panic();
  }

  // --- CHORD ("unison chord") ---------------------------------------------
  // The manual builds this from HOLD + RESET: a held chord is captured, then
  // each new key replays it transposed by that key's distance above the
  // lowest note of the keyboard.
  chordChanged(on) {
    if (on) {
      const held = [...this.sounding].sort((a, b) => a - b);
      this.chordNotes = held.length ? held : null;
      if (!this.chordNotes) this.store.flash('HOLD A CHORD');
      else this.store.flash(`CHORD ${this.chordNotes.length} NOTES`);
      for (const n of held) this.unsound(n);
      this.heldByHold.clear();
    } else {
      this.chordNotes = null;
      this.panic();
    }
  }

  playChord(root) {
    // "the chord previously held will sound, transposed by the amount that
    //  the played note is above the lowest note on the keyboard"
    const offset = root - KEY_RANGE.first;
    this.chordVoices = this.chordVoices || new Map();
    const transposed = this.chordNotes.map((n) => n + offset);
    this.chordVoices.set(root, transposed);
    for (const n of transposed) this.sound(n, 0.8);
    this.surface.setKeyDown(root, true);
  }

  releaseChord(root) {
    const transposed = this.chordVoices?.get(root);
    if (!transposed) return;
    this.chordVoices.delete(root);
    if (this.store.g.hold) return;
    for (const n of transposed) this.unsound(n);
    this.surface.setKeyDown(root, false);
  }

  // --- arpeggiator ---------------------------------------------------------

  arpChanged() {
    if (!this.store.g.arpOn) {
      this.stopArp();
      if (!this.store.g.arpHold) this.arpNotes = [];
      return;
    }
    this.startArp();
  }

  arpAdd(note) {
    if (!this.arpNotes.includes(note)) this.arpNotes.push(note);
    this.surface.setKeyDown(note, true);
    this.startArp();
  }

  arpRemove(note) {
    if (this.store.g.arpHold) return;
    this.arpNotes = this.arpNotes.filter((n) => n !== note);
    this.surface.setKeyDown(note, false);
    if (!this.arpNotes.length) this.stopArp();
  }

  startArp() {
    if (this.arpTimer || !this.store.g.arpOn) return;
    const tick = () => {
      const rate = 0.5 + this.store.g.arpRate * 15;
      this.arpTimer = setTimeout(tick, 1000 / rate);
      this.arpStep();
    };
    tick();
  }

  stopArp() {
    clearTimeout(this.arpTimer);
    this.arpTimer = null;
    if (this.arpCurrent !== null) { this.unsound(this.arpCurrent); this.arpCurrent = null; }
    for (const n of this.arpNotes) this.surface.setKeyDown(n, false);
  }

  arpStep() {
    if (this.arpCurrent !== null) { this.unsound(this.arpCurrent); this.arpCurrent = null; }
    if (!this.arpNotes.length) return;

    const g = this.store.g;
    let seq = [...this.arpNotes];
    if (!g.arpKbd) seq.sort((a, b) => a - b);
    if (g.arpUp && g.arpDown) {
      // up then down, without repeating the turning points
      const down = [...seq].reverse().slice(1, -1);
      seq = seq.concat(down);
    } else if (g.arpDown && !g.arpUp) {
      seq.reverse();
    }
    this.arpIndex = (this.arpIndex + 1) % seq.length;
    const note = seq[this.arpIndex];
    this.sound(note, 0.9);
    this.arpCurrent = note;
  }

  // --- input ---------------------------------------------------------------

  bindKeybed() {
    const keybed = document.getElementById('keybed');
    const noteAt = (target) => {
      const el = target?.closest?.('.key');
      return el ? Number(el.dataset.note) : null;
    };
    let down = false;
    let last = null;

    keybed.addEventListener('pointerdown', (ev) => {
      const n = noteAt(ev.target);
      if (n === null) return;
      ev.preventDefault();
      keybed.setPointerCapture?.(ev.pointerId);
      down = true; last = n;
      this.noteOn(n, velocityFromEvent(ev, ev.target), true);
    });
    keybed.addEventListener('pointermove', (ev) => {
      if (!down) return;
      const n = noteAt(document.elementFromPoint(ev.clientX, ev.clientY));
      if (n === null || n === last) return;
      if (last !== null) this.noteOff(last);
      last = n;
      this.noteOn(n, 0.8, true);
    });
    const up = () => {
      if (!down) return;
      down = false;
      if (last !== null) this.noteOff(last);
      last = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  bindComputerKeyboard() {
    // Two rows of a piano keyboard, plus z / x to shift octave.
    const MAP = {
      KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
      KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
      KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
    };
    const held = new Set();

    window.addEventListener('keydown', (ev) => {
      if (ev.target.matches?.('input, textarea')) return;
      if (ev.code === 'KeyZ' && !ev.repeat) { this.octave = Math.max(-2, this.octave - 1); return; }
      if (ev.code === 'KeyX' && !ev.repeat) { this.octave = Math.min(2, this.octave + 1); return; }
      if (ev.code === 'Escape') { this.panic(); return; }
      const off = MAP[ev.code];
      if (off === undefined || ev.repeat || ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      const note = 60 + this.octave * 12 + off;
      if (held.has(ev.code)) return;
      held.add(ev.code);
      this.noteOn(note, 0.85);
    });

    window.addEventListener('keyup', (ev) => {
      const off = MAP[ev.code];
      if (off === undefined || !held.has(ev.code)) return;
      held.delete(ev.code);
      this.noteOff(60 + this.octave * 12 + off);
    });

    window.addEventListener('blur', () => { held.clear(); this.panic(); });
  }

  bindBender() {
    const bender = this.surface.bender;
    const lever = this.surface.benderLever;
    if (!bender || !lever) return;
    let dragging = false;
    let rect = null;

    const apply = (ev) => {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      const bend = Math.max(-1, Math.min(1, (x - 0.5) * 2.2));
      const mod = Math.max(0, Math.min(1, 1 - y));
      this.engine.setGlobal('bend', bend);
      this.store.g.modDepth = mod;
      this.engine.setGlobal('modDepth', mod);
      this.surface.renderOne('g:modDepth');
      lever.style.transform = `translate(${bend * 26}%, ${(1 - mod) * 18 - 9}%) rotate(${bend * 6}deg)`;
    };

    lever.addEventListener('pointerdown', (ev) => {
      dragging = true;
      rect = bender.getBoundingClientRect();
      lever.setPointerCapture(ev.pointerId);
      apply(ev);
    });
    lever.addEventListener('pointermove', (ev) => { if (dragging) apply(ev); });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      // The pitch lever is spring-loaded back to centre; the mod amount stays.
      this.engine.setGlobal('bend', 0);
      const mod = this.store.g.modDepth;
      lever.style.transform = `translate(0%, ${(1 - mod) * 18 - 9}%)`;
    };
    lever.addEventListener('pointerup', release);
    lever.addEventListener('pointercancel', release);
  }

  async initMIDI() {
    if (!navigator.requestMIDIAccess) return;
    let access;
    try { access = await navigator.requestMIDIAccess(); } catch { return; }

    const attach = (input) => {
      input.onmidimessage = (ev) => this.onMIDI(ev.data);
      this.midiName = input.name || 'MIDI in';
      this.store.updateDisplay();
    };
    for (const input of access.inputs.values()) attach(input);
    access.onstatechange = (ev) => {
      if (ev.port.type === 'input' && ev.port.state === 'connected') attach(ev.port);
    };
  }

  onMIDI(data) {
    const status = data[0] & 0xf0;
    if (status === 0x90 && data[2] > 0) this.noteOn(data[1], data[2] / 127);
    else if (status === 0x80 || (status === 0x90 && data[2] === 0)) this.noteOff(data[1]);
    else if (status === 0xd0) this.engine.pressure(data[1] / 127);
    else if (status === 0xa0) this.engine.pressure(data[2] / 127);
    else if (status === 0xe0) {
      const value = ((data[2] << 7) | data[1]) / 8192 - 1;
      this.engine.setGlobal('bend', value);
    } else if (status === 0xb0) {
      if (data[1] === 1) { // mod wheel
        this.store.g.modDepth = data[2] / 127;
        this.engine.setGlobal('modDepth', this.store.g.modDepth);
        this.surface.renderOne('g:modDepth');
      } else if (data[1] === 123 || data[1] === 120) {
        this.panic();
      }
    }
  }
}

function velocityFromEvent(ev, target) {
  // Striking lower down a key gives a higher velocity, like a real keybed.
  const el = target?.closest?.('.key');
  if (!el) return 0.8;
  const r = el.getBoundingClientRect();
  const y = (ev.clientY - r.top) / r.height;
  return Math.max(0.15, Math.min(1, 0.35 + y * 0.75));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(n) { return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`; }

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const app = new App();
window.obx = app; // handy for debugging and for the headless smoke test

const bootBtn = document.getElementById('boot-btn');
bootBtn?.addEventListener('click', async () => {
  bootBtn.disabled = true;
  bootBtn.textContent = 'Tuning…';
  try {
    await app.boot();
    document.getElementById('boot').hidden = true;
    document.getElementById('obx').hidden = false;
  } catch (err) {
    bootBtn.disabled = false;
    bootBtn.textContent = 'Power On';
    console.error(err);
    alert(`Could not start the audio engine: ${err.message}`);
  }
});

export { App, Store, Engine, app };
