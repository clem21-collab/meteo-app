# Backend Web Push — Météo App

Ce Worker vérifie Open-Meteo toutes les 15 minutes et peut envoyer une notification Web Push même si la PWA est fermée.

## Déploiement

1. Créer/ouvrir un compte Cloudflare.
2. Installer Node.js sur le PC.
3. Dans ce dossier :

   npm install
   npx wrangler login

4. Générer les clés VAPID :

   npx web-push generate-vapid-keys

5. Enregistrer les trois valeurs comme secrets Cloudflare :

   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT

   Pour VAPID_SUBJECT, utiliser :

   https://clem21-collab.github.io/meteo-app/

6. Déployer :

   npx wrangler deploy

Wrangler peut provisionner automatiquement le namespace KV déclaré dans wrangler.jsonc.

Après le déploiement, conserver l'URL `https://meteo-push.<sous-domaine>.workers.dev` : elle sera ajoutée à l'application front-end.

## Alertes
- orage : code météo WMO 95/96/99 ;
- neige : 71/73/75/77/85/86 ;
- vent : rafales >= 60 km/h par défaut ;
- pluie : probabilité >= 70 % par défaut.

Le Worker évite de renvoyer le même type d'alerte pendant environ 3 heures.
