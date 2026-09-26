const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function router(initial = 'overview') {
  const listeners = {}, documentListeners = {}, intervals = new Map();
  let timerId = 0, running = false, sample = 0;
  const headings = Object.fromEntries(['overview', 'data', 'algorithm', 'decision', 'institution', 'report'].map(view => [view, {
    attributes: {},
    hasAttribute(key) { return key in this.attributes; },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { document.activeElement = this; }
  }]));
  const next = { dataset: {} };
  const tourButton = { setAttribute(key, value) { this[key] = value; } };
  const document = {
    readyState: 'complete', body: { dataset: {} }, documentElement: {}, activeElement: null,
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector.includes('[data-scene="tour"]')) return tourButton;
      const match = selector.match(/data-view="([a-z]+)"/);
      return match ? headings[match[1]] : null;
    },
    getElementById(id) { return id === 'pipelineNext' ? next : null; },
    addEventListener(type, callback) { (documentListeners[type] ||= []).push(callback); }
  };
  const window = {
    document, location: { hash: '#/' + initial }, scrollTo() {},
    QJZH: { simulatorControl: { stop() { running = false; }, restart() { if (!running) { running = true; sample = 0; } } } },
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach(callback => callback(event)); },
    setInterval(callback, delay) { const id = ++timerId; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); }
  };
  const context = vm.createContext({ window, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewRouter.js'), 'utf8'), context);
  return { window, document, headings, next, tourButton, intervals, documentListeners,
    navigate(view) { window.location.hash = '#/' + view; window.dispatchEvent({ type: 'hashchange' }); },
    tick() { if (running) sample++; return sample; },
    advanceTour() { for (const timer of [...intervals.values()]) timer.callback(); window.dispatchEvent({ type: 'hashchange' }); }
  };
}

test('leaving overview freezes replay and returning starts from the first sample', () => {
  const app = router();
  assert.equal(app.tick(), 1);
  assert.equal(app.tick(), 2);
  app.navigate('institution');
  assert.equal(app.tick(), 2);
  app.navigate('overview');
  assert.equal(app.tick(), 1);
});

test('all six routes focus their title, including the data panel title', () => {
  const app = router();
  for (const view of Object.keys(app.headings)) {
    app.navigate(view);
    assert.equal(app.document.activeElement, app.headings[view], view);
    assert.equal(app.headings[view].attributes.tabindex, '-1');
  }
});

test('language changes preserve the language control focus and replay progress', () => {
  const app = router();
  app.tick();
  const languageControl = {};
  app.document.activeElement = languageControl;
  app.window.dispatchEvent({ type: 'dashboard:language-change' });
  assert.equal(app.document.activeElement, languageControl);
  assert.equal(app.tick(), 2);
});

test('tour visits five modules every four seconds and manual navigation cancels it', () => {
  const app = router();
  assert.equal(typeof app.window.QJZH.viewRouter.startTour, 'function');
  app.window.QJZH.viewRouter.startTour();
  assert.equal(app.window.location.hash, '#/data');
  assert.equal([...app.intervals.values()][0].delay, 4000);
  for (const view of ['algorithm', 'decision', 'institution', 'report', 'data']) {
    app.advanceTour();
    assert.equal(app.window.location.hash, '#/' + view);
  }
  app.window.QJZH.viewRouter.go('overview');
  assert.equal(app.intervals.size, 0);
  assert.equal(app.tourButton['aria-pressed'], 'false');
});

test('starting tour twice leaves only one timer and browser navigation stops it', () => {
  const app = router();
  assert.equal(typeof app.window.QJZH.viewRouter.startTour, 'function');
  app.window.QJZH.viewRouter.startTour();
  app.window.QJZH.viewRouter.startTour();
  assert.equal(app.intervals.size, 1);
  app.navigate('report');
  assert.equal(app.intervals.size, 0);
});

test('changing the header scenario stops an active tour', () => {
  const app = router();
  app.window.QJZH.viewRouter.startTour();
  assert.equal(app.intervals.size, 1);
  app.window.dispatchEvent({ type: 'dashboard:scenario-change' });
  assert.equal(app.intervals.size, 0);
  assert.equal(app.tourButton['aria-pressed'], 'false');
});

test('page title follows initial and changed language, including an initially empty title', () => {
  const events = {};
  const document = { title: '', documentElement: { dataset: { language: 'en' } }, addEventListener() {} };
  const window = { QJZH: {}, addEventListener(type, callback) { events[type] = callback; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ui_interactions.js'), 'utf8'), { window, document });
  assert.equal(document.title, 'Qingjing Zhiheng · Plateau Barn Environment Data Service');
  document.documentElement.dataset.language = 'bo';
  events['dashboard:language-change']();
  assert.match(document.title, /^ཆིངས་ཅིང་ཀྲི་ཧེང་/);
  document.documentElement.dataset.language = 'zh';
  events['dashboard:language-change']();
  assert.equal(document.title, '青境智衡 · 高原圈舍环境数据服务系统');
});
