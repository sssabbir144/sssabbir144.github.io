/* Sabbir Hossin — filmography portfolio interactions (vanilla JS, no dependencies) */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Body loaded flag */
  function markLoaded() { document.body.classList.add("loaded"); }
  if (document.readyState === "complete") { markLoaded(); }
  else { window.addEventListener("load", markLoaded); }
  setTimeout(markLoaded, 2500);

  /* Navbar: hide on scroll down, show on scroll up */
  var nav = document.getElementById("siteNav");
  var lastY = window.scrollY || 0;
  var ticking = false;
  function onScroll() {
    var y = window.scrollY || 0;
    if (y > 160 && y > lastY + 4) { nav.classList.add("nav-hidden"); }
    else if (y < lastY - 4 || y <= 160) { nav.classList.remove("nav-hidden"); }
    lastY = y;
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });

  /* Mobile hamburger */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
  });

  /* Filmography filter pills */
  var pills = Array.prototype.slice.call(document.querySelectorAll(".pill"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".credit-card"));
  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      pills.forEach(function (p) {
        p.classList.remove("active");
        p.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("active");
      pill.setAttribute("aria-pressed", "true");
      var f = pill.getAttribute("data-filter");
      cards.forEach(function (card) {
        var show = f === "all" || card.getAttribute("data-cat") === f;
        card.classList.toggle("hidden", !show);
      });
    });
  });

  if (reduced) {
    /* No motion: reveal everything immediately */
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("in");
    });
    return;
  }

  /* Scroll reveals */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

  document.querySelectorAll(".reveal").forEach(function (el) {
    io.observe(el);
  });
})();
