/**
 * PLASMA — ce que Discord fait payer, on le donne.
 *
 * Gratuit chez nous :
 *   · réactions (n'importe qui, n'importe quel emoji)
 *   · messages de 4000 caractères (Discord : 2000)
 *   · upload de fichiers jusqu'à 500 Mo (Discord gratuit : 25 Mo)
 *   · couleur de pseudo choisie (Discord : Nitro)
 *   · bannière de profil (Discord : Nitro)
 *   · emojis perso utilisables partout (Discord : Nitro)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3100;
const DATA = path.join(__dirname, "donnees.json");
const UPLOADS = path.join(__dirname, "uploads");
const MAX_MESSAGE = 4000;                 // Discord : 2000, gratuit
const MAX_FICHIER = 500 * 1024 * 1024;    // Discord gratuit : 25 Mo

fs.mkdirSync(UPLOADS, { recursive: true });

// ─────────────────────────────────────────── état
function etatInitial() {
  return {
    utilisateurs: {},
    serveurs: [{
      id: "s1", nom: "Plasma", icone: "P",
      canaux: [
        { id: "c1", nom: "général", categorie: "TEXTE" },
        { id: "c2", nom: "memes", categorie: "TEXTE" },
        { id: "c3", nom: "musique", categorie: "TEXTE" },
        { id: "c4", nom: "règles", categorie: "INFOS" },
      ],
    }],
    messages: {},
    dm: {},
    emojis: {},              // nom -> fichier (emojis perso, gratuits)
  };
}

let etat;
try { etat = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { etat = etatInitial(); }
for (const c of etat.serveurs[0].canaux) if (!etat.messages[c.id]) etat.messages[c.id] = [];
if (!etat.emojis) etat.emojis = {};

let sauvegardePrevue = null;
function sauver() {
  if (sauvegardePrevue) return;
  sauvegardePrevue = setTimeout(() => {
    fs.writeFile(DATA, JSON.stringify(etat), () => {});
    sauvegardePrevue = null;
  }, 400);
}

const id = () => Math.random().toString(36).slice(2, 10);

// ─────────────────────────────────────────── HTTP
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
               ".js":"text/javascript; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg",
               ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp",
               ".mp4":"video/mp4", ".mp3":"audio/mpeg", ".pdf":"application/pdf",
               ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8" };

const serveur = http.createServer((req, res) => {
  // ── upload gratuit (500 Mo)
  if (req.method === "POST" && req.url.startsWith("/upload")) {
    const nom = decodeURIComponent((req.headers["x-nom-fichier"] || "fichier").slice(0, 120));
    const propre = nom.replace(/[^\w.\-]/g, "_");
    const dest = path.join(UPLOADS, `${id()}_${propre}`);
    let taille = 0;
    const flux = fs.createWriteStream(dest);
    req.on("data", (bloc) => {
      taille += bloc.length;
      if (taille > MAX_FICHIER) { req.destroy(); flux.destroy(); fs.unlink(dest, () => {}); }
    });
    req.pipe(flux);
    flux.on("finish", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ url: "/uploads/" + path.basename(dest), taille, nom }));
    });
    flux.on("error", () => { res.writeHead(500); res.end("{}"); });
    return;
  }

  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";

  const racine = p.startsWith("/uploads/") ? "." : path.join(__dirname, "public");
  const f = path.join(racine, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));

  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("404"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(f)] || "application/octet-stream",
      "Cache-Control": p.startsWith("/uploads/") ? "public, max-age=604800" : "no-cache",
    });
    res.end(buf);
  });
});

// ─────────────────────────────────────────── WebSocket
const wss = new WebSocketServer({ server: serveur, path: "/ws" });
const clients = new Map();
const COULEURS = ["#8a79ff","#eb459e","#ed4245","#fee75c","#57f287","#00a8fc","#f47fff","#ff8a3d"];

const envoyer = (ws, type, data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...data })); };
const diffuser = (type, data, sauf = null) => { for (const [ws] of clients) if (ws !== sauf) envoyer(ws, type, data); };

function membres() {
  const vus = new Map();
  for (const [, c] of clients) if (c.pseudo)
    vus.set(c.userId, { id: c.userId, pseudo: c.pseudo, couleur: c.couleur, banniere: c.banniere });
  return [...vus.values()];
}
const diffuserMembres = () => diffuser("membres", { liste: membres() });

wss.on("connection", (ws) => {
  clients.set(ws, { userId: null, pseudo: null, canalId: "c1", couleur: COULEURS[0], banniere: null });

  envoyer(ws, "init", { serveur: etat.serveurs[0], messages: etat.messages,
                        membres: membres(), emojis: etat.emojis });

  ws.on("message", (brut) => {
    let m; try { m = JSON.parse(brut); } catch { return; }
    const client = clients.get(ws);
    if (!client) return;

    switch (m.type) {
      case "rejoindre": {
        const pseudo = String(m.pseudo || "").trim().slice(0, 24) || "anonyme";
        const connu = Object.values(etat.utilisateurs).find(u => u.pseudo.toLowerCase() === pseudo.toLowerCase());
        const uid = connu ? connu.id : id();
        const couleur = connu ? connu.couleur : COULEURS[Object.keys(etat.utilisateurs).length % COULEURS.length];
        etat.utilisateurs[uid] = { id: uid, pseudo, couleur,
                                   banniere: connu ? connu.banniere : null };
        Object.assign(client, { userId: uid, pseudo, couleur,
                                banniere: etat.utilisateurs[uid].banniere });
        sauver();
        envoyer(ws, "connecte", { moi: { id: uid, pseudo, couleur,
                                         banniere: client.banniere } });
        diffuserMembres();
        break;
      }

      // ── un message (4000 caractères, gratuit)
      case "message": {
        if (!client.pseudo) return;
        const canalId = m.canalId || client.canalId;
        const texte = String(m.texte || "").slice(0, MAX_MESSAGE).trim();
        const fichier = m.fichier || null;
        if (!texte && !fichier) return;
        const msg = { id: id(), auteurId: client.userId, pseudo: client.pseudo,
                      couleur: client.couleur, texte, fichier,
                      date: Date.now(), canalId, reactions: {} };
        (etat.messages[canalId] ||= []).push(msg);
        if (etat.messages[canalId].length > 500) etat.messages[canalId].shift();
        sauver();
        diffuser("message", { msg });
        break;
      }

      // ── réaction (gratuit, tout le monde)
      case "reaction": {
        if (!client.pseudo) return;
        const { messageId, canalId, emoji } = m;
        const liste = etat.messages[canalId];
        console.log(`[reaction] canal=${canalId} msg=${messageId} emoji=${emoji} ` +
                    `liste=${liste ? liste.length : "undefined"} ` +
                    `trouve=${liste ? !!liste.find(x => x.id === messageId) : false} ` +
                    `pseudo=${client.pseudo}`);
        if (!liste) return;
        const msg = liste.find(x => x.id === messageId);
        if (!msg) return;
        msg.reactions ||= {};
        const qui = msg.reactions[emoji] || [];
        const i = qui.indexOf(client.userId);
        if (i >= 0) qui.splice(i, 1); else qui.push(client.userId);
        if (!qui.length) delete msg.reactions[emoji];
        else msg.reactions[emoji] = qui;      // on le rattache, sinon le compteur reste vide
        sauver();
        diffuser("reactions", { messageId, canalId, reactions: msg.reactions });
        break;
      }

      // ── changer sa couleur (Nitro chez Discord, gratuit ici)
      case "couleur": {
        const c = String(m.couleur || "");
        if (!/^#[0-9a-f]{6}$/i.test(c)) return;
        client.couleur = c;
        if (etat.utilisateurs[client.userId]) etat.utilisateurs[client.userId].couleur = c;
        sauver();
        diffuserMembres();
        envoyer(ws, "moi-maj", { couleur: c });
        break;
      }

      // ── changer sa bannière (Nitro chez Discord, gratuit ici)
      case "banniere": {
        const b = String(m.url || "").slice(0, 300);
        client.banniere = b || null;
        if (etat.utilisateurs[client.userId]) etat.utilisateurs[client.userId].banniere = client.banniere;
        sauver();
        diffuserMembres();
        envoyer(ws, "moi-maj", { banniere: client.banniere });
        break;
      }

      // ── emoji perso (Nitro chez Discord, gratuit ici)
      case "emoji-ajouter": {
        const nom = String(m.nom || "").toLowerCase().replace(/[^\w]/g, "").slice(0, 24);
        const url = String(m.url || "");
        if (!nom || !url.startsWith("/uploads/")) return;
        etat.emojis[nom] = url;
        sauver();
        diffuser("emojis", { emojis: etat.emojis });
        break;
      }

      case "canal": {
        client.canalId = String(m.canalId || "c1");
        envoyer(ws, "historique", { canalId: client.canalId,
                                    messages: etat.messages[client.canalId] || [] });
        break;
      }

      case "dm": {
        if (!client.pseudo) return;
        const autre = String(m.avec || "");
        if (!autre || autre === client.userId) return;
        const cle = [client.userId, autre].sort().join("|");
        const texte = String(m.texte || "").slice(0, MAX_MESSAGE).trim();
        if (!texte) return;
        const msg = { id: id(), auteurId: client.userId, pseudo: client.pseudo,
                      couleur: client.couleur, texte, date: Date.now() };
        (etat.dm[cle] ||= []).push(msg);
        if (etat.dm[cle].length > 300) etat.dm[cle].shift();
        sauver();
        for (const [w, c] of clients)
          if (c.userId === client.userId || c.userId === autre)
            envoyer(w, "dm", { msg, cle, avec: autre });
        break;
      }

      case "ouvrir-dm": {
        const autre = String(m.avec || "");
        const cle = [client.userId, autre].sort().join("|");
        envoyer(ws, "historique-dm", { avec: autre, messages: etat.dm[cle] || [] });
        break;
      }

      case "ecrit": {
        if (!client.pseudo) return;
        diffuser("ecrit", { pseudo: client.pseudo, canalId: client.canalId }, ws);
        break;
      }
    }
  });

  ws.on("close", () => { clients.delete(ws); diffuserMembres(); });
});

serveur.listen(PORT, "0.0.0.0", () => {
  console.log(`Plasma écoute sur http://0.0.0.0:${PORT}`);
  console.log(`  messages : ${MAX_MESSAGE} caractères (Discord : 2000)`);
  console.log(`  fichiers : ${MAX_FICHIER/1024/1024} Mo (Discord gratuit : 25 Mo)`);
});
