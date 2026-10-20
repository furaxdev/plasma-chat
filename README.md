# Plasma

Un Discord à nous. Même interface, notre direction artistique, et **gratuit**
pour ce que Discord fait payer.

## Ce qui est gratuit ici

| Fonction | Discord gratuit | Plasma |
|---|---|---|
| Longueur d'un message | 2 000 | **4 000** |
| Taille d'un fichier | 25 Mo | **500 Mo** |
| Réactions | oui | oui |
| Couleur de pseudo | Nitro | **gratuit** |
| Bannière de profil | Nitro | **gratuit** |
| Avatar animé | Nitro | **gratuit** |

## Lancer

```bash
npm install
node server.js
# -> http://localhost:3100
```

Une seule dépendance : `ws`. Pas de base de données, un fichier JSON.

## Les tests

```bash
node test.js          # 24 vérifications : connexion, canaux, messages, membres
node test-nitro.js    # 18 vérifications : les fonctions Nitro gratuites
```

## L'interface

La structure est celle de Discord, au pixel : rail de serveurs, colonne de
canaux par catégories, chat, liste des membres, zone de saisie, barre
d'utilisateur.

La direction artistique est à nous : fond `#131315`, accent `#8a79ff`,
Outfit pour les titres, Inter pour le texte, bords plus ronds.

## Ce qui n'est pas fait

- la voix et le partage d'écran
- les rôles et permissions
- les serveurs multiples (un seul pour l'instant)
- les emojis perso (le serveur les gère, l'interface pas encore)
