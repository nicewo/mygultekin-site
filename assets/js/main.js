(() => {
  const canvas = document.getElementById("network");
  const ctx = canvas && canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let points = [], width = 0, height = 0, raf = 0;
  const pointer = { x: -1000, y: -1000 };

  function resize() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(95, Math.max(34, Math.floor(width * height / 14500)));
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
          ctx.strokeStyle = p.orange || q.orange ? `rgba(255,121,0,${alpha * .65})` : `rgba(0,175,255,${alpha})`;
          ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = p.orange ? "rgba(255,145,54,.72)" : "rgba(0,184,255,.7)";
      ctx.shadowBlur = 8; ctx.shadowColor = p.orange ? "#ff7900" : "#00afff"; ctx.fill(); ctx.shadowBlur = 0;
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
})();