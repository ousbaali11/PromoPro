# Solution PromoPro — entraînement complet dans Google Colab

Deux carnets et ce guide. Aucune ligne de code à modifier.

## Ce qu'il vous faut

- Un compte Google (Colab et Drive gratuits).
- Les deux fichiers de ce dossier : `01-entrainement-complet.ipynb` et `02-evaluation-final.ipynb`.
- Pour l'évaluation seulement : `villa_plan_2d.png` et `villa_plan_2d.gemini.json` (dans `scripts/prototypes/plans/reels/` du projet).

## Étape A — lancer l'entraînement complet

1. Ouvrez https://colab.research.google.com dans votre navigateur, connecté à votre compte Google.
2. Menu **Fichier → Importer le notebook → Importer** : choisissez `01-entrainement-complet.ipynb`.
3. Menu **Exécution → Modifier le type d'exécution** : choisissez **GPU** (T4), puis **Enregistrer**. À faire une seule fois.
4. Menu **Exécution → Tout exécuter**. Inutile de cliquer cellule par cellule.
5. Une fenêtre demande l'accès à Google Drive : cliquez **Se connecter à Google Drive**, choisissez le même compte, puis **Tout autoriser**. C'est là que l'avancement est sauvegardé.
6. Laissez l'onglet ouvert. Vous verrez défiler les lignes `époque 1/15 … 2/15 …`.

Durée : la première fois, environ 15 à 30 minutes de préparation (téléchargement du jeu de données et rastérisation de 13 000 plans, faite une seule fois), puis **25 à 40 minutes par époque**, 15 époques au total, soit **8 à 10 heures de GPU**.

## Si la session se déconnecte (c'est normal avec Colab gratuit)

Colab coupe la session après une longue inactivité ou quand le quota de GPU gratuit du jour est atteint. Dans ce cas :

1. Rouvrez le carnet (il est dans Colab, menu **Fichier → Ouvrir le notebook → Récents**).
2. Menu **Exécution → Tout exécuter**.

C'est tout : le carnet retrouve sur votre Drive les images préparées et la dernière époque terminée, et **reprend là où il s'était arrêté**. Comptez 3 à 6 sessions sur plusieurs jours pour aller au bout. Si Colab refuse le GPU (« aucun GPU disponible »), réessayez quelques heures plus tard.

## Étape B — à la toute fin : le fichier à me transmettre

Quand la dernière cellule affiche `ONNX écrit : … promopro-plan3d.onnx — 9x,x Mo` puis `Fichier téléchargé`, le navigateur télécharge **`promopro-plan3d.onnx`** (environ 97 Mo). Il est aussi sur votre Drive, dossier `promopro-ia`.

**C'est ce fichier `promopro-plan3d.onnx` qu'il faut me redonner** : je l'intégrerai moi-même dans le site comme « Solution PromoPro ». Rien d'autre n'est nécessaire.

## Étape C (facultative) — vérifier le résultat sur le plan de villa

1. Importez `02-evaluation-final.ipynb` dans Colab (Fichier → Importer le notebook). Pas besoin de GPU.
2. Exécutez les cellules **une par une** (bouton ▶ à gauche de chaque cellule) : la cellule 1 lit le modèle sur votre Drive, la cellule 2 demande `villa_plan_2d.png`, la cellule 4 demande `villa_plan_2d.gemini.json`.
3. Lisez la ligne `pièces retrouvées (IoU ≥ 0,7) : N/9` et `portes : Gemini 2, modèle N`. Envoyez-moi ces lignes et l'image `masque_seul.png` téléchargée.

## En cas d'erreur rouge

Ne corrigez rien vous-même : copiez le texte rouge complet et envoyez-le-moi, je vous renverrai un carnet corrigé entier à réimporter.
