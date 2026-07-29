/* ==========================================================================
   HISTOIRE — premium motion layer
   --------------------------------------------------------------------------
   Adds Dior/LV/Apple-style micro-interactions on top of the existing site
   WITHOUT touching colors, typography, layout, spacing, branding, or the
   product-card markup. Pure enhancement layer — if GSAP/Lenis fail to load,
   or the user prefers reduced motion, the site falls back to its normal,
   fully-functional, static state.

   Libraries used: GSAP + ScrollTrigger, Lenis (smooth scroll).
   Framer Motion is intentionally NOT used here — it is a React library and
   this storefront is plain HTML/CSS/JS, so it has no effect in this stack.
   GSAP covers the same spring/easing needs for a vanilla site.
   ========================================================================== */
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // graceful degradation: ship the site as-is, no JS motion added

  function init() {
    if (typeof gsap === 'undefined') return; // CDN failed to load — fail silently, site still works
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    /* ---------------- Lenis smooth scroll ---------------- */
    if (typeof Lenis !== 'undefined') {
      const lenis = new Lenis({
        duration: 1.1,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
      });
      lenis.on('scroll', () => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.update(); });
      gsap.ticker.add((time) => { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      window.__lenis = lenis;
    }

    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');

    /* ---------------- product card: entrance (fade + rise + scale) -------- */
    function animateCardIn(card) {
      if (card.dataset.mFadeIn) return;
      card.dataset.mFadeIn = '1';
      gsap.fromTo(card,
        { opacity: 0, y: 36, scale: 0.95 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out',
          scrollTrigger: { trigger: card, start: 'top 92%', once: true }
        });
    }

    /* ---------------- product card: stage parallax (moves independently of card) */
    /* Disabled: moving .pc-stage's own transform independently of the card's
       layout caused a visible white gap to open up beneath it during scroll
       (the card clips overflow, and .pc-stage's translateY briefly left its
       laid-out slot, exposing the card's plain white background instead of
       the product photo/backdrop). The effect was purely decorative, so it's
       removed rather than compensated for. */
    function animateParallax(card) {
      return;
    }

    /* ---------------- product card: continuous gentle float --------------- */
    /* Disabled per request — product images should stay static/still,
       no continuous up-down bobbing motion. */
    function animateFloat(card) {
      return;
    }

    /* ---------------- product card: quiet hover lift (desktop + touch) ---- */
    /* Replaces the previous 3D tilt + roaming glow + elastic bounce. A
       calm, single-value lift/scale reads as confident rather than "look
       at me" — closer to how Dior/Apple product cards behave. */
    function attachTilt(card) {
      if (card.dataset.mTilt) return;
      card.dataset.mTilt = '1';

      if (mq.matches) {
        card.addEventListener('mouseenter', () => {
          gsap.to(card, { y: -4, scale: 1.015, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
        });
        card.addEventListener('mouseleave', () => {
          gsap.to(card, { y: 0, scale: 1, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
        });
      }

      // Touch: a small, quick settle on tap — no bounce, no overshoot.
      card.addEventListener('touchstart', () => {
        card.classList.add('m-touch-active');
        gsap.killTweensOf(card);
        gsap.to(card, { scale: 1.015, duration: 0.15, ease: 'power2.out', overwrite: true });
      }, { passive: true });
      const releaseTouch = () => {
        card.classList.remove('m-touch-active');
        gsap.killTweensOf(card);
        gsap.to(card, { scale: 1, duration: 0.15, ease: 'power2.out', overwrite: true });
      };
      card.addEventListener('touchend', releaseTouch, { passive: true });
      card.addEventListener('touchcancel', releaseTouch, { passive: true });
    }

    function scanCards() {
      document.querySelectorAll('.product-card').forEach((card) => {
        animateCardIn(card);
        animateParallax(card);
        animateFloat(card);
        attachTilt(card);
      });
    }
    scanCards();
    const grid = document.getElementById('shop-grid');
    if (grid) new MutationObserver(scanCards).observe(grid, { childList: true });

    /* ---------------- buttons: soft lift + scale (spring) ------------------ */
    function attachButtonMotion(btn) {
      if (btn.dataset.mBtn) return;
      btn.dataset.mBtn = '1';
      btn.addEventListener('mouseenter', () => gsap.to(btn, { y: -1, scale: 1.015, duration: 0.3, ease: 'power2.out' }));
      btn.addEventListener('mouseleave', () => gsap.to(btn, { y: 0, scale: 1, duration: 0.3, ease: 'power2.out' }));
      btn.addEventListener('mousedown', () => gsap.to(btn, { scale: 0.98, duration: 0.15 }));
      btn.addEventListener('mouseup', () => gsap.to(btn, { scale: 1.015, duration: 0.2 }));
    }
    function scanButtons() {
      if (!mq.matches) return;
      document.querySelectorAll('.pc-action-btn, .checkout-btn, .pp-order-btn, .pp-cart-btn, .sf-btn, .add-cart')
        .forEach(attachButtonMotion);
    }
    scanButtons();
    new MutationObserver(scanButtons).observe(document.body, { childList: true, subtree: true });

    /* ---------------- hero banner: float + parallax + golden shine -------- */
    function setupHero() {
      const frame = document.querySelector('.hero-banner-frame');
      if (!frame || frame.dataset.mHero) return;
      frame.dataset.mHero = '1';

      // The idle "float" bob and the golden shine sweep were purely decorative,
      // continuous (repeat: -1) attention-grabbers — removed in favor of a
      // still, confident hero image (closer to how Dior/Apple present a
      // hero shot: it doesn't need to keep moving to hold attention).

      // Scroll-linked parallax is cheap (driven by scroll position, not a
      // free-running ticker) and stays enabled on all devices.
      if (typeof ScrollTrigger !== 'undefined') {
        gsap.to(frame, {
          yPercent: 3, ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top top', end: 'bottom top', scrub: 0.6 }
        });
      }
    }
    setupHero();
    const heroContent = document.getElementById('hero-banner-content');
    if (heroContent) new MutationObserver(setupHero).observe(heroContent, { childList: true });

    /* ---------------- pack banner CTA: one-time shine on first appearance -- */
    /* This is the one spot where a shine sweep stays: "Découvrir le pack" is
       a promotional CTA (not a regular product), so a single pass the moment
       it enters view is a reasonable attention cue. It fires once per page
       load and does not loop, unlike the old always-on sweep. */
    function afterSplash(cb) {
      const splash = document.getElementById('splash-screen');
      if (!splash || splash.classList.contains('splash-done')) { cb(); return; }
      const obs = new MutationObserver(() => {
        if (splash.classList.contains('splash-done')) { obs.disconnect(); cb(); }
      });
      obs.observe(splash, { attributes: true, attributeFilter: ['class'] });
      // Safety net in case the splash's own cleanup listener never fires.
      setTimeout(() => { obs.disconnect(); cb(); }, 2200);
    }
    function watchPackCtaShine() {
      const cta = document.getElementById('pack4-banner-cta');
      if (!cta || cta.dataset.mShineWatched) return;
      cta.dataset.mShineWatched = '1';
      afterSplash(() => {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              cta.classList.add('cta-shine-once');
              io.disconnect();
            }
          });
        }, { threshold: 0.4 });
        io.observe(cta);
      });
    }
    watchPackCtaShine();
    const packBannerImage = document.getElementById('pack4-banner-image');
    if (packBannerImage) new MutationObserver(watchPackCtaShine).observe(packBannerImage.parentElement || document.body, { childList: true, subtree: true });

    /* ---------------- first two products: reveal right after splash ------- */
    /* Per request: the first two product cards (top of the shop grid) should
       play their fade+rise entrance the instant the splash screen ends,
       instead of waiting for the user to scroll them into view. Everything
       else in the grid keeps the normal scroll-triggered reveal. */
    function revealFirstProductsNow() {
      const grid = document.getElementById('shop-grid');
      if (!grid) return false;
      const cards = Array.prototype.slice.call(grid.querySelectorAll('.product-card'), 0, 2);
      if (!cards.length) return false;
      cards.forEach((card) => {
        if (card.dataset.mEarlyReveal) return;
        card.dataset.mEarlyReveal = '1';
        card.dataset.mFadeIn = '1'; // stop the normal scroll-triggered GSAP reveal from also running on this card
        // Stop the CSS ".reveal" scroll system from handling this card too —
        // it's being revealed immediately rather than on scroll.
        if (typeof scrollRevealObserver !== 'undefined' && scrollRevealObserver) {
          try { scrollRevealObserver.unobserve(card); } catch (e) {}
        }
        card.classList.add('active'); // instantly satisfies the CSS .reveal end-state; GSAP below drives the actual visible entrance
        gsap.fromTo(card,
          { opacity: 0, y: 36, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
      });
      return true;
    }
    function watchFirstProducts() {
      afterSplash(function () {
        if (revealFirstProductsNow()) return;
        const grid = document.getElementById('shop-grid');
        if (!grid) return;
        const obs = new MutationObserver(function () {
          if (revealFirstProductsNow()) obs.disconnect();
        });
        obs.observe(grid, { childList: true });
        setTimeout(function () { obs.disconnect(); }, 8000); // safety net if products never load
      });
    }
    watchFirstProducts();

    /* ---------------- luxury marketing sections: fade-in on scroll -------- */
    /* Disabled: this used to fade in the whole .lux-reveal *wrapper* around
       FAQ/Contact, but that duplicated and conflicted with the per-item
       CSS ".reveal" animation already used on their individual children
       (and on product cards). The wrapper would still be invisible when
       an inner item's own reveal fired, so the item appeared instantly/
       un-animated the moment the wrapper caught up. Removed in favor of
       letting each item handle its own reveal, consistently site-wide. */
    
  }

  if (document.readyState === 'complete') setTimeout(init, 0);
  else window.addEventListener('load', init);
})();

/* ==========================================================================
   Luxury splash screen cleanup — the fade in/hold/fade out timing is fully
   driven by the #splash-screen CSS animation (1.3s total). This just removes
   the overlay from the DOM once that animation ends, so it never blocks
   scrolling or taps on the homepage underneath. If reduced motion is set,
   the CSS already hides #splash-screen immediately, so there is nothing to
   clean up here in that case.
   ========================================================================== */
(function () {
  const splash = document.getElementById('splash-screen');
  const logo = splash ? splash.querySelector('.splash-logo') : null;
  if (!splash || !logo) return;
  logo.addEventListener('animationend', function () {
    splash.classList.add('splash-done');
  });
  // Fallback in case this script runs late (e.g. deferred) and the
  // animationend event already fired before the listener was attached.
  setTimeout(function () { splash.classList.add('splash-done'); }, 1900);
})();
