/**
 * Guided focus for /demo only: dark scrim + warm highlight + explanation box.
 */
(() => {
  const BAR_SELECTOR = "#demo-bar";
  let root;
  let hole;
  let explain;
  let currentGuide = null;
  let rafId = 0;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function padRect(r, p = 8) {
    return {
      left: Math.max(0, r.left - p),
      top: Math.max(0, r.top - p),
      width: r.width + p * 2,
      height: r.height + p * 2,
      right: r.right + p,
      bottom: r.bottom + p,
    };
  }

  function unionRects(list) {
    const ok = list.filter(Boolean);
    if (!ok.length) return null;
    const left = Math.min(...ok.map((r) => r.left));
    const top = Math.min(...ok.map((r) => r.top));
    const right = Math.max(...ok.map((r) => r.right ?? r.left + r.width));
    const bottom = Math.max(...ok.map((r) => r.bottom ?? r.top + r.height));
    return { left, top, width: right - left, height: bottom - top, right, bottom };
  }

  function rectForTarget(t) {
    if (t.type === "el") {
      const el = document.querySelector(t.selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) return null;
      return padRect(r, t.pad ?? 8);
    }
    if (t.type === "canvas") {
      const c = document.getElementById("scene");
      if (!c) return null;
      const bar = document.querySelector(BAR_SELECTOR)?.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      const top = Math.max(r.top, (bar?.bottom ?? 0) + 4);
      return padRect(
        { left: r.left, top, width: r.width, height: r.bottom - top, right: r.right, bottom: r.bottom },
        t.pad ?? 16
      );
    }
    if (t.type === "seat") {
      const p = window.__dining?.projectSeat?.(t.seatId);
      if (!p || p.behind) return null;
      const r = t.pad ?? 52;
      return {
        left: p.x - r,
        top: p.y - r * 1.2,
        width: r * 2,
        height: r * 2.2,
        right: p.x + r,
        bottom: p.y + r,
      };
    }
    return null;
  }

  function barBottom() {
    return document.querySelector(BAR_SELECTOR)?.getBoundingClientRect().bottom ?? 72;
  }

  function layoutExplain(rect) {
    if (!explain || !rect) return;
    const w = Math.min(300, innerWidth - 24);
    explain.style.width = `${w}px`;
    const margin = 14;
    let left = rect.right + margin;
    let top = Math.max(barBottom() + 10, rect.top);
    if (left + w > innerWidth - 12) {
      left = rect.left - w - margin;
    }
    if (left < 12) left = 12;
    const eh = explain.offsetHeight || 120;
    if (top + eh > innerHeight - 12) top = Math.max(barBottom() + 10, innerHeight - eh - 12);
    explain.style.left = `${Math.round(left)}px`;
    explain.style.top = `${Math.round(top)}px`;
  }

  function applyRect(rect) {
    if (!hole || !root) return;
    if (!rect) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    const insetTop = barBottom();
    if (rect.top < insetTop) {
      const cut = insetTop - rect.top;
      rect = { ...rect, top: insetTop, height: Math.max(24, rect.height - cut) };
    }
    hole.style.left = `${Math.round(rect.left)}px`;
    hole.style.top = `${Math.round(rect.top)}px`;
    hole.style.width = `${Math.round(Math.max(24, rect.width))}px`;
    hole.style.height = `${Math.round(Math.max(24, rect.height))}px`;
    layoutExplain(rect);
  }

  function measureGuide(guide) {
    if (!guide?.targets?.length) return null;
    const rects = guide.targets.map(rectForTarget);
    return unionRects(rects);
  }

  function frame() {
    if (!currentGuide) return;
    applyRect(measureGuide(currentGuide));
    rafId = requestAnimationFrame(frame);
  }

  function stopFrame() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function showGuide(guide) {
    stopFrame();
    currentGuide = guide || null;
    if (!root || !explain) return;
    if (!guide) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("demo-guided");
      return;
    }
    document.body.classList.add("demo-guided");
    explain.querySelector("[data-head]").textContent = guide.headline || "Watch this";
    explain.querySelector("[data-body]").textContent = guide.body || "";
    const rect = measureGuide(guide);
    applyRect(rect);
    const needsTrack = guide.targets.some((t) => t.type === "seat" || t.type === "canvas");
    if (needsTrack && !reduced()) frame();
    else if (needsTrack && reduced()) applyRect(measureGuide(guide));
  }

  function hideGuide() {
    document.body.classList.remove("demo-guided");
    showGuide(null);
  }

  function onResize() {
    if (currentGuide) applyRect(measureGuide(currentGuide));
  }

  function initSpotlight() {
    root = document.getElementById("demo-focus");
    hole = root?.querySelector(".demo-spotlight-hole");
    explain = root?.querySelector(".demo-explain");
    window.addEventListener("resize", onResize, { passive: true });
    window.__demoShowGuide = showGuide;
    window.__demoHideGuide = hideGuide;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSpotlight);
  } else {
    initSpotlight();
  }
})();
