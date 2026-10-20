/**
 * Test de bout en bout de Plasma : deux clients qui discutent.
 */
const WebSocket = require("ws");

const URL = "ws://127.0.0.1:3100/ws";
const resultats = [];
function check(nom, ok, detail = "") {
  resultats.push({ nom, ok, detail });
  console.log(`  ${ok ? "OK  " : "ECHEC"}  ${nom}${detail ? "  (" + detail + ")" : ""}`);
}

function client(pseudo) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const recus = [];
    ws.on("open", () => ws.send(JSON.stringify({ type: "rejoindre", pseudo })));
    ws.on("message", (b) => {
      const d = JSON.parse(b);
      recus.push(d);
      if (d.type === "connecte") resolve({ ws, recus, moi: d.moi });
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("timeout connexion")), 8000);
  });
}

const attendre = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("=== 1. la page est-elle servie ? ===");
  const r = await fetch("http://127.0.0.1:3100/");
  const html = await r.text();
  check("HTTP 200", r.status === 200, `status ${r.status}`);
  check("le HTML contient Plasma", html.includes("Plasma"));
  check("le rail de serveurs est là", html.includes('class="rail"'));
  check("la colonne de canaux est là", html.includes('class="canaux"'));
  check("la liste des membres est là", html.includes('class="membres"'));
  check("couleur de fond #131315", html.includes("#131315"));
  check("accent violet #8a79ff", html.includes("#8a79ff"));
  check("police Outfit", html.includes("Outfit"));

  console.log("\n=== 2. deux clients se connectent ===");
  const a = await client("Furax");
  check("client A connecté", !!a.moi, a.moi && a.moi.pseudo);
  await attendre(300);

  const b = await client("ShadowEthan");
  check("client B connecté", !!b.moi, b.moi && b.moi.pseudo);
  await attendre(500);

  console.log("\n=== 3. les membres se voient entre eux ===");
  const vuParA = a.recus.filter(x => x.type === "membres").pop();
  check("A voit 2 membres", vuParA && vuParA.liste.length === 2,
        vuParA ? vuParA.liste.map(u => u.pseudo).join(", ") : "aucun");
  const vuParB = b.recus.filter(x => x.type === "membres").pop();
  check("B voit 2 membres", vuParB && vuParB.liste.length === 2);

  console.log("\n=== 4. un message arrive à l'autre ===");
  a.ws.send(JSON.stringify({ type: "message", texte: "salut frr, ça va ?", canalId: "c1" }));
  await attendre(600);
  const recuParB = b.recus.filter(x => x.type === "message").pop();
  check("B reçoit le message de A", !!recuParB);
  if (recuParB) {
    check("le texte est intact", recuParB.msg.texte === "salut frr, ça va ?", recuParB.msg.texte);
    check("l'auteur est bon", recuParB.msg.pseudo === "Furax", recuParB.msg.pseudo);
    check("il y a une couleur", !!recuParB.msg.couleur, recuParB.msg.couleur);
    check("il y a une date", typeof recuParB.msg.date === "number");
  }

  console.log("\n=== 5. changement de canal ===");
  b.ws.send(JSON.stringify({ type: "canal", canalId: "c2" }));
  await attendre(400);
  const hist = b.recus.filter(x => x.type === "historique").pop();
  check("B reçoit l'historique", !!hist);
  check("c'est bien le canal c2", hist && hist.canalId === "c2", hist && hist.canalId);
  check("l'historique est vide au départ", hist && hist.messages.length === 0,
        hist ? `${hist.messages.length} message(s)` : "?");

  console.log("\n=== 6. message dans un autre canal ===");
  b.ws.send(JSON.stringify({ type: "message", texte: "premier dans memes", canalId: "c2" }));
  await attendre(500);
  const recuParA = a.recus.filter(x => x.type === "message").pop();
  check("A reçoit aussi (même s'il est sur c1)", !!recuParA);
  check("le message est du canal c2", recuParA && recuParA.msg.canalId === "c2");

  console.log("\n=== 7. les pseudos vides sont refusés ===");
  const c = await client("   ");
  await attendre(300);
  check("un pseudo vide devient 'anonyme'", c.moi && c.moi.pseudo === "anonyme",
        c.moi && c.moi.pseudo);

  console.log("\n=== 8. un message vide est ignoré ===");
  const avant = a.recus.filter(x => x.type === "message").length;
  a.ws.send(JSON.stringify({ type: "message", texte: "   ", canalId: "c1" }));
  await attendre(400);
  const apres = a.recus.filter(x => x.type === "message").length;
  check("rien n'a été ajouté", avant === apres, `${avant} -> ${apres}`);

  a.ws.close(); b.ws.close(); c.ws.close();
  await attendre(400);

  const ok = resultats.filter(r => r.ok).length;
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  ${ok} / ${resultats.length} vérifications au vert`);
  if (ok < resultats.length) {
    console.log("  ECHECS :");
    for (const r of resultats.filter(r => !r.ok)) console.log("    - " + r.nom);
  }
  console.log(`═══════════════════════════════════════`);
  process.exit(ok === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR:", e.message); process.exit(1); });
