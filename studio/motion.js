/* Ss Animation — landing motion layer (ADDITIVE ONLY).
   Vanilla JS, no libraries. Tags landing elements with data-motion
   attributes and reveals them once via IntersectionObserver.
   - Never selects anything inside #studioApp, #loginGate, any modal
     (.modal-backdrop) or any editor overlay (.editor-overlay).
   - The only dashboard element touched is the top banner's existing
     cover plates (a slow CSS zoom class); no dashboard control,
     behaviour or playback code is touched.
   - Wrapped in try/catch: any failure removes the js-motion class so
     every element returns to its normal, fully visible state. */
(function () {
  'use strict';
  try {
    /* Reduced motion: do not hide or animate anything at all. */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    /* Hidden states in motion.css apply only under this class, and only
       to elements this script tags below — JS off/failed = all visible. */
    document.documentElement.classList.add('js-motion');

    var STAGGER_MS = 80;

    function tag(el, type, index) {
      el.setAttribute('data-motion', type);
      el.style.setProperty('--motion-delay', (index * STAGGER_MS) + 'ms');
      return el;
    }
    function tagGroup(nodes, type) {
      var out = [];
      Array.prototype.forEach.call(nodes, function (el, i) { out.push(tag(el, type, i)); });
      return out;
    }
    function q(selector) { return document.querySelectorAll(selector); }

    /* --- Hero: staggered fade-up on page load --- */
    var heroItems = tagGroup(
      q('.landing-hero .hero-kicker, .landing-hero .hero-logo, ' +
        '.landing-hero .hero-title, .landing-hero .hero-sub, ' +
        '.landing-hero .hero-cta'),
      'fade-up'
    );
    var heroLogo = document.querySelector('.landing-hero .hero-logo');
    if (heroLogo) { heroLogo.setAttribute('data-motion-float', ''); }

    /* --- Hero stat chips (45 ready characters, Easy + Advanced Mode, …):
           fade-up on scroll, staggered between siblings --- */
    var chips = tagGroup(q('.landing-hero .hero-points li'), 'fade-up');

    /* --- Feature cards: fade-up on scroll, staggered --- */
    var features = tagGroup(q('.feature-grid .feature-card'), 'fade-up');

    /* --- Pricing cards: scale-and-fade on scroll, staggered --- */
    var plans = tagGroup(q('.pricing .plan-card'), 'scale');

    /* --- Footer: simple fade-in on reveal --- */
    var footerItems = tagGroup(q('.footer .footer-links, .footer .footer-inner .muted'), 'fade-up');

    /* --- Top banner plates: slow zoom class only (no reveal/hiding) --- */
    Array.prototype.forEach.call(q('.dash-cover .cover-plate'), function (el) {
      el.setAttribute('data-motion-banner', '');
    });

    var revealTargets = heroItems.concat(chips, features, plans, footerItems);

    function reveal(el) { el.classList.add('in-view'); }

    /* Hero reveals on load (not on scroll), keeping its stagger. */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { heroItems.forEach(reveal); });
    });

    var scrollTargets = chips.concat(features, plans, footerItems);

    if (!('IntersectionObserver' in window)) {
      /* Old browser fallback: show everything immediately. */
      scrollTargets.forEach(reveal);
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target); /* reveal once only */
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      scrollTargets.forEach(function (el) { observer.observe(el); });
    }
  } catch (err) {
    /* A motion failure must never break or hide the page. */
    try {
      document.documentElement.classList.remove('js-motion');
      Array.prototype.forEach.call(
        document.querySelectorAll('[data-motion]'),
        function (el) { el.classList.add('in-view'); }
      );
    } catch (ignored) { /* nothing more can be done safely */ }
  }
})();
