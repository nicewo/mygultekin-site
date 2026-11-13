// MYG Tech private panel — Google sign-in + Firestore (admins/{uid} allowlist).
// The real protection is firestore.rules; hiding the page is only convenience.
const SDK = "https://www.gstatic.com/firebasejs/13.3.0";
const $ = id => document.getElementById(id);
const views = ["view-login", "view-denied", "view-panel"];
const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";

function show(view) { views.forEach(v => { $(v).hidden = v !== view; }); }
function status(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}
function safeUrl(url) {
  return /^(https?|ssh):\/\/\S+$/i.test(url) ? url : "";
}

async function loadConfig() {
  // Firebase Hosting serves the project's web config here (also under `firebase emulators`).
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("no-config");
  const config = await res.json();
  // Keep sign-in on the same domain the site is served from (needed for redirect sign-in
  // when the site is not the project's default domain, e.g. myusufgultekin.web.app).
  if (/\.(web\.app|firebaseapp\.com)$/.test(location.hostname)) config.authDomain = location.hostname;
  return config;
}

async function main() {
  let config;
  try { config = await loadConfig(); }
  catch {
    status("Panel yalnızca Firebase Hosting üzerinde çalışır (yerelde: firebase emulators:start).", true);
    return;
  }

  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);

  const app = initializeApp(config);
  const authI = auth.getAuth(app);
  auth.useDeviceLanguage(authI);
  const db = fs.getFirestore(app);
  if (LOCAL) {
    // Local development with `firebase emulators:start` (auth + firestore + hosting).
    auth.connectAuthEmulator(authI, "http://127.0.0.1:9099", { disableWarnings: true });
    fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let unsubscribe = null;
  let editingId = null;

  auth.getRedirectResult(authI).catch(err => status(`Giriş başarısız: ${err.code || err.message}`, true));

  $("btn-login").addEventListener("click", async () => {
    status("Giriş yapılıyor…");
    try {
      // Installed app (PWA): popups are unreliable, use a full-page redirect instead.
      if (standalone) await auth.signInWithRedirect(authI, provider);
      else await auth.signInWithPopup(authI, provider);
    } catch (err) {
      if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
        await auth.signInWithRedirect(authI, provider);
      } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        status(`Giriş başarısız: ${err.code || err.message}`, true);
      } else status("");
    }
  });

  const logout = () => auth.signOut(authI);
  $("btn-logout").addEventListener("click", logout);
  $("btn-logout-denied").addEventListener("click", logout);
  $("btn-copy").addEventListener("click", () => copy($("denied-uid").textContent, "UID kopyalandı."));

  async function copy(text, okMessage) {
    try { await navigator.clipboard.writeText(text); status(okMessage); }
    catch { status("Kopyalanamadı, metni elle seç.", true); }
  }

  auth.onAuthStateChanged(authI, async user => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    $("user-box").hidden = !user;
    if (!user) { show("view-login"); status(""); return; }

    $("user-name").textContent = user.displayName || user.email || "";
    $("user-photo").hidden = !user.photoURL;
    if (user.photoURL) $("user-photo").src = user.photoURL;

    status("Yetki kontrol ediliyor…");
    let isAdmin = false;
    try { isAdmin = (await fs.getDoc(fs.doc(db, "admins", user.uid))).exists(); }
    catch (err) { console.warn(err); }

    if (!isAdmin) {
      $("denied-uid").textContent = user.uid;
      show("view-denied"); status("");
      return;
    }

    show("view-panel"); status("");
    const q = fs.query(fs.collection(db, "apps"), fs.orderBy("order"));
    unsubscribe = fs.onSnapshot(q, snap => renderCards(snap.docs), err => status(`Kartlar okunamadı: ${err.code}`, true));
  });

  // ---------- Cards ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderCards(docs) {
    const grid = $("app-grid");
    grid.replaceChildren();
    for (const d of docs) {
      const a = d.data();
      const card = el("article", "app-card");
      card.append(el("div", "app-tag", a.tag || ""), el("h2", "", a.title));
      if (a.desc) card.append(el("p", "app-desc", a.desc));
      else card.append(el("p", "app-desc", ""));
      if (a.command) card.append(el("div", "app-cmd", a.command));

      const actions = el("div", "app-actions");
      const url = safeUrl(a.url || "");
      if (url) {
        const link = el("a", "primary", "Aç ↗");
        link.href = url;
        if (/^https?:/i.test(url)) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
        actions.append(link);
      }
      if (a.command) {
        const btn = el("button", url ? "" : "primary", "Komutu kopyala");
        btn.type = "button";
        btn.addEventListener("click", () => copy(a.command, "Komut kopyalandı."));
        actions.append(btn);
      }
      card.append(actions);

      const edit = el("div", "app-edit");
      const bEdit = el("button", "", "DÜZENLE");
      bEdit.type = "button";
      bEdit.setAttribute("aria-label", `${a.title} kartını düzenle`);
      bEdit.addEventListener("click", () => openForm(d.id, a));
      const bDel = el("button", "", "SİL");
      bDel.type = "button";
      bDel.setAttribute("aria-label", `${a.title} kartını sil`);
      bDel.addEventListener("click", async () => {
        if (!confirm(`"${a.title}" kartı silinsin mi?`)) return;
        try { await fs.deleteDoc(d.ref); status("Kart silindi."); }
        catch (err) { status(`Silinemedi: ${err.code}`, true); }
      });
      edit.append(bEdit, bDel);
      card.append(edit);
      grid.append(card);
    }
    const add = el("button", "app-card app-add", "+ Yeni kart");
    add.type = "button";
    add.addEventListener("click", () => openForm(null, { order: (docs.length + 1) * 10 }));
    grid.append(add);
  }

  function openForm(id, a) {
    editingId = id;
    $("app-form-title").textContent = id ? "KARTI DÜZENLE" : "YENİ KART";
    $("f-title").value = a.title || "";
    $("f-tag").value = a.tag || "";
    $("f-order").value = a.order ?? 10;
    $("f-desc").value = a.desc || "";
    $("f-url").value = a.url || "";
    $("f-command").value = a.command || "";
    $("app-form-box").hidden = false;
    $("app-form-box").scrollIntoView({ behavior: "smooth", block: "start" });
    $("f-title").focus({ preventScroll: true });
  }
  function closeForm() { editingId = null; $("app-form-box").hidden = true; $("app-form").reset(); }
  $("btn-cancel").addEventListener("click", closeForm);

  $("app-form").addEventListener("submit", async e => {
    e.preventDefault();
    const url = $("f-url").value.trim();
    if (url && !safeUrl(url)) { status("Adres https://, http:// veya ssh:// ile başlamalı.", true); $("f-url").focus(); return; }
    const data = {
      title: $("f-title").value.trim(),
      tag: $("f-tag").value.trim(),
      order: Math.max(0, Math.min(999, parseInt($("f-order").value, 10) || 0)),
      desc: $("f-desc").value.trim(),
      url,
      command: $("f-command").value.trim(),
      updatedAt: fs.serverTimestamp()
    };
    if (!data.title) return;
    try {
      if (editingId) await fs.setDoc(fs.doc(db, "apps", editingId), data);
      else await fs.addDoc(fs.collection(db, "apps"), data);
      closeForm(); status("Kart kaydedildi.");
    } catch (err) { status(`Kaydedilemedi: ${err.code}`, true); }
  });
}

main();
