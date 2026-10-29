# Checklist de publication Google Play — Météo V5.0

## 1. Compte développeur

- [ ] Créer / vérifier le compte développeur Google Play.
- [ ] Pour une distribution publique complète : régler les frais uniques de 25 USD.
- [ ] Choisir compte personnel ou organisation selon la situation réelle.
- [ ] Terminer la vérification d'identité Google.

## 2. Identité de l'application

- [ ] Confirmer le package définitif `fr.clem.meteo` avant de créer l'application dans Play Console.
- [ ] Créer l'application « Météo V5.0 » dans Play Console.
- [ ] Catégorie : Météo.
- [ ] Déclarer qu'il ne s'agit pas d'une application payante au lancement si publication gratuite.

## 3. Android / TWA

- [ ] Générer le projet Android depuis `android-twa/twa-manifest.json` avec Bubblewrap 1.27.0.
- [ ] Vérifier `targetSdkVersion` / cible API 36.
- [ ] Créer et sauvegarder la clé d'upload hors GitHub.
- [ ] Activer Play App Signing.
- [ ] Générer l'Android App Bundle `.aab` signé.
- [ ] Installer/tester l'APK de test sur un téléphone Android réel.
- [ ] Tester localisation, radar, favoris, réglages, export et notifications.

## 4. Digital Asset Links

- [ ] Créer le dépôt GitHub Pages racine `clem21-collab.github.io` OU configurer un domaine personnalisé.
- [ ] Récupérer l'empreinte SHA-256 de Play App Signing.
- [ ] Compléter `android-twa/assetlinks.template.json`.
- [ ] Publier le fichier à `https://clem21-collab.github.io/.well-known/assetlinks.json`.
- [ ] Vérifier que l'URL renvoie HTTP 200 avec du JSON.
- [ ] Tester que l'application s'ouvre en TWA plein écran et non en Custom Tab.

## 5. Fiche Play Store

- [ ] Utiliser les textes de `STORE_LISTING_FR.md`.
- [ ] Préparer une icône PNG 512 × 512.
- [ ] Préparer l'image de présentation 1024 × 500.
- [ ] Ajouter au moins 2 captures téléphone.
- [ ] Recommandé : captures Aujourd'hui, Radar, Stats, Alertes, Comparer.
- [ ] Vérifier le nom public du développeur affiché sur la fiche.

## 6. Confidentialité et formulaires

- [ ] URL de politique : `https://clem21-collab.github.io/meteo-app/privacy.html`.
- [ ] Vérifier le brouillon `DATA_SAFETY_DRAFT.md` contre le formulaire actuel de Play Console.
- [ ] Remplir la section Sécurité des données.
- [ ] Remplir la classification du contenu.
- [ ] Remplir « Accès à l'application » (aucun compte requis).
- [ ] Remplir le public cible / âge.
- [ ] Répondre aux questions sur la publicité : aucune publicité actuellement.

## 7. Tests Google Play

Pour un compte personnel récent soumis aux règles de test :

- [ ] Créer une version de test interne pour les premiers essais.
- [ ] Créer ensuite un test fermé.
- [ ] Réunir au moins 12 testeurs si la règle s'applique au compte.
- [ ] Garder les testeurs inscrits pendant au moins 14 jours consécutifs si requis.
- [ ] Corriger les retours avant la demande d'accès à la production.

## 8. Avant production

- [ ] Vérifier qu'aucun secret, keystore ou mot de passe n'est dans GitHub.
- [ ] Vérifier la politique de confidentialité depuis un navigateur non connecté.
- [ ] Vérifier les liens de la fiche Store.
- [ ] Vérifier les notifications application fermée après déploiement du Worker V5.
- [ ] Vérifier fonctionnement hors connexion / message de données anciennes.
- [ ] Vérifier affichage téléphone petit écran + grand écran.
- [ ] Incrémenter `appVersionCode` à chaque nouvelle version envoyée à Play.

## 9. Première version suggérée

- Version publique : `5.0.0`
- Version code : `1`
- Canal initial : test interne, puis test fermé, puis production.
