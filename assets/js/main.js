(() => {
  const canvas = document.getElementById("network");
  const ctx = canvas && canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let points = [], width = 0, height = 0, raf = 0, seededWidth = 0;
  const pointer = { x: -1000, y: -1000 };

  function resize() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Mobilde adres çubuğu gizlenip açıldıkça yalnızca yükseklik değişir; ağı yeniden üretme.
    if (width === seededWidth && points.length) { draw(); return; }
    seededWidth = width;
    const count = Math.min(95, Math.max(34, Math.floor(width * height / (width < 700 ? 22000 : 14500))));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
      r: Math.random() * 1.4 + .6, orange: Math.random() > .88
    }));
    draw();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const maxDistance = width < 700 ? 105 : 145;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!reducedMotion) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10 || p.x > width + 10) p.vx *= -1;
        if (p.y < -10 || p.y > height + 10) p.vy *= -1;
      }
      const dx = pointer.x - p.x, dy = pointer.y - p.y;
      const nearPointer = dx * dx + dy * dy < 150 * 150;
      if (nearPointer && !reducedMotion) { p.x -= dx * .0007; p.y -= dy * .0007; }
      for (let j = i + 1; j < points.length; j++) {
        const q = points[j], x = p.x - q.x, y = p.y - q.y, dist = Math.sqrt(x*x + y*y);
        if (dist < maxDistance) {
          const alpha = (1 - dist / maxDistance) * .23;
          ctx.strokeStyle = p.orange || q.orange ? `rgba(166,25,61,${alpha * .8})` : `rgba(83,87,90,${alpha})`;
          ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = p.orange ? "rgba(166,25,61,.7)" : "rgba(83,87,90,.45)";
      ctx.fill();
    }
    if (!reducedMotion) raf = requestAnimationFrame(draw);
  }

  if (canvas && ctx) {
    resize();
    window.addEventListener("resize", () => { cancelAnimationFrame(raf); resize(); }, { passive: true });
    window.addEventListener("pointermove", e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    window.addEventListener("pointerleave", () => { pointer.x = -1000; pointer.y = -1000; });
  }

  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false");
    }));
  }

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const revealTargets = document.querySelectorAll(".section-label,.about-grid,.principles,.section-heading,.skill-card,.project-card,.stack-content,.contact-content");
  revealTargets.forEach(el => el.classList.add("reveal"));
  if ("IntersectionObserver" in window && !reducedMotion) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
    }), { threshold: .12 });
    revealTargets.forEach(el => observer.observe(el));
  } else revealTargets.forEach(el => el.classList.add("visible"));
  // Hidden entry: 5 quick taps on the footer line open the private panel.
  const mark = document.querySelector(".footer-mark");
  if (mark) {
    let taps = 0, timer = 0;
    mark.addEventListener("click", () => {
      taps += 1; clearTimeout(timer);
      if (taps >= 5) { taps = 0; location.href = "/panel"; return; }
      timer = setTimeout(() => { taps = 0; }, 2000);
    });
  }

  // Bu cihazda daha once panele yonetici olarak girildiyse menude "Panel" goster.
  let knownAdmin = false;
  try { knownAdmin = localStorage.getItem("myg.panel") === "1"; } catch {}
  if (knownAdmin && nav && !nav.querySelector(".nav-panel")) {
    const link = document.createElement("a");
    link.href = "/panel"; link.className = "nav-panel"; link.textContent = "Panel";
    nav.insertBefore(link, nav.querySelector(".nav-contact"));
  }

  // Ürün kartları: son kararlı GitHub Release bilgisini dinamik göster.
  // Sayfa API'yi beklemez: önce önbellek / son bilinen sürüm basılır, API yanıtı gelince güncellenir.
  // Hata, zaman aşımı veya rate limit durumunda kart olduğu gibi kalır; indirme bağlantısı her zaman sabittir.
  const RELEASE_FALLBACK = {
    "nicewo/MYG.Electrical": { tag: "v0.2.5", date: "2026-11-25T14:16:25Z", note: "", known: true }
  };
  const RELEASE_TTL = 6 * 60 * 60 * 1000;      // başarılı yanıt 6 saat önbellekte
  const RELEASE_RETRY = 30 * 60 * 1000;        // hata / rate limit sonrası 30 dk tekrar deneme
  const TAG_RE = /^v?\d+(\.\d+){1,3}([-+.][0-9A-Za-z.-]+)?$/;

  const readCache = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const writeCache = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  function releaseSummary(body) {
    if (typeof body !== "string") return "";
    const line = body.split(/\r?\n/).map(l => l.replace(/[#*_`>\[\]]/g, "").replace(/^\s*[-+]\s+/, "").trim()).find(Boolean) || "";
    return line.length > 160 ? line.slice(0, 157).trimEnd() + "…" : line;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    try { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(d); }
    catch { return d.toISOString().slice(0, 10); }
  }

  function renderRelease(card, info) {
    if (!info || !TAG_RE.test(info.tag || "")) return;
    const tag = card.querySelector("[data-release-tag]");
    const date = card.querySelector("[data-release-date]");
    const note = card.querySelector("[data-release-note]");
    const badge = card.querySelector("[data-release-version]");
    if (tag) tag.textContent = info.tag;
    if (date) date.textContent = formatDate(info.date);
    if (badge) badge.title = info.known ? "Son bilinen sürüm (GitHub'a şu an ulaşılamadı)" : "GitHub Releases üzerindeki son kararlı sürüm";
    if (note) {
      note.textContent = "";
      if (info.note) {
        const b = document.createElement("b"); b.textContent = info.tag + " notu: ";
        note.append(b, info.note); note.hidden = false;
      } else note.hidden = true;
    }
  }

  async function fetchRelease(repo) {
    const ctrl = "AbortController" in window ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : 0;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw new Error("HTTP " + res.status); // 403/429 = rate limit, 404 = henüz release yok
      const data = await res.json();
      if (!data || data.draft || data.prerelease || !TAG_RE.test(data.tag_name || "")) throw new Error("Geçersiz release");
      return { tag: data.tag_name, date: data.published_at || data.created_at || "", note: releaseSummary(data.body) };
    } finally { clearTimeout(timer); }
  }

  function initReleaseCard(card) {
    const repo = card.getAttribute("data-release-repo");
    if (!repo) return;
    const key = "myg.release." + repo;
    const cached = readCache(key);
    // Anında: önbellekteki veya son bilinen sürümü göster.
    renderRelease(card, (cached && cached.info) || RELEASE_FALLBACK[repo]);
    const now = Date.now();
    if (cached && cached.info && now - (cached.at || 0) < RELEASE_TTL) return;
    if (cached && cached.failedAt && now - cached.failedAt < RELEASE_RETRY) return;
    // Sonra: ilk boyamayı ve sayfa yüklemesini engellemeden, boşta API'yi sorgula.
    const refresh = () => fetchRelease(repo)
      .then(info => { writeCache(key, { info, at: Date.now() }); renderRelease(card, info); })
      .catch(() => writeCache(key, { info: cached && cached.info, at: cached && cached.at, failedAt: Date.now() }));
    if ("requestIdleCallback" in window) requestIdleCallback(refresh, { timeout: 2500 });
    else setTimeout(refresh, 300);
  }

  document.querySelectorAll("[data-release-repo]").forEach(initReleaseCard);

  // Installable app / offline support.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
