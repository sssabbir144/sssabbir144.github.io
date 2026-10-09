/* Sabbir Hossin — portfolio interactions (vanilla JS, no dependencies) */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Hero fade-in on load */
  function markLoaded() { document.body.classList.add("loaded"); }
  if (document.readyState === "complete") { markLoaded(); }
  else { window.addEventListener("load", markLoaded); }
  /* Fallback in case load event is delayed */
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

  if (reduced) { return; }

  /* Scroll reveals: curtain wipes, highlighter draw-ins */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -6% 0px" });

  document.querySelectorAll(".wipe, .work-media, .hl[data-hl]").forEach(function (el) {
    io.observe(el);
  });

  /* Services accordion */
  var items = Array.prototype.slice.call(document.querySelectorAll(".acc-item"));
  items.forEach(function (item) {
    var head = item.querySelector(".acc-head");
    head.addEventListener("click", function () {
      var wasOpen = item.classList.contains("active");
      items.forEach(function (o) {
        o.classList.remove("active");
        o.querySelector(".acc-head").setAttribute("aria-expanded", "false");
      });
      if (!wasOpen) {
        item.classList.add("active");
        head.setAttribute("aria-expanded", "true");
      }
    });
  });
  if (items[0]) {
    items[0].classList.add("active");
    items[0].querySelector(".acc-head").setAttribute("aria-expanded", "true");
  }

  /* Process cards: click (or Enter/Space) to activate */
  var pcards = Array.prototype.slice.call(document.querySelectorAll(".pcard"));
  function activate(card) {
    pcards.forEach(function (c) {
      c.classList.remove("active");
      c.setAttribute("aria-pressed", "false");
    });
    card.classList.add("active");
    card.setAttribute("aria-pressed", "true");
  }
  pcards.forEach(function (card) {
    card.addEventListener("click", function () { activate(card); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(card); }
    });
  });
  if (pcards[0]) { activate(pcards[0]); }
})();
