import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('marquee sleeps offscreen and hidden, preserves first/repeat pauses, and avoids frame loops', () => {
  const animations = [];
  const listeners = {};
  let intersections;
  class Element {
    constructor() {
      this.isConnected = true; this.clientWidth = 100; this.scrollWidth = 240;
      this.children = []; this.textContent = 'A long fantasy league name'; this.style = {};
      const classes = new Set();
      this.classList = { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x) };
    }
    get childElementCount() { return this.children.length; }
    closest() { return null; }
    getBoundingClientRect() { return { width: 240 }; }
    setAttribute() {}
    hasAttribute() { return false; }
    append(...children) { this.children.push(...children); children.forEach(child => { child.parentElement = this; }); }
    querySelectorAll() { return []; }
    animate(frames, options) {
      const animation = { frames, options, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; }, cancel() { this.playState = 'idle'; } };
      animations.push(animation); return animation;
    }
  }
  const label = new Element();
  const root = new Element(); root.clientWidth = 0; root.querySelectorAll = () => [label];
  const document = {
    documentElement: root, body: root, visibilityState: 'visible',
    querySelector: () => root, createElement: () => new Element(),
    addEventListener: (event, callback) => { listeners[event] = callback; },
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ textOverflow: 'ellipsis', paddingLeft: '24' }),
    setTimeout: () => 1, clearTimeout() {},
    addEventListener: (event, callback) => { listeners[event] = callback; },
    requestAnimationFrame: () => assert.fail('No continuous JS frame loop should be scheduled'),
  };
  vm.runInNewContext(readFileSync(new URL('../public/auto-scroll-overflow.js', import.meta.url), 'utf8'), {
    window, document, Element, HTMLElement: Element, getComputedStyle: window.getComputedStyle,
    IntersectionObserver: class { constructor(callback) { intersections = callback; } observe() {} unobserve() {} },
    MutationObserver: class { observe() {} },
  });
  listeners.load();
  assert.equal(animations.length, 1);
  assert.equal(animations[0].options.delay, 5000);
  assert.equal(animations[0].playState, 'paused');
  intersections([{ target: label, isIntersecting: true }]);
  assert.equal(animations[0].playState, 'running');
  document.visibilityState = 'hidden'; listeners.visibilitychange();
  assert.equal(animations[0].playState, 'paused');
  document.visibilityState = 'visible'; listeners.visibilitychange();
  animations[0].onfinish();
  const repeat = animations[1];
  assert.equal(repeat.options.iterations, Infinity);
  assert.equal(repeat.frames[1].offset * repeat.options.duration, 20000);
  intersections([{ target: label, isIntersecting: false }]);
  assert.equal(repeat.playState, 'paused');
});
