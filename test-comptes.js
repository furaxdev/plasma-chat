/**
 * Test des comptes Plasma : inscription, connexion, mauvais mot de passe.
 */
const WebSocket = require("ws");
const res = [];
const check = (n, ok, d = "") => { res.push({n, ok}); console.log(`  ${ok ? "OK  " : "ECHEC"}  ${n}${d ? "  (" + d + ")" : ""}`); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const URL = "ws://127.0.0.1:3100/ws";

function tenter(pseudo, motDePasse, inscription) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const out = { ws, recus: [] };
    ws.on("open", () => ws.send(JSON.stringify({ type: "rejoindre", pseudo, motDePasse, inscription })));
    ws.on("message", b => {
      const d = JSON.parse(b);
      out.recus.push(d);
      if (d.type === "connecte" || d.type === "refus") { out.reponse = d; resolve(out); }
    });
    ws.on("error", reject);
    setTimeout(() => resolve(out), 6000);
  });
}

(async () => {
  const marque = Date.now().toString(36);
  const pseudo = "testeur" + marque;

  console.log("=== 1. inscription d'un compte neuf ===");
  const a = await tenter(pseudo, "motdepasse123", true);
  check("l'inscription est acceptee", a.reponse && a.reponse.type === "connecte",
        a.reponse && (a.reponse.type === "refus" ? a.reponse.raison : "connecte"));
  check("un identifiant est attribue", a.reponse && a.reponse.moi && !!a.reponse.moi.id);

  console.log("\n=== 2. le meme pseudo ne peut pas etre repris ===");
  const b = await tenter(pseudo, "autrechose", true);
  check("le doublon est refuse", b.reponse && b.reponse.type === "refus",
        b.reponse && b.reponse.raison);

  console.log("\n=== 3. connexion avec le bon mot de passe ===");
  const c = await tenter(pseudo, "motdepasse123", false);
  check("la connexion passe", c.reponse && c.reponse.type === "connecte",
        c.reponse && (c.reponse.type === "refus" ? c.reponse.raison : "connecte"));
  check("c'est le meme compte", c.reponse && c.reponse.moi &&
        a.reponse.moi && c.reponse.moi.id === a.reponse.moi.id);

  console.log("\n=== 4. mauvais mot de passe ===");
  const d = await tenter(pseudo, "faux", false);
  check("refuse", d.reponse && d.reponse.type === "refus", d.reponse && d.reponse.raison);

  console.log("\n=== 5. pseudo inconnu ===");
  const e = await tenter("jamaisvucetruc" + marque, "1234", false);
  check("refuse", e.reponse && e.reponse.type === "refus", e.reponse && e.reponse.raison);

  console.log("\n=== 6. mot de passe trop court ===");
  const f = await tenter("court" + marque, "12", true);
  check("refuse", f.reponse && f.reponse.type === "refus", f.reponse && f.reponse.raison);

  console.log("\n=== 7. le mot de passe n'est jamais stocke en clair ===");
  const fs = require("fs");
  const data = fs.readFileSync("/home/furax/workspace/plasma/donnees.json", "utf8");
  check("le mot de passe en clair est absent", !data.includes("motdepasse123"));
  check("un hachage sale est present", /motDePasse"\s*:\s*"[0-9a-f]{32}:[0-9a-f]{64}"/.test(data));

  [a, b, c, d, e, f].forEach(x => { try { x.ws.close(); } catch (_) {} });
  await pause(400);

  const ok = res.filter(r => r.ok).length;
  console.log("\n═══════════════════════════════════════");
  console.log(`  ${ok} / ${res.length} verifications au vert`);
  res.filter(r => !r.ok).forEach(r => console.log("    ECHEC : " + r.n));
  console.log("═══════════════════════════════════════");
  process.exit(ok === res.length ? 0 : 1);
})().catch(e => { console.error("ERREUR:", e.message); process.exit(1); });
