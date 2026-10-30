# Demande d'accès OAuth à intervals.icu

But : remplacer le copier-coller de la clé API par un bouton « Se connecter avec intervals.icu ». Gratuit, sans e-mail à envoyer : c'est un formulaire en ligne.

## Comment faire
1. Connecte-toi à **intervals.icu** avec le compte qui sera propriétaire de l'application (ton compte).
2. Ouvre le formulaire : https://intervals.icu/oauth/apply
3. Remplis-le avec les réponses ci-dessous.
4. L'application apparaît dans **Settings → Apps** (visible de toi seulement) avec l'état « Pending ». Tu reçois un e-mail et une notification quand elle est approuvée. Tant qu'elle est « Pending », on ne peut pas tester la connexion.
5. Dans **Manage App**, tu récupères le `client_id` et le `client_secret`, et tu peux enregistrer les adresses de retour.
6. **Dis-moi quand c'est approuvé** et donne-moi le `client_id` (il est public). Le `client_secret` ne doit pas être collé dans la conversation : tu le saisiras toi-même avec `npx wrangler secret put INTERVALS_CLIENT_SECRET`, comme pour le secret de session.

Quand tout marche, il faudra écrire à support@intervals.icu pour que l'application figure dans l'annuaire public (avec le lien de la page « Manage App »). Ce n'est pas nécessaire pour l'utiliser.

## Réponses à donner (en anglais, la langue du service)

**Application name**
Plan triathlon

**Short description**
A free triathlon training plan app. Users pick their race (sprint to full distance), get a day-by-day plan, and connect their Garmin through intervals.icu so their completed sessions are ticked automatically and planned workouts can be sent to their watch.

**What data do you access and why?**
- Read activities: to match completed workouts to the training plan and show progress statistics.
- Write calendar events: to send the planned structured workouts to the user's intervals.icu calendar so they reach their Garmin watch (only on explicit user action).
- Read sport settings: heart-rate zones used to personalise targets.

**Website**
https://ironmanproject.vercel.app (update if the project is renamed)

**Logo**
https://ironmanproject.vercel.app/icon-512.png (public once the site is republished)

**Redirect URI**
https://ironman-strava.morgancabironman.workers.dev/pub/oauth/intervals/callback

Rappel : les adresses de retour n'acceptent pas de joker (*), chaque adresse doit être enregistrée en entier. `http://localhost/` est toujours autorisé pour les tests.

**Webhooks**
Not needed at first. Later: activity-created notifications, to refresh a user's activities instantly instead of polling.

## Scopes à demander
Les noms exacts figurent dans le formulaire. Demande le minimum : lecture des activités, écriture du calendrier (envoi des séances), et lecture des réglages de sport. Le service cite par exemple `ACTIVITY:WRITE` et `WELLNESS:WRITE` dans sa documentation ; n'ajoute pas ce dont on n'a pas besoin (bien-être, écriture d'activités).

## Ce que je construirai une fois l'accès approuvé
- Le bouton « Se connecter avec intervals.icu » dans l'assistant Garmin, à la place de l'étape « Colle ta clé API ».
- La route de retour du serveur (échange du code contre le jeton, avec PKCE) et le stockage du jeton dans le compte de l'utilisateur, pour que la connexion le suive sur tous ses appareils.
- Rien ne change pour ceux qui ont déjà collé une clé : elle continue de marcher.

À savoir : intervals.icu n'utilise pas de jeton de rafraîchissement, seulement un jeton d'accès. Un développeur a signalé des erreurs 403 après quelques heures ; on gérera le cas en demandant simplement à l'utilisateur de se reconnecter.
