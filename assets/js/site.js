(function () {
  "use strict";

  var DATA = window.SITE_DATA || { categories: [], works: [] };
  var STRINGS = window.I18N;
  var IMG = "img/web/";

  var lang = "uk";
  try {
    var saved = localStorage.getItem("lang");
    if (saved === "uk" || saved === "en") lang = saved;
  } catch (e) { /* приватний режим — лишаємо українську */ }

  var reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* теки читаються за абеткою — переставляємо роботи в порядок категорій,
     щоб «Усі роботи» починались із основних, а не з «Графіки» */
  var catOrder = {};
  DATA.categories.forEach(function (c, i) { catOrder[c.id] = i; });
  DATA.works.sort(function (a, b) { return (catOrder[a.cat] || 0) - (catOrder[b.cat] || 0); });

  function t(key) {
    var dict = STRINGS[lang] || STRINGS.uk;
    return dict[key] !== undefined ? dict[key] : (STRINGS.uk[key] || "");
  }
  function title(w) { return lang === "en" ? (w.titleEn || w.title) : w.title; }
  function blurb(w) { return lang === "en" ? (w.blurbEn || "") : (w.blurb || ""); }
  function catName(id) {
    for (var i = 0; i < DATA.categories.length; i++)
      if (DATA.categories[i].id === id) return DATA.categories[i][lang] || DATA.categories[i].uk;
    return id;
  }
  /* українська потребує трьох форм; англійська обходиться двома */
  function plural(n, prefix) {
    if (lang === "en") return n + " " + t(prefix + (n === 1 ? ".one" : ".many"));
    var d10 = n % 10, d100 = n % 100;
    var form = ".many";
    if (d10 === 1 && d100 !== 11) form = ".one";
    else if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) form = ".few";
    return n + " " + t(prefix + form);
  }
  function countLabel(n) { return plural(n, "count"); }
  /* підсумок рахується з даних — інакше він застаряє щоразу, як додається робота */
  function summary() {
    var cats = DATA.categories.filter(function (c) {
      return DATA.works.some(function (w) { return w.cat === c.id; });
    }).length;
    return plural(DATA.works.length, "count") + " · " + plural(cats, "cat");
  }
  function gridSrc(w) { return IMG + w.slug + (w.anim ? "" : "-1000") + ".webp"; }
  function fullSrc(w) { return IMG + w.slug + (w.anim ? "" : (w.full ? "-2000" : "-1000")) + ".webp"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ─────────── мова ─────────── */

  function applyStrings(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = t(el.dataset.i18n);
    });
    (root || document).querySelectorAll("[data-i18n-label]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    });
    (root || document).querySelectorAll("[data-count]").forEach(function (el) {
      el.textContent = summary();
    });
  }

  function setLang(next) {
    lang = next;
    document.documentElement.lang = next;
    try { localStorage.setItem("lang", next); } catch (e) { /* не критично */ }
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-current", String(b.dataset.lang === next));
    });
    applyStrings();
    render();
  }

  /* ─────────── картки ─────────── */

  function card(w, index) {
    var a = document.createElement("a");
    a.className = "w";
    a.href = "#" + w.slug;
    a.dataset.slug = w.slug;

    var box = document.createElement("span");
    box.className = "w-img";
    box.style.backgroundImage = "url(" + w.lqip + ")";

    var img = document.createElement("img");
    img.src = gridSrc(w);
    img.alt = title(w);
    img.loading = "lazy";
    img.decoding = "async";
    img.width = w.w;
    img.height = w.h;
    img.dataset.loading = "1";
    img.addEventListener("load", function () { delete img.dataset.loading; });
    if (img.complete) delete img.dataset.loading;
    box.appendChild(img);

    var cap = document.createElement("span");
    cap.className = "w-cap";
    cap.innerHTML =
      '<span class="w-num"></span><h3></h3><span class="w-cat"></span>';
    cap.querySelector(".w-num").textContent = pad(index + 1);
    cap.querySelector("h3").textContent = title(w);
    cap.querySelector(".w-cat").textContent = catName(w.cat);

    a.appendChild(box);
    a.appendChild(cap);
    return a;
  }

  function fillGrid(el, list) {
    el.textContent = "";
    if (!list.length) {
      var p = document.createElement("p");
      p.className = "empty";
      p.textContent = t("works.empty");
      el.appendChild(p);
      return;
    }
    list.forEach(function (w, i) { el.appendChild(card(w, i)); });
    reveal(el.children);
  }

  /* ─────────── головна: категорії ─────────── */

  function fillCats(el) {
    el.textContent = "";
    DATA.categories.forEach(function (c, i) {
      var list = DATA.works.filter(function (w) { return w.cat === c.id; });
      if (!list.length) return;
      var a = document.createElement("a");
      a.className = "cat";
      a.href = "works.html#" + c.id;
      a.innerHTML =
        '<span class="n"></span><h3></h3><span class="count"></span>' +
        '<span class="thumb"><img alt="" loading="lazy" decoding="async"></span>';
      a.querySelector(".n").textContent = pad(i + 1);
      a.querySelector("h3").textContent = c[lang] || c.uk;
      a.querySelector(".count").textContent = countLabel(list.length);
      a.querySelector("img").src = gridSrc(list[0]);
      el.appendChild(a);
    });
    reveal(el.children);
  }

  /* ─────────── сторінка «Роботи»: фільтр ─────────── */

  var current = [];

  function setupWorksPage() {
    var grid = document.getElementById("grid");
    var bar = document.getElementById("filters");
    if (!grid || !bar) return null;

    function active() {
      var btn = bar.querySelector('[aria-pressed="true"]');
      return btn ? btn.dataset.cat : "all";
    }

    function draw() {
      var cat = active();
      current = cat === "all"
        ? DATA.works.slice()
        : DATA.works.filter(function (w) { return w.cat === cat; });
      fillGrid(grid, current);
    }

    function buildBar() {
      var cat = active();
      bar.textContent = "";
      var defs = [{ id: "all", name: t("works.all"), n: DATA.works.length }];
      DATA.categories.forEach(function (c) {
        var n = DATA.works.filter(function (w) { return w.cat === c.id; }).length;
        if (n) defs.push({ id: c.id, name: c[lang] || c.uk, n: n });
      });
      defs.forEach(function (d) {
        var b = document.createElement("button");
        b.type = "button";
        b.dataset.cat = d.id;
        b.setAttribute("aria-pressed", String(d.id === cat));
        b.innerHTML = '<span class="label"></span><span></span>';
        b.querySelector(".label").textContent = d.name;
        b.lastElementChild.textContent = d.n;
        bar.appendChild(b);
      });
    }

    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      bar.querySelectorAll("button").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      history.replaceState(null, "", b.dataset.cat === "all" ? "works.html" : "#" + b.dataset.cat);
      draw();
    });

    /* категорія з адреси: works.html#landscape */
    var hash = location.hash.slice(1);
    if (hash && DATA.categories.some(function (c) { return c.id === hash; })) {
      buildBar();
      var pick = bar.querySelector('[data-cat="' + hash + '"]');
      if (pick) bar.querySelectorAll("button").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === pick));
      });
    }

    return function () { buildBar(); draw(); };
  }

  /* ─────────── лайтбокс ─────────── */

  var lb = document.getElementById("lightbox");
  var lbIndex = -1;
  var lastFocus = null;

  function openLb(slug) {
    var i = current.findIndex(function (w) { return w.slug === slug; });
    if (i < 0) return;
    lastFocus = document.activeElement;
    lbIndex = i;
    paintLb();
    lb.setAttribute("open", "");
    requestAnimationFrame(function () { lb.classList.add("shown"); });
    document.body.style.overflow = "hidden";
    lb.querySelector(".x").focus();
  }

  function closeLb() {
    lb.classList.remove("shown");
    var done = function () { lb.removeAttribute("open"); };
    reduced ? done() : setTimeout(done, 350);
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  function step(delta) {
    lbIndex = (lbIndex + delta + current.length) % current.length;
    paintLb();
  }

  function paintLb() {
    var w = current[lbIndex];
    var meta = [w.w + " × " + w.h];
    if (w.tool) meta.push(t("tool." + w.tool) || w.tool);
    if (w.year) meta.push(w.year);

    lb.querySelector(".lb-meta").textContent =
      pad(lbIndex + 1) + " / " + pad(current.length) + " · " + catName(w.cat);
    lb.querySelector("h3").textContent = title(w);
    lb.querySelector(".lb-spec").textContent = meta.join(" · ");
    var text = lb.querySelector(".lb-blurb");
    text.textContent = blurb(w);
    text.hidden = !blurb(w);

    var img = lb.querySelector("figure img");
    img.src = fullSrc(w);
    img.alt = title(w);
    lb.querySelector(".nav").hidden = current.length < 2;
  }

  function setupLb() {
    if (!lb) return;
    lb.querySelector(".x").addEventListener("click", closeLb);
    lb.querySelector(".prev").addEventListener("click", function () { step(-1); });
    lb.querySelector(".next").addEventListener("click", function () { step(1); });
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.tagName === "FIGURE") closeLb();
    });
    addEventListener("keydown", function (e) {
      if (!lb.hasAttribute("open")) return;
      if (e.key === "Escape") closeLb();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });

    /* свайп */
    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });

    document.addEventListener("click", function (e) {
      var a = e.target.closest(".w");
      if (!a) return;
      e.preventDefault();
      openLb(a.dataset.slug);
    });
  }

  /* ─────────── курсор-мазок і поява при скролі ─────────── */

  function setupBrush() {
    if (!matchMedia("(hover:hover)").matches) return;
    var brush = document.createElement("div");
    brush.className = "brush";
    brush.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M1.5 12S5.2 5.5 12 5.5 22.5 12 22.5 12 18.8 18.5 12 18.5 1.5 12 1.5 12Z"' +
      ' stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="3.1"/></svg>';
    document.body.appendChild(brush);

    var raf = null, mx = 0, my = 0;
    addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(function () {
        brush.style.left = mx + "px"; brush.style.top = my + "px"; raf = null;
      });
    });
    document.addEventListener("pointerover", function (e) {
      if (e.target.closest(".w,.cat")) brush.classList.add("on");
    });
    document.addEventListener("pointerout", function (e) {
      if (e.target.closest(".w,.cat") && !e.relatedTarget?.closest(".w,.cat"))
        brush.classList.remove("on");
    });
  }

  var io = null;
  function reveal(nodes) {
    if (reduced) return;
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.transition = "opacity .9s var(--ease),transform .9s var(--ease)";
        e.target.style.opacity = 1;
        e.target.style.transform = "none";
        io.unobserve(e.target);
      });
    }, { threshold: .12 });
    Array.prototype.forEach.call(nodes, function (el, i) {
      el.style.opacity = 0;
      el.style.transform = "translateY(18px)";
      el.style.transitionDelay = (i % 5) * 80 + "ms";
      io.observe(el);
    });
  }

  /* ─────────── збірка сторінки ─────────── */

  var drawWorksPage = null;

  function render() {
    var featured = document.getElementById("featured");
    if (featured) {
      current = DATA.works
        .filter(function (w) { return w.featured; })
        .sort(function (a, b) { return a.featured - b.featured; });
      fillGrid(featured, current);
    }
    var cats = document.getElementById("cats");
    if (cats) fillCats(cats);
    if (drawWorksPage) drawWorksPage();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.addEventListener("click", function () { setLang(b.dataset.lang); });
    });
    drawWorksPage = setupWorksPage();
    setupLb();
    setupBrush();
    setLang(lang);
    reveal(document.querySelectorAll(".about,.hero-img"));
  });
})();
