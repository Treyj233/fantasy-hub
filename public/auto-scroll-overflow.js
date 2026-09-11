(() => {
  // Keep React-owned text intact. Sunday Pulse retains its dedicated animation.
  const tracked = new Map();
  const interactive = 'button,a,input,select,textarea,[role="button"],[role="link"]';
  let timer, active, popup;
  const dismiss = () => { popup?.remove(); popup = active = undefined; };
  const eligible = el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 3 &&
    (getComputedStyle(el).textOverflow === 'ellipsis' || el.hasAttribute('data-overflow-label')) &&
    !el.closest('.sunday-pulse,[data-overflow-popup]');
  const reveal = el => {
    if (!eligible(el)) return;
    dismiss();
    active = el;
    popup = document.createElement('div');
    popup.dataset.overflowPopup = '';
    popup.className = 'fh-overflow-popover';
    popup.setAttribute('role', 'tooltip');
    popup.textContent = el.textContent.trim();
    popup.setAttribute('popover', 'manual');
    document.body.append(popup);
    popup.showPopover?.();
    const rect = el.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const style = getComputedStyle(popup);
    const safeTop = Math.max(12, parseFloat(style.getPropertyValue('--reveal-safe-top')) || 0);
    const safeBottom = Math.max(12, parseFloat(style.getPropertyValue('--reveal-safe-bottom')) || 0);
    popup.style.maxWidth = Math.min(360, Math.max(0, width - 32)) + 'px';
    popup.style.maxHeight = Math.max(0, height - safeTop - safeBottom) + 'px';
    const box = popup.getBoundingClientRect();
    popup.style.left = Math.max(left + 16, Math.min(rect.left, left + width - box.width - 16)) + 'px';
    const y = rect.bottom + 8 + box.height <= top + height - safeBottom ? rect.bottom + 8 : rect.top - box.height - 8;
    popup.style.top = Math.max(top + safeTop, Math.min(y, top + height - safeBottom - box.height)) + 'px';
  };
  const scan = () => {
    for (const [el, owned] of tracked) {
      if (!el.isConnected || !eligible(el)) {
        if (owned) { el.removeAttribute('tabindex'); el.removeAttribute('role'); }
        el.removeAttribute('data-overflow-reveal');
        tracked.delete(el);
        if (active === el) dismiss();
      }
    }
    document.querySelectorAll('.app-shell').forEach(root => {
      root.querySelectorAll('span,strong,b,small,p,h1,h2,h3,h4,button,a,td,label').forEach(el => {
        if (el.childElementCount || !eligible(el) || tracked.has(el)) return;
        const owned = !el.closest(interactive) && !el.hasAttribute('tabindex');
        if (owned) { el.tabIndex = 0; el.setAttribute('role', 'button'); }
        el.dataset.overflowReveal = '';
        tracked.set(el, owned);
      });
    });
    if (active && popup && popup.textContent !== active.textContent.trim()) reveal(active);
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 160); };
  const target = event => event.target instanceof Element ? event.target.closest('[data-overflow-reveal]') : null;
  document.addEventListener('pointerover', event => {
    const el = target(event);
    if (event.pointerType === 'mouse' && el && el !== active) reveal(el);
  });
  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'mouse' && active && !active.contains(event.relatedTarget) && !popup?.contains(event.relatedTarget)) dismiss();
  });
  document.addEventListener('focusin', event => {
    const el = target(event) || event.target.querySelector?.('[data-overflow-reveal]');
    if (el) reveal(el);
  });
  document.addEventListener('focusout', dismiss);
  document.addEventListener('click', event => {
    const el = target(event);
    // Never consume existing button/link navigation.
    if (el && tracked.get(el)) reveal(el);
    else if (!popup?.contains(event.target)) dismiss();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismiss();
    const el = target(event);
    if (el && tracked.get(el) && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); reveal(el);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (active && !active.contains(event.target) && !popup?.contains(event.target)) dismiss();
  });
  document.addEventListener('scroll', event => { if (!popup?.contains(event.target)) dismiss(); }, true);
  window.addEventListener('resize', () => { dismiss(); schedule(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', dismiss);
  document.addEventListener('visibilitychange', dismiss);
  new MutationObserver(records => {
    if (records.some(record => (record.target instanceof Element ? record.target : record.target.parentElement)?.closest('.app-shell'))) schedule();
  }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  new ResizeObserver(schedule).observe(document.documentElement);
  document.fonts?.ready.then(schedule);
  schedule();
})();
