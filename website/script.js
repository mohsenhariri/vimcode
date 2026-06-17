/* VimCode landing — nav, reveal, cheatsheet filter/search, copy buttons */
(function () {
  "use strict";

  /* ---------- sticky nav shadow ---------- */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const burger = document.getElementById("burger");
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll(".nav__links a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    })
  );

  /* ---------- scroll reveal ---------- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- cheatsheet: filter + search ---------- */
  const chips = Array.from(document.querySelectorAll(".chip"));
  const cards = Array.from(document.querySelectorAll(".sheet__card"));
  const rows = Array.from(document.querySelectorAll(".sheet .row"));
  const search = document.getElementById("sheetSearch");
  const empty = document.getElementById("sheetEmpty");
  let activeFilter = "all";

  // cache lowercased text per row once
  rows.forEach((r) => (r.dataset.text = r.textContent.toLowerCase()));

  function applySheet() {
    const q = (search.value || "").trim().toLowerCase();
    let anyVisible = false;

    cards.forEach((card) => {
      const catMatch = activeFilter === "all" || card.dataset.cat === activeFilter;
      if (!catMatch) {
        card.classList.add("is-hidden");
        return;
      }

      let cardHasRow = false;
      card.querySelectorAll(".row").forEach((row) => {
        const hit = !q || row.dataset.text.includes(q);
        row.classList.toggle("is-hidden", !hit);
        if (hit) cardHasRow = true;
      });

      card.classList.toggle("is-hidden", !cardHasRow);
      if (cardHasRow) anyVisible = true;
    });

    empty.hidden = anyVisible;
  }

  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      activeFilter = chip.dataset.filter;
      applySheet();
    })
  );

  let t;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(applySheet, 80);
  });

  /* ---------- copy buttons ---------- */
  document.querySelectorAll(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
      }
      const label = btn.textContent;
      btn.textContent = "Copied!";
      btn.classList.add("is-done");
      setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove("is-done");
      }, 1500);
    });
  });

  /* ---------- current year (footer note future-proofing, no-op if absent) ---------- */
})();
