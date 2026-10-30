# Activer les comptes (connexion Google)

Le code est déjà déployé. Il reste 4 choses à faire de ton côté (10 à 15 minutes). Tant que ce n'est pas fait, le bouton Google est simplement masqué dans l'app.

## 1. Créer l'identifiant client Google (gratuit)
1. Va sur https://console.cloud.google.com et crée un projet (par exemple « Plan triathlon »).
2. **API et services → Écran de consentement OAuth** : type **Externe**, nom de l'app « Plan triathlon », ton e-mail comme contact. Ajoute seulement les autorisations de base (e-mail, profil). Puis **Publier l'application** (passer de « Test » à « En production »), sinon seuls les testeurs déclarés pourront se connecter. Les autorisations de base n'exigent pas de vérification Google.
3. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - type d'application : **Application Web**
   - **Origines JavaScript autorisées** : `https://ironmanproject.vercel.app` (ou ta nouvelle adresse) et `http://localhost:8080` pour tes tests
   - pas d'URI de redirection nécessaire
4. Copie l'**ID client** (il se termine par `.apps.googleusercontent.com`). Il est public, ce n'est pas un secret.

## 2. Le renseigner dans le serveur
Dans `strava-worker/wrangler.toml`, remplis la ligne :

```
GOOGLE_CLIENT_ID = "123456-xxxxx.apps.googleusercontent.com"
```

## 3. Créer le secret de session (à saisir toi-même)
Dans un terminal, dossier `strava-worker` :

```
node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
npx wrangler secret put SESSION_SECRET
```

Colle la valeur affichée par la première commande quand la seconde la demande. Ne la partage jamais : quiconque la connaît peut se faire passer pour n'importe quel utilisateur.

## 4. Déployer
```
npx wrangler deploy
```
Puis republie sur Vercel : `index.html`, `sw.js`, `manifest.webmanifest` et les fichiers `icon-*.png`, `apple-touch-icon.png`, `favicon-48.png`.

## Vérifier
- `https://ironman-strava.morgancabironman.workers.dev/pub/config` doit afficher ton ID client.
- Dans l'app : Réglages (bouton en haut à droite de l'Accueil) → groupe **Compte** → « Continuer avec Google ».

## Ce qui est enregistré pour chaque utilisateur
Identifiant Google, e-mail, nom, dates de création, de dernière connexion et de dernière visite, nombre de séances faites et prévues, et son plan (course, séances cochées, réglages). Jamais la clé intervals.icu. Chaque utilisateur peut exporter ses données et supprimer son compte depuis Réglages → Compte.

## Suivre l'app (propriétaire)
**Plus → Suivi de l'app** (`#admin`) affiche la vue d'ensemble et, pour chaque compte, la course choisie, la progression et la dernière visite. L'accès est vérifié par le serveur : seuls les e-mails Google listés dans le secret `ADMIN_EMAILS` y ont droit.

```
npx wrangler d1 execute triathlon-stats --remote --file schema4.sql
npx wrangler secret put ADMIN_EMAILS
npx wrangler deploy
```

La première commande ne se lance qu'une fois. L'entrée du menu apparaît quelques secondes après l'ouverture de l'app, une fois la version à jour publiée.

Pour consulter la base : `npx wrangler d1 execute triathlon-stats --remote --command "SELECT email, name, created, last_login FROM users"`.
