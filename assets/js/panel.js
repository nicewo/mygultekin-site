// MYG Tech private panel — Google sign-in + Firestore (admins/{uid} allowlist).
// The real protection is firestore.rules; hiding the page is only convenience.
const SDK = "https://www.gstatic.com/firebasejs/13.3.0";
const $ = id => document.getElementById(id);
const views = ["view-login", "view-denied", "view-panel"];

function show(view) { views.forEach(v => { $(v).hidden = v !== view; }); }
function status(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", isError);
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
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let unsubscribeNotes = null;

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
  $("btn-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("denied-uid").textContent); status("UID kopyalandı."); }
    catch { status("Kopyalanamadı, UID'yi elle seç.", true); }
  });

  auth.onAuthStateChanged(authI, async user => {
    if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }
    $("user-box").hidden = !user;
    if (!user) { show("view-login"); status(""); return; }

    $("user-name").textContent = user.displayName || user.email || "";
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
    const q = fs.query(fs.collection(db, "notes"), fs.orderBy("createdAt", "desc"));
    unsubscribeNotes = fs.onSnapshot(q, snap => renderNotes(snap.docs), err => status(`Notlar okunamadı: ${err.code}`, true));
  });

  function renderNotes(docs) {
    const list = $("note-list");
    list.replaceChildren();
    $("note-empty").hidden = docs.length > 0;
    for (const d of docs) {
      const data = d.data();
      const li = document.createElement("li");
      const body = document.createElement("div");
      const text = document.createElement("div");
      text.className = "note-text";
      text.textContent = data.text;
      const date = document.createElement("span");
      date.className = "note-date";
      date.textContent = data.createdAt ? data.createdAt.toDate().toLocaleString("tr-TR") : "kaydediliyor…";
      body.append(text, date);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "note-del";
      del.textContent = "Sil";
      del.setAttribute("aria-label", "Notu sil");
      del.addEventListener("click", async () => {
        if (!confirm("Bu not silinsin mi?")) return;
        try { await fs.deleteDoc(d.ref); } catch (err) { status(`Silinemedi: ${err.code}`, true); }
      });
      li.append(body, del);
      list.append(li);
    }
  }

  $("note-form").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("note-text");
    const text = input.value.trim();
    if (!text) return;
    try {
      await fs.addDoc(fs.collection(db, "notes"), { text, createdAt: fs.serverTimestamp() });
      input.value = ""; status("Kaydedildi.");
    } catch (err) { status(`Kaydedilemedi: ${err.code}`, true); }
  });
}

main();
