# Météo App V3

Application météo web/PWA avec :
- météo réelle via Open-Meteo ;
- recherche mondiale ;
- prévisions heure par heure et sur 7 jours ;
- favoris ;
- radar pluie RainViewer ;
- carte OpenStreetMap ;
- animations météo ;
- thème jour/nuit ;
- alertes pluie, vent, neige et orage ;
- notifications navigateur ;
- installation sur Android comme application PWA.

## Publication
Le projet est prêt pour GitHub Pages depuis la branche `main` et le dossier `/ (root)`.

## Notifications
Les notifications de test et les alertes à l’ouverture fonctionnent en HTTPS. Pour de vraies notifications push lorsque l’application est totalement fermée, un service Web Push côté serveur sera nécessaire.

## Accès Créateur

Le compte Créateur est provisionné par l’administrateur du Worker Cloudflare existant. Il donne accès à Premium sans paiement ni date d’expiration. Les fonctionnalités Premium ajoutées à la PWA doivent utiliser `window.meteoPremium.isActive()`. Une nouvelle route Premium doit aussi vérifier `creatorEntitlement(request, env)` côté Worker.

1. Dans `push-worker`, après avoir installé les dépendances et ouvert la session Cloudflare, génère un code aléatoire de 64 caractères hexadécimaux avec `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Garde-le dans ton gestionnaire de mots de passe.
2. Déploie le Worker mis à jour avec `npx wrangler deploy`, puis enregistre le code dans le secret `CREATOR_PAIRING_CODE` via `npx wrangler secret put CREATOR_PAIRING_CODE`. Utilise le Worker déjà configuré dans `push-client.js` et conserve ses réglages Web Push. Le code ne doit jamais être ajouté au dépôt.
3. Une fois GitHub Pages à jour, ferme puis rouvre la PWA sur le téléphone. En bas de page, ouvre **Accès Créateur**, colle le code et choisis **Associer ce téléphone**. Pour recevoir les alertes intelligentes en arrière-plan, ouvre **Réglages → Alertes intelligentes** et choisis **Enregistrer les alertes**.

Le navigateur conserve un jeton limité à cet accès et le Worker le vérifie en ligne. **Dissocier ce téléphone** efface le jeton de ce navigateur. Pour invalider les jetons existants (téléphone perdu, par exemple) et les anciennes inscriptions aux alertes intelligentes, remplace le secret par un nouveau code puis associe à nouveau le téléphone. Garde le code et les jetons privés. Les favoris et les statistiques restent des fonctions locales de la PWA et utilisent des données publiques.

Le Worker Web Push existant conserve une seule inscription par type d’alertes. Les anciens abonnements intelligents V5 doivent être réenregistrés après l’association.
