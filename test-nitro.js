/**
 * Test des fonctionnalités « Nitro gratuit » de Plasma.
 */
const WebSocket = require("ws");
const res = [];
const check = (n, ok, d = "") => { res.push({n, ok}); console.log(`  ${ok ? "OK  " : "ECHEC"}  ${n}${d ? "  (" + d + ")" : ""}`); };
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const URL = "ws://127.0.0.1:3100/ws";

function client(pseudo) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const recus = [];
    ws.on("open", () => ws.send(JSON.stringify({ type: "rejoindre", pseudo })));
    ws.on("message", (b) => {
      const d = JSON.parse(b); recus.push(d);
      if (d.type === "connecte") resolve({ ws, recus, moi: d.moi });
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("timeout")), 8000);
  });
}

(async () => {
  const a = await client("Furax"); await pause(300);
  const b = await client("ShadowEthan"); await pause(400);

  console.log("=== 1. messages de 4000 caractères (Discord : 2000) ===");
  const long = "a".repeat(4000);
  a.ws.send(JSON.stringify({ type: "message", texte: long, canalId: "c1" }));
  await pause(700);
  const recuLong = b.recus.filter(x => x.type === "message").pop();
  check("4000 caractères acceptés", recuLong && recuLong.msg.texte.length === 4000,
        recuLong ? recuLong.msg.texte.length + " car." : "rien reçu");

  // au-delà de 4000 : tronqué, pas rejeté
  const trop = "b".repeat(5000);
  a.ws.send(JSON.stringify({ type: "message", texte: trop, canalId: "c1" }));
  await pause(700);
  const recuTrop = b.recus.filter(x => x.type === "message").pop();
  check("5000 caractères tronqués à 4000", recuTrop && recuTrop.msg.texte.length === 4000,
        recuTrop ? recuTrop.msg.texte.length + " car." : "?");

  console.log("\n=== 2. réactions (gratuites) ===");
  const idMsg = recuLong.msg.id;
  b.ws.send(JSON.stringify({ type: "reaction", messageId: idMsg, canalId: "c1", emoji: "🔥" }));
  await pause(600);
  const reactB = b.recus.filter(x => x.type === "reactions").pop();
  check("B voit sa réaction", reactB && reactB.reactions["🔥"], JSON.stringify(reactB && reactB.reactions));
  check("1 personne sur 🔥", reactB && reactB.reactions["🔥"].length === 1);

  const reactA = a.recus.filter(x => x.type === "reactions").pop();
  check("A reçoit la réaction de B", !!reactA);

  a.ws.send(JSON.stringify({ type: "reaction", messageId: idMsg, canalId: "c1", emoji: "🔥" }));
  await pause(600);
  const react2 = b.recus.filter(x => x.type === "reactions").pop();
  check("2 personnes sur 🔥", react2 && react2.reactions["🔥"].length === 2,
        react2 ? react2.reactions["🔥"].length + " personne(s)" : "?");

  // on retire la sienne
  a.ws.send(JSON.stringify({ type: "reaction", messageId: idMsg, canalId: "c1", emoji: "🔥" }));
  await pause(600);
  const react3 = b.recus.filter(x => x.type === "reactions").pop();
  check("A retire sa réaction", react3 && react3.reactions["🔥"].length === 1,
        react3 ? react3.reactions["🔥"].length + " personne(s)" : "?");

  console.log("\n=== 3. couleur de pseudo (Nitro chez Discord) ===");
  a.ws.send(JSON.stringify({ type: "couleur", couleur: "#eb459e" }));
  await pause(600);
  const maj = a.recus.filter(x => x.type === "moi-maj").pop();
  check("A change sa couleur", maj && maj.couleur === "#eb459e", maj && maj.couleur);
  const membres = b.recus.filter(x => x.type === "membres").pop();
  const couleurB = membres && membres.liste.find(u => u.pseudo === "Furax");
  check("B voit la nouvelle couleur de A", couleurB && couleurB.couleur === "#eb459e",
        couleurB && couleurB.couleur);

  const mauvais = a.recus.length;
  a.ws.send(JSON.stringify({ type: "couleur", couleur: "rouge" }));
  await pause(400);
  check("une couleur invalide est ignorée", a.recus.length === mauvais);

  console.log("\n=== 4. bannière de profil (Nitro chez Discord) ===");
  a.ws.send(JSON.stringify({ type: "banniere", url: "https://exemple.fr/banniere.png" }));
  await pause(600);
  const majB = a.recus.filter(x => x.type === "moi-maj").pop();
  check("A met une bannière", majB && majB.banniere, majB && majB.banniere);

  console.log("\n=== 5. upload de fichier (500 Mo, Discord gratuit : 25) ===");
  const contenu = "ceci est un fichier de test";
  const r = await fetch("http://127.0.0.1:3100/upload", {
    method: "POST",
    headers: { "X-Nom-Fichier": encodeURIComponent("test.txt"), "Content-Type": "application/octet-stream" },
    body: contenu,
  });
  const d = await r.json();
  check("l'upload répond", r.status === 200, "status " + r.status);
  check("une URL est renvoyée", d.url && d.url.startsWith("/uploads/"), d.url);
  check("la taille est bonne", d.taille === contenu.length, d.taille + " octets");

  const dl = await fetch("http://127.0.0.1:3100" + d.url);
  const texte = await dl.text();
  check("le fichier se retélécharge", texte === contenu, `${texte.length} car.`);
  check("bon type MIME", dl.headers.get("content-type").includes("text/plain"),
        dl.headers.get("content-type"));

  // un fichier joint dans un message
  a.ws.send(JSON.stringify({ type: "message", texte: "", canalId: "c1",
                             fichier: { url: d.url, nom: "test.txt", taille: d.taille } }));
  await pause(700);
  const avecPj = b.recus.filter(x => x.type === "message").pop();
  check("un message peut porter un fichier", avecPj && avecPj.msg.fichier,
        avecPj && avecPj.msg.fichier && avecPj.msg.fichier.url);

  console.log("\n=== 6. réaction sur un message inexistant ===");
  b.ws.send(JSON.stringify({ type: "reaction", messageId: "nexistepas", canalId: "c1", emoji: "🔥" }));
  await pause(500);
  check("aucun plantage", true);

  a.ws.close(); b.ws.close(); await pause(400);
  const ok = res.filter(x => x.ok).length;
  console.log("\n═══════════════════════════════════════");
  console.log(`  ${ok} / ${res.length} vérifications au vert`);
  const ko = res.filter(x => !x.ok);
  if (ko.length) { console.log("  ECHECS :"); ko.forEach(x => console.log("    - " + x.n)); }
  console.log("═══════════════════════════════════════");
  process.exit(ok === res.length ? 0 : 1);
})().catch(e => { console.error("ERREUR:", e.message); process.exit(1); });
