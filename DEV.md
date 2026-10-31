# Tester l'app en local

## Démarrage rapide

1. Lance le projet : `npx serve -l 8080 .`
2. Ouvre le mode test : [http://localhost:8080/dev.html](http://localhost:8080/dev.html)
3. Choisis un appareil, une page, un profil et une date : l'aperçu se met à jour tout seul.

Ce guide est aussi l'onglet **Guide** du mode test (`dev.html#guide`). Il affiche le fichier `DEV.md`.

## Référence des paramètres

Forme d'une adresse : les paramètres `?…` d'abord, la page `#…` ensuite.

```
http://localhost:8080/?profil=embrun&appareil=iphone-safari&today=2027-03-01#week?w=12&d=3
                       └─ paramètres (ordre libre) ────────────────────────┘└─ page ─────┘
```

| Paramètre | Valeurs possibles | Effet | Actif |
|---|---|---|---|
| `profil` | Nom libre : lettres sans accent, chiffres, `-` et `_`, 24 caractères maximum | Ouvre un utilisateur de test séparé | En local |
| `appareil` | Un nom de la liste ci-dessous | Affiche l'app à la taille de cet appareil, qui croit tourner dessus | En local |
| `today` | Date `AAAA-MM-JJ` | Simule la date du jour | **Partout, site en ligne compris** |
| `reset` | `1` | Vide le profil de test à l'ouverture, puis disparaît de l'adresse | En local, avec `profil` |

### `profil` : le nom n'est qu'une étiquette

- **Il ne choisit pas le plan** : `?profil=sprint` ne crée pas un plan sprint. Un nouveau nom démarre toujours vide, sur l'écran « Ta course », et c'est là que tu choisis la course.
- **Un nom non valide est ignoré sans prévenir** : un accent, une espace ou plus de 24 caractères ouvrent **ton vrai plan**. Vérifie la présence du bandeau orange « PROFIL TEST ».
- **Exemples valides** : `sprint`, `embrun`, `test-2`, `nouveau_user`.
- **Sans `profil`** : c'est ton vrai plan.

### `appareil` : les 12 valeurs

| Valeur | Appareil | Taille | Page d'installation |
|---|---|---|---|
| `iphone-safari` | iPhone, Safari | 390 × 844 | Les 3 gestes |
| `iphone-chrome` | iPhone, Chrome | 390 × 844 | Les 3 gestes |
| `iphone-installee` | iPhone, app installée | 390 × 844 | Ouvre directement l'app |
| `ipad-safari` | iPad, Safari | 820 × 1180 | Les 3 gestes |
| `android-chrome` | Android, Chrome | 412 × 915 | Bouton « Installer l'app » |
| `android-samsung` | Android, Samsung Internet | 412 × 915 | Les 2 gestes |
| `android-firefox` | Android, Firefox | 412 × 915 | Les 2 gestes |
| `instagram-iphone` | Dans Instagram, iPhone | 390 × 844 | Passer au navigateur |
| `facebook-android` | Dans Facebook, Android | 412 × 915 | Passer au navigateur |
| `ordi-chrome` | Ordinateur, Chrome | 1280 × 800 | Bouton « Installer l'app » |
| `ordi-safari` | Mac, Safari | 1440 × 900 | QR code |
| `ordi-firefox` | Ordinateur, Firefox | 1280 × 800 | QR code |

Une valeur inconnue est ignorée : la page s'affiche normalement.

### Pages (`#…`)

| Valeur | Page |
|---|---|
| `#dash` | Accueil |
| `#week` | Semaine |
| `#plan` | Vue d'ensemble du plan |
| `#data` | Données |
| `#race` | Course |
| `#more` | Plus |
| `#admin` | Suivi de l'app (réservé au propriétaire) |

Options, à la suite de la page :

| Option | Valeurs | Effet |
|---|---|---|
| `w` | Numéro de semaine, de 1 au nombre de semaines du plan | Avec `#week` : ouvre cette semaine |
| `d` | De `0` (lundi) à `6` (dimanche) | Avec `#week` : va à ce jour |
| `s` | Une fenêtre de la liste ci-dessous | Ouvre cette fenêtre, sur n'importe quelle page |

Fenêtres (`s`) :

| Valeur | Fenêtre |
|---|---|
| `settings` | Réglages |
| `legal` | Mentions légales |
| `away` | Absences et vacances |
| `acts` | Toutes les activités |
| `level` | Questionnaire de niveau |
| `steps` | Courses intermédiaires |
| `act:ID` | Détail d'une activité |
| `assoc:ID` | Associer une activité à une séance |
| `link:ID` | Associer une séance à une activité |

### Adresses

| Adresse | Résultat |
|---|---|
| `http://localhost:8080/` | Ton vrai plan |
| `http://localhost:8080/?profil=embrun#dash` | L'app, avec le profil de test `embrun` |
| `http://localhost:8080/dev.html` | Le mode test complet |
| `http://localhost:8080/installer.html?appareil=iphone-safari` | La page d'installation, vue sur iPhone |
| `http://localhost:8080/installer` | La page d'installation avec `npx serve`. Avec un autre serveur local, utilise `installer.html`. |

Ces adresses ne marchent que si le serveur local tourne (`npx serve -l 8080 .`). Sinon, le navigateur n'affiche rien.

`www.localhost.com` n'est **pas** ton ordinateur : écris toujours `localhost`, sans `www` ni `.com`.

Écris `/installer` sans `/` à la fin : avec `/installer/`, la page cherche ses images et ses fichiers au mauvais endroit.

### Exemples

À ajouter après `http://localhost:8080/`. Les dates sont à adapter à la course du profil.

```
Nouvel utilisateur, de zéro :       ?profil=nouveau&reset=1
Nouvel utilisateur sur iPhone :     ?profil=nouveau&reset=1&appareil=iphone-safari
Plan avant son début :              ?profil=embrun&today=2026-11-15#plan
Semaine 12, jeudi, sur Android :    ?profil=embrun&appareil=android-chrome#week?w=12&d=3
Veille de course :                  ?profil=embrun&today=2027-06-26#week
Réglages ouverts, sur ordinateur :  ?profil=embrun&appareil=ordi-chrome#dash?s=settings
```

## Changer d'écran depuis un profil de test

Dans le bandeau orange de `http://localhost:8080/?profil=sprint#dash`, la liste **Cet écran** propose tous les appareils. Choisis-en un : l'app s'affiche à sa taille, et l'adresse le garde.

```
http://localhost:8080/?profil=sprint&appareil=iphone-safari#dash
http://localhost:8080/?profil=sprint&appareil=ordi-chrome&today=2027-03-01#plan
```

La liste reste au-dessus de l'aperçu. **Cet écran** y revient à l'affichage normal.

## Le mode test

`dev.html` regroupe les mêmes réglages sur une seule page, avec ce guide.

| Réglage | À quoi ça sert |
|---|---|
| Appareil et navigateur | L'écran prend la taille de l'appareil, et la page croit tourner dessus. |
| Page | La page d'installation ou l'un des écrans de l'app. |
| Profil de test | Un nom égale un utilisateur séparé. Ton vrai plan n'est jamais touché. |
| Date simulée | Voir le plan avant le début, en pleine semaine ou après la course. **Réel** revient à la date du jour. |
| Vider le profil | Repart de zéro, comme un nouvel utilisateur. Ne vide que le profil de test choisi. |
| Ouvrir dans un onglet | Pour utiliser les DevTools sur la page seule. |

### Ce que chaque appareil montre

| Appareil | Page d'installation |
|---|---|
| iPhone (Safari, Chrome), iPad | Les 3 gestes : Partager, Sur l'écran d'accueil, Ajouter |
| iPhone · App installée | Ouvre directement l'app |
| Android · Chrome | Le bouton « Installer l'app » |
| Android · Samsung Internet, Firefox | Les 2 gestes dans le menu du navigateur |
| Dans une appli (Instagram, Facebook) | Le message pour passer au navigateur, et « Copier le lien » |
| Ordinateur · Chrome | Le bouton « Installer l'app » |
| Ordinateur · Safari, Firefox | Le QR code |

Pour ajouter un appareil : une ligne dans `dev-appareil.js`. Il apparaît tout seul dans le mode test.

### Ce que le mode test ne remplace pas

Il simule ce que la page **détecte**, mais le moteur reste celui de ton navigateur : l'aperçu « iPhone · Safari » tourne en réalité dans ton Chrome.

- **Il détecte bien** : les textes et les parcours selon l'appareil, et la mise en page à cette taille d'écran.
- **Il ne détecte pas** : les défauts d'affichage propres à Safari, le comportement du tactile, ni la vraie installation (le bouton « Installer l'app » fait semblant, sans rien installer).
- **Avant de partager largement** : essaie la vraie installation sur un vrai iPhone et un vrai Android, depuis le site en ligne.

Pour l'adresse `http://192.168.x.x:8080` depuis un téléphone sur le même wifi, `?profil=` et `?appareil=` sont ignorés (ils ne marchent que sur `localhost`) : l'app s'ouvre comme pour un vrai utilisateur.

### Garde-fous du mode test
- `dev.html` et `dev-appareil.js` ne sont pas publiés sur Vercel (`.vercelignore`), et refusent de fonctionner hors local.
- Sur le site en ligne, `?appareil=` est ignoré : `dev-appareil.js` n'est même pas chargé.

## 1. Les profils de test (`?profil=`)

C'est ce que le mode test utilise. Tu peux aussi l'écrire toi-même dans l'adresse locale, sans passer par `dev.html`.

L'app demande une connexion Google et enregistre le plan à deux endroits : dans le navigateur (`localStorage`) et dans ton compte (serveur). Résultat : sans profil de test, on retombe toujours sur son propre plan.

Ajoute `?profil=un-nom` à l'adresse locale :

```
http://localhost:8080/?profil=sprint
http://localhost:8080/?profil=half&today=2027-03-01#plan
```

Chaque nom ouvre un **espace isolé et vide** : l'app démarre sur « Ta course », comme pour un nouvel utilisateur. Ton vrai profil n'est jamais touché.

| Ce que fait le profil de test | Détail |
|---|---|
| Stockage séparé | Une clé `localStorage` par nom (`ironman-sables-2027:v1:dev-sprint`). Autant de profils que tu veux. |
| Pas de connexion Google | L'écran de connexion obligatoire est ignoré. |
| Pas de synchronisation | Ni sauvegarde automatique dans un compte, ni sauvegarde par code. Tes données serveur ne peuvent pas être écrasées. |
| Pas de statistiques | Aucun événement n'est envoyé (tes tests ne faussent pas les stats d'usage). |
| Pas de cache hors ligne | Le service worker est désinstallé et son cache vidé : tes modifications du code apparaissent au rechargement. |
| Bandeau orange | « PROFIL TEST · nom » en haut de l'écran, pour ne pas confondre avec ton vrai profil. |

**Repartir de zéro** : ajoute `&reset=1` une fois (`?profil=sprint&reset=1`). Le profil est vidé, puis le paramètre disparaît de l'adresse.

**Ouvrir sans profil** (`http://localhost:8080/`) te ramène sur ton vrai plan.

**Combiner avec les autres paramètres** :
- `today=AAAA-MM-JJ` simule une autre date du jour (avant le début du plan, en pleine semaine, après la course…).
- `#plan`, `#week?w=12`, `#data?s=acts`… ouvrent directement une page ou une fenêtre (voir les URL dans `index.html`, bloc « Routage par URL »).

### Garde-fous
- Actif **uniquement** sur `localhost`, `127.0.0.1`, `[::1]` et les fichiers ouverts depuis le disque (`file://`). Sur le site en ligne, `?profil=` est ignoré.
- Une connexion Google reste possible dans un profil de test (Réglages → Compte), mais l'app n'envoie jamais le plan du profil de test vers le compte (la connexion elle-même est bien enregistrée côté serveur, comme toute connexion). Si tu te connectes avec ton vrai compte et qu'un plan existe déjà, l'app propose de le charger dans le profil de test. Accepte seulement si c'est voulu.
- Les profils de test ne sont jamais supprimés automatiquement. Pour tous les effacer : DevTools → Application → Local Storage → supprimer les clés qui contiennent `:dev-`.

## 2. Tester le vrai parcours (connexion Google, compte, synchronisation)

Le profil de test saute la connexion. Pour vérifier la connexion Google et la synchronisation du compte, il faut un vrai second compte :

1. Crée un compte Gmail gratuit réservé aux tests (une adresse `toi+test@gmail.com` ne convient pas : Google ne la traite pas comme un compte séparé).
2. Ouvre `http://localhost:8080` dans une **fenêtre de navigation privée** (stockage vide à chaque fois) ou dans un **second profil Chrome**.
3. Connecte-toi avec le compte de test.
4. Pour repartir de zéro : Réglages → Compte → supprimer le compte, puis ferme la fenêtre privée.

Ne te connecte pas avec un autre compte Google dans le **même navigateur** que ton vrai profil : à la connexion, l'app envoie les données locales vers le compte si celui-ci est vide, et tu copierais ton plan Sables dans le compte de test.

`http://127.0.0.1:8080` a un stockage séparé de `localhost:8080`, mais la connexion Google n'y marche que si cette origine est ajoutée dans la console Google (« Origines JavaScript autorisées », voir [SETUP-COMPTES.md](SETUP-COMPTES.md)).

## 3. Lancer l'app en local

Il suffit de servir le dossier du projet en HTTP sur le port 8080, par exemple :

```
npx serve -l 8080 .
```

Le serveur Cloudflare (`strava-worker`) accepte déjà `http://localhost:8080`, `http://127.0.0.1:8080` et `http://localhost:8081` (variable `ALLOWED_ORIGIN` de `strava-worker/wrangler.toml`). Pour un autre port, ajoute-le à cette liste et redéploie (`npx wrangler deploy`).

## Si une modification n'apparaît pas

Hors profil de test, l'app se met en cache pour fonctionner hors ligne (`sw.js`) : une page peut rester une version en retard au premier rechargement. Recharge deux fois, ou DevTools → Application → Service Workers → « Update on reload ». Les profils de test n'ont pas ce problème.
