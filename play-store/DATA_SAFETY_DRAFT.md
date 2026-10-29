# Brouillon — Sécurité des données Google Play

> Document de préparation. Les réponses finales doivent être vérifiées dans Play Console au moment de la publication, car Google distingue précisément données « collectées », « partagées », traitement éphémère et fournisseurs de services.

## Compte utilisateur

- Création de compte dans Météo V5.0 : **non**.
- Connexion utilisateur : **non**.

## Publicité / suivi

- Publicité intégrée : **non**.
- SDK publicitaire : **non**.
- Profilage publicitaire : **non**.

## Données potentiellement concernées

### Localisation précise

**Oui, utilisée de façon facultative** quand l'utilisateur autorise sa position.

Usages :
- afficher la météo locale ;
- centrer le radar ;
- récupérer qualité de l'air / pollens ;
- configurer les alertes météo automatiques.

Lorsque les notifications automatiques sont activées, latitude/longitude, ville et département sont envoyés au backend de notifications afin de déterminer quelles alertes envoyer.

Réponse Play Console probable :
- collectée : **oui** lorsque les alertes serveur sont activées ;
- facultative : **oui** ;
- finalité : **fonctionnalité de l'application** ;
- chiffrement en transit : **oui (HTTPS)**.

Le statut « partagée avec des tiers » doit être confirmé selon la qualification des services météo comme prestataires et selon les définitions Play en vigueur.

### Identifiant technique de notification push

L'abonnement push contient un endpoint et des clés techniques nécessaires à la livraison des notifications.

Réponse à confirmer dans Play Console : cette donnée peut relever de la catégorie « Identifiants de l'appareil ou autres identifiants » selon la manière dont Google classe l'endpoint de notification utilisé par la TWA / le navigateur.

Finalité : fonctionnalité de l'application / notifications demandées par l'utilisateur.

### Préférences et réglages

Favoris, ordre des blocs, unités, thème et préférences d'interface sont principalement enregistrés en local sur l'appareil.

Les réglages nécessaires aux alertes automatiques sont transmis au backend avec l'abonnement push afin de respecter les seuils choisis.

### Données météo / historique

Les données météo affichées ne sont pas des données personnelles de l'utilisateur. Elles proviennent de services météo externes.

## Services externes utilisés

- Open-Meteo
- Météo-France
- RainViewer
- OpenStreetMap
- Cloudflare Worker / KV pour le backend d'alertes
- service de notifications push du navigateur / appareil

## Sécurité

- Communications applicatives : HTTPS.
- Aucun mot de passe utilisateur n'est demandé par Météo V5.0.
- Aucun numéro de carte bancaire n'est demandé par Météo V5.0.
- Aucun secret de signature Android ne doit être intégré au dépôt public.

## Suppression

- Les préférences locales peuvent être supprimées via l'effacement des données de l'application / du site.
- Les autorisations de localisation et de notifications peuvent être retirées depuis Android ou le navigateur.
- Une demande concernant les données de notification côté serveur peut être adressée au développeur via le profil GitHub indiqué dans la politique de confidentialité.

## Cases à vérifier juste avant publication

- [ ] « Données collectées » : localisation précise.
- [ ] « Données partagées » : vérifier la définition Play pour Open-Meteo / autres prestataires.
- [ ] « Identifiants de l'appareil ou autres identifiants » : vérifier le classement de l'endpoint push.
- [ ] Confirmer que toutes les données collectées sont chiffrées en transit.
- [ ] Confirmer le mécanisme de demande de suppression affiché dans la fiche Play.
- [ ] Vérifier que la politique de confidentialité publique correspond exactement au comportement de la version envoyée.
