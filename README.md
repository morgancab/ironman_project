# Plan triathlon

Application web (PWA) de plan d'entraînement triathlon sur mesure. On choisit sa course (sprint, olympique, 70.3, Ironman, ou distances libres), la date et son niveau : l'app construit un plan jour par jour, de 4 à 52 semaines. Elle suit les séances, se synchronise avec Garmin et se retrouve sur tous les appareils via un compte Google.

À l'origine, c'est le plan pour l'Ironman des Sables d'Olonne (27 juin 2027, 25 semaines). Ce plan sert encore de modèle : tous les autres plans en sont déduits.

## Fonctions
- **Plan sur mesure** : phases (Fondation, Développement, Spécifique, Affûtage), blocs de 3 semaines de charge + 1 de décharge, séances détaillées (zones, allures, conseils).
- **Suivi** : séances cochées à la main ou automatiquement depuis Garmin, notes de la semaine, données et estimation du temps de course.
- **Garmin** : les activités arrivent via intervals.icu et cochent les séances ; envoi possible des séances structurées vers la montre.
- **Questionnaire de niveau** (menu Plus → Mon niveau) : sans Garmin, ou avec peu de sorties, un temps récent par discipline (5 km / 10 km / semi, une sortie vélo, 200 m à 1 500 m de natation) suffit pour déduire les allures des séances et estimer le temps de course. Les sorties Garmin passent toujours avant, discipline par discipline.
- **Courses intermédiaires** (menu Plus → Mes courses) : triathlon, course à pied, vélo ou natation, avec un catalogue et une saisie libre. Le jour de la course remplace les séances, les jours autour sont allégés selon la distance et l'importance ; supprimer la course rétablit le plan.
- **Vacances et week-ends** : le plan est allégé ou déplacé pendant une absence.
- **Compte Google** : le plan est enregistré sur l'appareil et dans le compte.
- **Suivi propriétaire** (Plus → Suivi de l'app, réservé aux e-mails du secret `ADMIN_EMAILS`) : comptes, actifs, course choisie, progression et dernière visite de chaque utilisateur.
- **Hors ligne** : installable sur l'écran d'accueil, fonctionne sans réseau.

## Structure du projet

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'application : HTML, CSS et JavaScript, sans dépendance ni étape de compilation. |
| `races.js` | Catalogue des triathlons, mis à jour automatiquement : voir [CATALOGUE.md](CATALOGUE.md). |
| `scripts/`, `.github/workflows/` | Script et tâche hebdomadaire de mise à jour du catalogue. |
| `sw.js` | Service worker (cache hors ligne). Changer le numéro dans `CACHE` à chaque version importante. |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `favicon-48.png` | Installation sur l'écran d'accueil. |
| `strava-worker/` | Serveur Cloudflare Worker : comptes Google, sauvegarde, statistiques, lien avec intervals.icu. Le dossier garde son ancien nom, il ne gère plus Strava. |
| `strava-worker/schema*.sql` | Schéma de la base D1. |

Dans `index.html`, le code est découpé en sections numérotées (constantes, génération du plan, état, vues, rendu et événements, Garmin, comptes). Les vues sont des fonctions `vXxx()` qui renvoient du HTML, regroupées dans l'objet `VIEWS`.

## Lancer en local

Servir le dossier en HTTP sur le port 8080, par exemple :

```
npx serve -l 8080 .
```

Puis ouvrir http://localhost:8080. Pour tester comme un nouvel utilisateur sans toucher à ton vrai profil : [DEV.md](DEV.md) (`?profil=nom`).

## Adresses (URL)

L'adresse reflète la page affichée, ce qui permet de recharger, d'envoyer un lien et d'utiliser le bouton retour :

```
#dash   #week   #data   #race   #more   #plan
#week?w=12            semaine 12
#week?w=12&d=3        semaine 12, jeudi (0 = lundi)
#week?w=12&s=act:ID   avec la fenêtre de l'activité ID ouverte
```

Fenêtres (`s=`) : `settings`, `legal`, `away`, `acts`, `act:ID`, `assoc:ID`, `link:ID`. En plus : `?today=AAAA-MM-JJ` simule une autre date (utile pour les tests).

## Déploiement
- **App** : fichiers statiques sur Vercel (https://ironmanproject.vercel.app). Publier `index.html`, `races.js`, `sw.js`, `manifest.webmanifest` et les icônes.
- **Serveur** : `cd strava-worker && npx wrangler deploy`.

## Documentation
- [DEV.md](DEV.md) : tester en local, profils de test, second compte.
- [CATALOGUE.md](CATALOGUE.md) : mise à jour automatique du catalogue de courses.
- [SETUP-COMPTES.md](SETUP-COMPTES.md) : activer la connexion Google.
- [SETUP-GARMIN.md](SETUP-GARMIN.md) : synchroniser Garmin via intervals.icu.
- [DEMANDE-OAUTH-INTERVALS.md](DEMANDE-OAUTH-INTERVALS.md) : demande d'accès OAuth à intervals.icu.

Les plans sont indicatifs et ne remplacent pas un avis médical.
