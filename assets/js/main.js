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
  function closeMenu() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  }
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) { closeSearch(); }
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") { closeMenu(); }
  });

  /* Filmography filters: category pills + title search (combined) */
  var pills = Array.prototype.slice.call(document.querySelectorAll(".pill"));
  var cards = Array.prototype.slice.call(document.querySelectorAll(".credit-card"));
  var activeFilter = "all";
  var searchQuery = "";

  function applyCardFilters() {
    cards.forEach(function (card) {
      var okPill = activeFilter === "all" || card.getAttribute("data-cat") === activeFilter;
      var titleEl = card.querySelector(".credit-title");
      var title = titleEl ? titleEl.textContent.toLowerCase() : "";
      var okSearch = !searchQuery || title.indexOf(searchQuery) !== -1;
      card.classList.toggle("hidden", !(okPill && okSearch));
    });
  }

  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      pills.forEach(function (p) {
        p.classList.remove("active");
        p.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("active");
      pill.setAttribute("aria-pressed", "true");
      activeFilter = pill.getAttribute("data-filter");
      applyCardFilters();
    });
  });

  /* Search toggle + input */
  var searchToggle = document.getElementById("searchToggle");
  var searchBar = document.getElementById("searchBar");
  var filmSearch = document.getElementById("filmSearch");
  var searchClear = document.getElementById("searchClear");

  function clearSearch() {
    filmSearch.value = "";
    searchQuery = "";
    applyCardFilters();
  }
  function closeSearch() {
    if (!searchBar.hidden) {
      searchBar.hidden = true;
      searchToggle.setAttribute("aria-expanded", "false");
      clearSearch();
    }
  }

  searchToggle.addEventListener("click", function () {
    var opening = searchBar.hidden;
    closeMenu();
    searchBar.hidden = !opening;
    searchToggle.setAttribute("aria-expanded", String(opening));
    if (opening) { filmSearch.focus(); }
    else { clearSearch(); }
  });
  searchClear.addEventListener("click", function () {
    clearSearch();
    filmSearch.focus();
  });
  filmSearch.addEventListener("input", function () {
    searchQuery = filmSearch.value.trim().toLowerCase();
    applyCardFilters();
  });
  filmSearch.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { clearSearch(); }
    else if (e.key === "Escape") { closeSearch(); searchToggle.focus(); }
  });

  /* Share: native share sheet, else copy link + toast */
  var shareBtn = document.getElementById("shareBtn");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    window.requestAnimationFrame(function () { toast.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.hidden = true; }, 350);
    }, 2200);
  }

  function copyLink(done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = location.href;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) { /* noop */ }
      document.body.removeChild(ta);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(done, fallback);
    } else { fallback(); }
  }

  shareBtn.addEventListener("click", function () {
    var data = { title: document.title, url: location.href };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* user dismissed */ });
    } else {
      copyLink(function () { showToast("Link copied!"); });
    }
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
