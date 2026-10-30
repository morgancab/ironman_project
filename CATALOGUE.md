# Catalogue de triathlons : mise à jour automatique

Le catalogue est dans `races.js`. Chaque lundi, GitHub Actions lance `scripts/update-races.mjs`, sans IA et sans coût (dépôt public). Les petits changements sans risque sont publiés tout seuls. Les autres passent par une proposition (pull request) à valider.

## Mise en place (une seule fois)

Sur GitHub, dans **Settings → Actions → General → Workflow permissions** :
- choisis **Read and write permissions** ;
- coche **Allow GitHub Actions to create and approve pull requests**.

Pour un premier essai : onglet **Actions → Mise à jour du catalogue → Run workflow**.

## Chaque semaine

**Publié tout seul** (commit direct sur `main`, puis déploiement Vercel) si toutes ces conditions sont réunies :
- 15 nouvelles courses au maximum ;
- aucune date existante remplacée ;
- aucun désaccord entre sources ;
- aucune source en échec et aucune course ignorée ;
- aucune proposition déjà ouverte.

**Sinon, une proposition s'ouvre :**

1. Tu reçois une notification GitHub.
2. Ouvre la proposition et lis le rapport : sources lues, désaccords, dates ajoutées, nouvelles courses.
3. Vérifie surtout les doublons parmi les nouvelles courses. Corrige ou retire une ligne directement dans la branche si besoin.
4. Clique sur **Merge**. Si Vercel est relié au dépôt, il publie tout seul.

Si tu ne valides pas, la même proposition est simplement mise à jour la semaine suivante.

## Sources

| Source | Lu | Fiabilité |
|---|---|---|
| [Challenge Family](https://challengefamily.com/races/) | Monde | 3 : organisateur |
| [Finishers](https://www.finishers.com/disciplines/triathlons/triathlons-m/triathlons-m-en-france), date « confirmée » | France, L, M, S | 2 : annoncée confirmée |
| [Triatlón Noticias](https://en.triatlonnoticias.com/calendario/calendario-ironman-703-europa-2027/), statut « Confirmed » | 70.3 Europe | 2 : annoncée confirmée |
| [SportsPal](https://thesportspal.com/middle-distance-triathlon-europe) | 70.3 et distance complète, Europe | 1 : calendrier sans statut |
| Finishers, date « à venir » | France | 0 : le mois seulement |

Les épreuves World Triathlon ne sont pas copiées ici : l'app les interroge en direct par l'API officielle (`/pub/races`, voir `strava-worker/worker.js`).

`ironman.com` n'est pas lu automatiquement. Les Ironman d'Europe sont suivis via SportsPal et Triatlón Noticias. Ceux du reste du monde ne le sont pas : leurs dates restent à vérifier à la main, une fois par an.

## Règles

- Une course n'est jamais supprimée.
- Une date manquante est ajoutée, en indiquant sa source.
- Une date n'est remplacée que par une source plus fiable. Sinon, le désaccord est listé sous « À arbitrer » et rien ne change.
- Une date passée est retirée : l'app revient au mois habituel en attendant la prochaine édition.
- Une date hors de la fenêtre aujourd'hui + 2 ans est ignorée.

## Si le script signale une source en échec

Le lancement apparaît en rouge dans l'onglet **Actions** et GitHub t'envoie un e-mail. Le plus souvent, le site a changé sa mise en page : le lecteur correspondant est à adapter dans `scripts/update-races.mjs`. Les autres sources continuent de fonctionner.

GitHub peut désactiver les tâches programmées d'un dépôt public après 60 jours sans activité. Il prévient par e-mail avant : il suffit de réactiver la tâche dans l'onglet **Actions**.

## Lancer à la main

```
node scripts/update-races.mjs --dry   # essai : affiche le rapport sans rien écrire
node scripts/update-races.mjs         # met à jour races.js
```

## Format d'une ligne

`[nom, ville, pays, format, mois habituel (1-12, 0 = inconnu), options]`

- Format : `full`, `half`, `olympic` ou `sprint`.
- Options : `date`, `note` (affichée à l'utilisateur), `src` (source), `rank` (fiabilité), `ff` (calendrier FFTRI), `sw`, `bk`, `rn` (distances en mètres), `bikeUp`, `runUp` (dénivelés).

Le pays doit exister dans `CC_NAMES` (`index.html`) et dans `COUNTRY` (`scripts/update-races.mjs`).
