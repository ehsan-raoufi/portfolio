(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const canFinePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;

  if (canFinePointer) root.classList.add("fine-pointer");

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const deviceMemory = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;
  const hardwareConcurrency = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;

  const lowDevice =
    (deviceMemory !== null && deviceMemory <= 4) || (hardwareConcurrency !== null && hardwareConcurrency <= 4);

  const getStoredFx = () => {
    try {
      return localStorage.getItem("fx");
    } catch {
      return null;
    }
  };

  const setStoredFx = (mode) => {
    try {
      localStorage.setItem("fx", mode);
    } catch {
      // ignore
    }
  };

  const resolveInitialFx = () => {
    if (reduceMotion) return "lite";
    const stored = getStoredFx();
    if (stored === "lite" || stored === "full") return stored;
    if (saveData || lowDevice) return "lite";
    return "full";
  };

  const setFxMode = (mode) => {
    root.dataset.fx = mode;
    setStoredFx(mode);
    syncFxButton();
    syncRuntimeEffects();
  };

  // Footer year.
  for (const el of document.querySelectorAll("[data-year]")) {
    el.textContent = String(new Date().getFullYear());
  }

  // Reveal on scroll (cheap: opacity + transform only).
  const revealEls = Array.from(document.querySelectorAll(".reveal"));
  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      for (const el of revealEls) el.classList.add("is-in");
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        },
        { threshold: 0.12 },
      );

      for (const el of revealEls) io.observe(el);
    }
  }

  // FX toggle.
  const fxBtn = document.querySelector("[data-fx-toggle]");
  const syncFxButton = () => {
    if (!fxBtn) return;
    const mode = root.dataset.fx === "full" ? "full" : "lite";
    fxBtn.textContent = mode === "full" ? "Effects: Full" : "Effects: Lite";
    fxBtn.setAttribute("aria-pressed", mode === "full" ? "true" : "false");
  };

  // Mobile nav toggle.
  const topbar = document.querySelector("[data-topbar]");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("primary-nav");
  const mobileNavMq = window.matchMedia?.("(max-width: 980px)");

  const setNavOpen = (open) => {
    if (!topbar || !navToggle) return;
    if (open) topbar.dataset.navOpen = "true";
    else delete topbar.dataset.navOpen;

    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.textContent = open ? "Close" : "Menu";
  };

  const isMobileNav = () => Boolean(mobileNavMq?.matches);
  const isNavOpen = () => topbar?.dataset.navOpen === "true";

  if (navToggle && topbar) {
    navToggle.addEventListener("click", () => {
      if (!isMobileNav()) return;
      setNavOpen(!isNavOpen());
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!isNavOpen()) return;
      setNavOpen(false);
    });

    document.addEventListener("pointerdown", (e) => {
      if (!isNavOpen()) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (topbar.contains(target)) return;
      setNavOpen(false);
    });

    if (nav) {
      nav.addEventListener("click", (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        if (isMobileNav()) setNavOpen(false);
      });
    }

    if (mobileNavMq?.addEventListener) {
      mobileNavMq.addEventListener("change", () => setNavOpen(false));
    } else if (mobileNavMq?.addListener) {
      mobileNavMq.addListener(() => setNavOpen(false));
    }
  }

  // Scroll spy for nav links.
  const navLinks = Array.from(document.querySelectorAll('#primary-nav a.nav__link[href^="#"]'));
  const linkById = new Map();
  for (const link of navLinks) {
    const id = link.getAttribute("href")?.slice(1);
    if (!id) continue;
    linkById.set(id, link);
  }

  const setActiveNav = (id) => {
    for (const link of navLinks) link.classList.remove("is-active");
    const active = linkById.get(id);
    if (active) active.classList.add("is-active");
  };

  const syncActiveFromHash = () => {
    const id = window.location.hash ? window.location.hash.slice(1) : "";
    if (id && linkById.has(id)) setActiveNav(id);
  };

  syncActiveFromHash();
  window.addEventListener("hashchange", syncActiveFromHash, { passive: true });

  if ("IntersectionObserver" in window && linkById.size) {
    const ratioById = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratioById.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestId = "";
        let bestRatio = 0;
        for (const [id, ratio] of ratioById) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (bestId) setActiveNav(bestId);
      },
      { threshold: [0.12, 0.22, 0.35, 0.5, 0.7], rootMargin: "-15% 0px -60% 0px" },
    );

    for (const id of linkById.keys()) {
      const section = document.getElementById(id);
      if (!section) continue;
      ratioById.set(id, 0);
      io.observe(section);
    }
  }

  if (fxBtn) {
    fxBtn.addEventListener("click", () => {
      const current = root.dataset.fx === "full" ? "full" : "lite";
      setFxMode(current === "full" ? "lite" : "full");
    });
  }

  // Spotlight (moves via transform; no layout).
  const spotlight = document.querySelector("[data-spotlight]");
  const spotlightSize = 620;
  let spotlightRaf = 0;
  let spotlightX = -2000;
  let spotlightY = -2000;

  const onSpotlightMove = (e) => {
    spotlightX = e.clientX - spotlightSize / 2;
    spotlightY = e.clientY - spotlightSize / 2;
    if (spotlightRaf) return;
    spotlightRaf = window.requestAnimationFrame(() => {
      if (!spotlight) return;
      spotlight.style.transform = `translate3d(${spotlightX}px, ${spotlightY}px, 0)`;
      spotlightRaf = 0;
    });
  };

  const enableSpotlight = () => {
    if (!spotlight) return;
    window.addEventListener("pointermove", onSpotlightMove, { passive: true });
  };

  const disableSpotlight = () => {
    if (!spotlight) return;
    window.removeEventListener("pointermove", onSpotlightMove);
    spotlight.style.transform = "translate3d(-2000px, -2000px, 0)";
  };

  // Tilt (only in full + fine pointer).
  const tiltEls = Array.from(document.querySelectorAll("[data-tilt]"));
  const tiltCleanups = [];

  const enableTilt = () => {
    if (!tiltEls.length) return;
    for (const el of tiltEls) {
      const strengthAttr = el.getAttribute("data-tilt-strength");
      const strength = strengthAttr ? Number.parseFloat(strengthAttr) : 10;
      const maxDeg = Number.isFinite(strength) ? Math.max(4, Math.min(18, strength)) : 10;

      const onMove = (e) => {
        const rect = el.getBoundingClientRect();
        const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
        const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);
        const px = rect.width ? x / rect.width : 0.5;
        const py = rect.height ? y / rect.height : 0.5;

        const ry = (px - 0.5) * (maxDeg * 2);
        const rx = (0.5 - py) * (maxDeg * 2);

        el.style.transition = "transform 0ms";
        el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
        el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      };

      const onLeave = () => {
        el.style.transition = "transform 220ms ease";
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      };

      el.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerleave", onLeave, { passive: true });

      tiltCleanups.push(() => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      });
    }
  };

  const disableTilt = () => {
    for (const cleanup of tiltCleanups.splice(0, tiltCleanups.length)) cleanup();
    for (const el of tiltEls) {
      el.style.transition = "";
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    }
  };

  const syncRuntimeEffects = () => {
    const mode = root.dataset.fx === "full" ? "full" : "lite";
    const enable = mode === "full" && canFinePointer && !reduceMotion;

    if (enable) {
      enableSpotlight();
      enableTilt();
      return;
    }

    disableSpotlight();
    disableTilt();
  };

  // Start in a safe mode first, then resolve.
  root.dataset.fx = "lite";
  setFxMode(resolveInitialFx());
})();
