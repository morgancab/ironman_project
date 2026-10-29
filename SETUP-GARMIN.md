# Synchroniser Garmin avec l'app (une seule fois, ~15 min, gratuit)

```
Garmin Connect ──(synchro native)──▶ intervals.icu ◀──(clé API)── Worker Cloudflare ──▶ l'app
```

Ta montre synchronise Garmin Connect comme d'habitude ; intervals.icu récupère les activités tout seul ; ton Worker
les lit ; l'app coche tes séances. Strava n'est plus utilisé (son API est devenue payante).

> **À savoir** : en octobre 2026, Garmin a durci ses conditions et intervals.icu a annoncé qu'il devrait sans doute
> bloquer les données Garmin dans son API. Rien n'est confirmé à ce jour. Si cela arrive, l'app affichera « Problème »
> avec le message d'erreur, **sans perdre** les activités déjà reçues, et ta saisie manuelle des séances continue de marcher.

## 1. intervals.icu (compte gratuit)

1. Crée un compte sur https://intervals.icu.
2. **Réglages → Connexions (Garmin)** : connecte ton compte Garmin Connect et active le téléchargement des activités.
   Vérifie qu'une de tes dernières sorties apparaît dans intervals.icu.
3. **Réglages → Developer Settings → API Key** : génère une clé et garde-la.

## 2. Héberger l'app (HTTPS)

Dépose `index.html` et `sw.js` sur un hébergement gratuit (Netlify Drop, GitHub Pages, Cloudflare Pages…).
Note son adresse, par exemple `https://ironman-2027.netlify.app`.

## 3. Déployer le Worker

Dans un terminal, dans le dossier `strava-worker` (ce dossier garde son nom d'origine, il ne gère plus Strava) :

1. Ouvre `wrangler.toml` : mets dans `ALLOWED_ORIGIN` l'adresse de l'app **sans chemin** (`https://ironman-2027.netlify.app`).
   Ne laisse pas `file:///…` : ça ne fonctionne pas depuis un iPhone. (`"*"` est accepté pour un premier test.)
2. Déploie :
   ```
   npx wrangler login
   npx wrangler deploy
   ```
   Note l'adresse affichée : `https://ironman-strava.TON-SOUS-DOMAINE.workers.dev`.
3. Enregistre les deux secrets (la commande te demande la valeur) :
   ```
   npx wrangler secret put INTERVALS_API_KEY
   npx wrangler secret put APP_KEY
   ```
   `INTERVALS_API_KEY` = la clé de l'étape 1. `APP_KEY` = une clé que tu inventes pour protéger ton serveur
   (génère-la avec `node -e "console.log(require('crypto').randomUUID())"`).

## 4. Dans l'app

Sur l'iPhone, ouvre l'app installée → bouton réglages en haut à droite de l'**Accueil** (ou onglet **Plus → Réglages**) → **Connexion Garmin** : colle `https://ironman-strava….workers.dev|TA_APP_KEY`
dans « Adresse du serveur » (les deux champs se remplissent), puis touche **Tester et resynchroniser**.

Le bloc **Dernières activités** de l'Accueil indique l'état de la synchro et liste tes dernières sorties (liste complète dans l'onglet **Données**).
Ensuite, plus rien à faire : l'app se met à jour à l'ouverture et toutes les 2 minutes.

## Fonctionnement du cochage

- Chaque activité est associée à la séance du plan de **même discipline** la plus proche, **dans la même semaine ou la semaine
  précédente** : tu peux faire une séance un autre jour que prévu.
- Il faut au moins **50 % de la durée prévue** (50 % de la distance pour la natation), et 10 min minimum.
- Une course lancée **moins d'1 h après un vélo**, le même jour, est associée au **brick**.
- Les autres types d'activité (marche, ski…) sont ignorés. Le renforcement accepte « Musculation » et « Entraînement ».
- Durée et distance **réelles** alimentent le volume réalisé.

**Corriger une association** : ouvre la séance (onglet Semaine) → **Changer** / **Dissocier** / **Associer une activité Garmin**,
ou, dans **Dernières activités** (Accueil) ou en bas de l'onglet **Données**, touche une activité pour choisir sa séance (« Ne pas associer » l'ignore,
« Automatique » rétablit le choix automatique). Décocher une séance liée la dissocie ; une séance cochée à la main n'est jamais écrasée.

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| « Clé invalide » | La clé saisie dans l'app ≠ `APP_KEY` du Worker. |
| « Serveur injoignable » | Adresse du serveur fausse, ou `ALLOWED_ORIGIN` ≠ domaine de l'app (`https://…`, sans `/` final). |
| « intervals.icu refuse la clé » | `INTERVALS_API_KEY` incorrecte : régénère-la et refais `wrangler secret put INTERVALS_API_KEY`. |
| « Aucune synchro réussie » ou 0 activité | Garmin n'est pas connecté dans intervals.icu, ou aucune activité depuis le 1er janvier 2027 (`SINCE`). |
| Activité absente alors qu'elle est dans intervals.icu | Elle vient peut-être de Strava (non exposée par l'API d'intervals.icu) : elle doit venir directement de Garmin. |
| Besoin de comprendre ce que renvoie intervals.icu | Ouvre `https://TON-WORKER/api/debug` avec l'en-tête `Authorization: Bearer TA_APP_KEY` : il liste les champs reçus et les sources. |

## Confidentialité

Le Worker ne garde que, par activité : nom, type, date, durée, distance, FC et puissance moyennes, dénivelé. L'API du Worker exige ta clé ;
ta clé intervals.icu reste côté serveur.

## Plan B si Garmin est bloqué

Garmin Connect permet d'exporter l'historique des activités en fichier CSV (page Activités → Exporter). Un import de ce fichier dans l'app
(semi-automatique, sans serveur) pourrait être ajouté si le besoin se présente.
