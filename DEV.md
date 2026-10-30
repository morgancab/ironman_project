# Tester l'app en local (profils de test)

L'app demande une connexion Google et enregistre le plan à deux endroits : dans le navigateur (`localStorage`) et dans ton compte (serveur). Résultat : en testant, on retombe toujours sur son propre plan. Voici comment tester « comme un autre utilisateur ».

## 1. Le plus simple : un profil de test (`?profil=`)

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
