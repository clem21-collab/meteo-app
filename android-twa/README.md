# Android / Google Play — Météo V5.0

Ce dossier contient la configuration source de l'application Android Trusted Web Activity (TWA) de **Météo V5.0**.

## Configuration actuelle

- Package Android de travail : `fr.clem.meteo`
- Version : `5.0.0` (`versionCode` 1)
- PWA : `https://clem21-collab.github.io/meteo-app/`
- Manifeste web : `https://clem21-collab.github.io/meteo-app/manifest.webmanifest`
- Outil : Bubblewrap `1.27.0`
- Cible Android : API 36 via Bubblewrap
- Minimum Android : API 24 (Android 7.0), requis par Android Browser Helper 2.7.4
- Notifications TWA : activées
- Fallback : Custom Tabs

> Le package peut encore être modifié tant que l'application n'a pas été créée dans Google Play Console. Une fois utilisé pour une application Play, il doit être considéré comme définitif.

## Générer le projet Android

Prérequis recommandés : Node.js 20 LTS ou supérieur, Java/JDK 17 et Android SDK. Bubblewrap 1.27 nécessite Node.js 18 minimum et peut aider à installer ses dépendances au premier lancement.

```bash
cd android-twa
npm install
npx bubblewrap doctor
npx bubblewrap update --skipVersionUpgrade --manifest=twa-manifest.json
```

Pour un build de test non signé :

```bash
npm run android:build:unsigned
```

Pour le build signé destiné à Google Play :

```bash
npm run android:build
```

Bubblewrap demandera les mots de passe du keystore. Ne jamais versionner `android.keystore`, un fichier `.jks`, les mots de passe ou les secrets Play Console.

## Créer la clé de signature

Si Bubblewrap ne l'a pas déjà créée, utiliser une clé de publication conservée hors du dépôt. Le manifeste attend par défaut :

- chemin : `./android.keystore`
- alias : `meteo`

Conserver une sauvegarde sûre de cette clé et de ses mots de passe. Google Play App Signing pourra ensuite gérer la clé de signature distribuée aux utilisateurs.

## Digital Asset Links / plein écran TWA

Une TWA n'est réellement affichée sans interface navigateur que si le domaine prouve l'association avec l'application Android.

Le fichier doit être disponible à cette adresse exacte :

`https://clem21-collab.github.io/.well-known/assetlinks.json`

Comme la PWA est actuellement hébergée dans le sous-chemin `/meteo-app/`, placer `assetlinks.json` dans ce dépôt donnerait `/meteo-app/.well-known/...`, ce qui ne suffit pas.

### Solution sans nom de domaine payant

Créer un dépôt GitHub Pages utilisateur nommé exactement :

`clem21-collab.github.io`

Puis y publier `.well-known/assetlinks.json` avec l'empreinte SHA-256 fournie par Google Play App Signing.

### Autre solution

Utiliser plus tard un domaine personnalisé dédié à la PWA, puis héberger `/.well-known/assetlinks.json` à sa racine.

Un modèle est fourni dans `assetlinks.template.json`.

## Après la création de l'application Play Console

1. Activer Play App Signing.
2. Ouvrir la page de signature de l'application dans Play Console.
3. Copier l'empreinte SHA-256 / l'extrait Digital Asset Links fourni par Google.
4. Remplacer `PLAY_APP_SIGNING_SHA256` dans le modèle `assetlinks.template.json`.
5. Publier le JSON sur `https://clem21-collab.github.io/.well-known/assetlinks.json`.
6. Vérifier l'association avec l'outil Digital Asset Links de Google.
7. Refaire un build `.aab` et le tester sur le canal de test interne/fermé.

## Publication

Voir le dossier `play-store/` à la racine du dépôt pour la fiche française, le brouillon Sécurité des données et la checklist de publication.
