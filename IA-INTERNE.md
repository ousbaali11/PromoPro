# Solution PromoPro — IA interne de reconstruction 3D à partir d'un plan 2D

État au 1er octobre 2026. Objectif : ne plus dépendre d'un service tiers
payant pour produire le modèle 3D d'un bien depuis son plan 2D. Nom
d'affichage : « Solution PromoPro », carte présente dans `/admin/plan3d` en
état « En développement — pas encore activable » (aucune clé, aucune
activation, absente du bac à sable) tant qu'un modèle n'a pas été validé sur
de vrais plans, exactement comme pour Gemini.

## 1. Ce que l'on cherche

Un modèle qui, à partir de l'image d'un plan, donne les **murs**, les
**portes** et les **fenêtres** (au pixel près ou en polygones) ; les pièces se
déduisent des murs (composantes connexes du sol), l'extrusion en `.glb` est
déjà écrite (`scripts/prototypes/plan-vers-glb.ts`). Les **noms de pièces**
sont un problème distinct : un modèle de segmentation ne lit pas le texte, il
faudra un OCR (par exemple `tesseract.js`, Apache-2.0) ou garder « Pièce N ».
Gemini, lui, lit les noms.

Critères imposés : poids **téléchargeables** (pas seulement un code
d'entraînement), licence permettant **l'usage commercial**, framework vivant.

## 2. Modèles déjà entraînés trouvés (étape 1)

| Candidat | Poids téléchargeables | Licence du code | Données d'entraînement et leur licence | Framework, âge | Verdict |
|---|---|---|---|---|---|
| **CubiCasa5k** (Aalto, [github](https://github.com/CubiCasa/CubiCasa5k)) | oui (`model_best_val_loss_var.pkl`, Google Drive) | CC BY-NC 4.0 ([LICENSE](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE)) | CubiCasa5K, CC BY-NC 4.0 | PyTorch 1.0, Python 3.6, 2019, abandonné | **Exclu** : non commercial, sauf licence payante à demander à cubicasa.com (une demande publique de 2024 est restée ouverte) |
| **Yytsi/floorplan-to-3d-walls** ([HF](https://huggingface.co/Yytsi/floorplan-to-3d-walls)) | oui (`best.safetensors`, 98 Mo) | MIT | CubiCasa5K, CC BY-NC 4.0 | PyTorch, U-Net + ResNet-34, 4 classes (sol, mur, porte, fenêtre), mIoU 0,983 annoncé, récent | **Évaluation seulement** : le modèle est MIT mais dérive d'un jeu non commercial ; risque juridique en production. Retenu pour mesurer la qualité atteignable (carnet 01) |
| **Raster2Seq** (Cornell, SIGGRAPH 2026, [github](https://github.com/Cornell-VAILab/Raster2Seq)) | oui (HF `haopt/Raster2Seq`) | MIT | Structured3D (conditions d'utilisation, formulaire), CubiCasa5K (NC), Raster2Graph | PyTorch 2.3, Deformable-DETR, GPU, 2026, actif | Sortie = polygones de pièces étiquetés (pas de portes ni fenêtres) ; poids dérivés de jeux non commerciaux. **Exclu** pour la production, intéressant comme référence de qualité |
| **DeepFloorplan** ([github](https://github.com/zlzeng/DeepFloorplan)) | oui | GPL-3.0 | R2V (LIFULL, recherche) et R3D (Rent3D, conditions non publiées) | TensorFlow 1.10, Python 2.7, 2019 | **Exclu** : abandonné, provenance des données floue |
| **TF2DeepFloorplan** ([github](https://github.com/zcemycl/TF2DeepFloorplan)) | oui (Drive, TFLite aussi) | GPL-3.0 | R3D (Rent3D, conditions non publiées ; contact des auteurs requis) | TensorFlow 2, maintenu | GPL utilisable côté serveur, mais **données d'entraînement sans licence claire** : exclu tant que Rent3D n'a pas confirmé un usage commercial |
| **FloorplanTransformation** (Raster-to-Vector, [github](https://github.com/art-programmer/FloorplanTransformation)) | oui | MIT | LIFULL HOME'S, recherche uniquement | Torch7, 2017, abandonné | **Exclu** |
| **OsamaMo/2dplan2strct** ([HF](https://huggingface.co/OsamaMo/2dplan2strct)) | oui (RF-DETR, 134 Mo) | « non-commercial-research-only » | non précisées | PyTorch | **Exclu** |
| **RasterScan Floor-Plan-Recognition** ([github](https://github.com/RasterScan/Floor-Plan-Recognition)) | non (service Docker à activer) | propriétaire | — | — | Produit commercial : c'est un fournisseur tiers de plus, pas une solution interne |
| **CubiCasa5k-Next** ([github](https://github.com/Lqm1/CubiCasa5k-Next)) | non (code d'entraînement seulement) | Apache-2.0 | — | PyTorch 2, Python 3.13, 2026 | Réimplémentation propre, utile comme code de référence, pas de poids |
| Modèles VLM ajustés (`mudasir13cs/qwen25-vl-3b-floorplan-*`, `manitocross/floorplan-vlm-training`) | oui | variables | annotations SVG CubiCasa5K (NC) | PyTorch, 3 milliards de paramètres, GPU | Même problème de données ; trop lourds pour un service interne économique |

**Conclusion de l'étape 1** : il n'existe pas de modèle à la fois déjà
entraîné, téléchargeable et commercialement propre. Tous les poids publics
descendent de CubiCasa5K (non commercial), de LIFULL / Rent3D (recherche) ou
de Structured3D (conditions d'utilisation). La seule voie propre est
**l'étape 2B : entraîner notre modèle sur un jeu de données sous licence
commerciale**, en gardant le modèle Yytsi comme **étalon d'évaluation**
(étape 2A, hors production).

## 3. Jeux de données (étape 2B)

| Jeu | Taille | Annotations | Licence | Verdict |
|---|---|---|---|---|
| **ResPlan** ([github](https://github.com/m-agour/ResPlan), [arXiv 2508.14006](https://arxiv.org/abs/2508.14006)) | 17 000 plans résidentiels (13 053 / 1 632 / 1 632), 8,1 pièces par plan | murs, portes, fenêtres, pièces en polygones (pixels et mètres), 17 classes de pièces, graphe de connexité | **CC BY 4.0** (données), MIT (code) : usage commercial permis avec attribution | **Retenu** |
| CubiCasa5K | 5 000 plans | murs, pièces, portes, fenêtres (SVG) | CC BY-NC 4.0 | exclu |
| FloorPlanCAD ([HF](https://huggingface.co/datasets/Voxel51/FloorPlanCAD)) | 15 000 dessins CAO | 30 catégories vectorielles | CC BY-NC 4.0 | exclu |
| Structured3D | 3 500 maisons synthétiques | pièces, portes, fenêtres | conditions d'utilisation, formulaire | exclu par prudence |
| R3D / Rent3D | 215 plans | murs, pièces | non publiée | exclu |

Réserve sur ResPlan : ses géométries viennent d'annonces immobilières en
ligne, converties en vecteurs. Nos images d'entraînement seront donc des
**dessins rastérisés** par nous, pas des scans : le carnet 02 ajoute du texte
parasite, des cotes, une rotation légère, du flou et une compression JPEG pour
réduire l'écart avec les vrais plans des promoteurs. Cet écart de domaine est
le principal risque du projet.

## 4. Choix retenu et architecture cible

- Modèle : U-Net avec encodeur ResNet-34 (`segmentation_models_pytorch`,
  MIT ; poids ImageNet de l'encodeur, usage commercial permis), 4 classes :
  fond, mur, porte, fenêtre, images 512 × 512.
- Sortie : masque → pièces par composantes connexes → JSON au format déjà
  utilisé par Gemini (`pieces`, `portes`) → extrusion `.glb` existante.
- Production sans Python : export **ONNX** et inférence avec
  `onnxruntime-node` (MIT) dans un petit service ou dans le serveur Next
  (CPU, quelques secondes par plan). La « Solution PromoPro » devient alors un
  troisième adaptateur derrière `FournisseurPlan3d` (voir ARCHITECTURE.md,
  « Génération de modèles 3D »), sans clé d'API.
- Noms de pièces : OCR séparé (`tesseract.js`) rattaché à la pièce qui
  contient le texte ; hors périmètre de la phase 1.

## 5. Carnets Google Colab (`scripts/prototypes/colab/`)

Les deux carnets ont été écrits **sans pouvoir être exécutés** : la machine de
développement n'a pas Python. Ils sont donc à lancer par vous dans Colab, et
la première exécution demandera probablement une ou deux corrections
(format exact du pickle ResPlan, préfixe des clés du modèle Yytsi). Chaque
carnet contient une cellule d'inspection prévue pour cela.

### 01-evaluation-modele-existant.ipynb (étape 2A, évaluation seulement)
1. Colab, sans GPU nécessaire. Exécuter les cellules 1 à 3 (dépendances,
   poids Yytsi, construction du modèle).
2. Cellule 4 : déposer `villa_plan_2d.png`. Cellule 5 : masque et image
   superposée. Cellule 6 : JSON `pieces` / `portes` au format Gemini,
   téléchargé.
3. Cellule 7 : déposer `villa_plan_2d.gemini.json` pour la comparaison
   pièce par pièce (IoU des rectangles ; ≥ 0,7 = pièce retrouvée).

### 02-entrainement-resplan.ipynb (étape 2B)
1. Colab avec GPU T4. Cellule 2 : Drive monté (points de reprise), clone de
   ResPlan. Cellule 3 : inspection du format. Cellule 4 : adapter les clés si
   nécessaire, rastériser (mettre `NB_IMAGES = 2000` pour un premier essai).
2. Cellule 5 : entraînement avec reprise automatique ; relancer toutes les
   cellules après chaque coupure de session, l'entraînement repart de la
   dernière époque enregistrée sur Drive.
3. Cellule 6 : export ONNX sur Drive et test sur le plan de villa.

### Limites réelles du niveau gratuit de Colab
- Session coupée après environ 90 minutes d'inactivité et après quelques
  heures de GPU par jour (quota variable) ; GPU parfois indisponible.
- 13 000 images en 512 px sur T4 : 25 à 40 minutes par époque ; 15 époques
  représentent 8 à 10 heures de GPU, soit **3 à 6 sessions étalées sur
  plusieurs jours**. Un essai réduit (2 000 images) tient dans une session.

## 6. Cycles prévisibles avant une qualité comparable à Gemini

Rappel de la référence : Gemini 3.8 Flash a retrouvé 22 pièces sur 22 et
14 portes sur 15 sur trois plans propres, avec les noms.

| Cycle | Contenu | Résultat attendu |
|---|---|---|
| 0 | carnet 01 : étalon Yytsi sur la villa | mesure de ce qu'un modèle CubiCasa fait sur nos plans |
| 1 | carnet 02, 2 000 images, 5 époques | murs corrects sur dessins propres, portes médiocres, fenêtres faibles |
| 2 | 13 000 images, 15 époques, augmentations | murs et pièces fiables sur dessins propres ; portes acceptables |
| 3 | ajustement sur 30 à 50 **vrais plans PromoPro** annotés à la main (outil d'annotation à prévoir) | comblement de l'écart de domaine : cotes, mobilier, hachures, scans |
| 4 | OCR des noms, intégration ONNX, validation sur de vrais biens | comparable à Gemini pour murs et pièces ; noms via OCR ; portes probablement en retrait |

Estimation honnête : **trois cycles minimum** (0, 1, 2) avant de savoir si la
voie est viable, et le cycle 3 est indispensable pour les plans réels. Sans
vrais plans annotés, un modèle entraîné sur ResPlan restera en retrait de
Gemini sur les scans et les photos.

## 7. Ce qui est fait dans le dépôt

- Carte « Solution PromoPro » dans `/admin/plan3d`
  (`FOURNISSEURS_EN_DEVELOPPEMENT` dans `src/lib/plan3d/provider.ts`,
  `CarteEnDeveloppement.tsx`), hors du type `Fournisseur` : impossible de
  l'activer ou de la tester tant qu'elle n'a pas d'adaptateur.
- Carnets Colab ci-dessus ; prototypes Gemini et extrusion dans
  `scripts/prototypes/` ; les plans d'essai et leurs sorties
  (`scripts/prototypes/plans/`) ne sont pas versionnés.

## 8. Prochaine décision

Lancer le carnet 01 puis le carnet 02 (essai réduit) dans Colab et rapporter
les masques obtenus sur `villa_plan_2d.png`. Selon le résultat : poursuivre
vers le cycle 2, ou renoncer et garder Gemini / un fournisseur tiers.
