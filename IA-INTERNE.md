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

## 9. Entraînement complet et intégration en bac à sable (1er octobre 2026)

Le carnet final (`scripts/prototypes/colab/final/`) a été exécuté sur Colab
par le promoteur ; le modèle `promopro-plan3d.onnx` (97 Mo) a été remis et
installé hors git dans `storage/modeles/`.

Mesure sur `villa_plan_2d.png` (plan propre, référence Gemini à 9 pièces et
2 portes), par `scripts/prototypes/evaluer-promopro.ts` qui utilise les
modules du site :

| | Modèle pré-entraîné CubiCasa (carnet 01) | Essai réduit (2 000 images) | Modèle complet (ce fichier) |
|---|---|---|---|
| Pièces retrouvées, IoU ≥ 0,7 | 2 / 9 | 5 / 9 brut, 8 / 9 avec fermeture | 0 / 9 brut, **8 / 9** avec fermeture selon chaque axe |
| Portes | 0 / 2, trois faux positifs sur le texte | 0 / 2 | 0 / 2 (69 pixels de classe porte) |
| Texte pris pour des symboles | oui | non | non |
| Inférence | — | — | 0,8 s sur CPU |

La pièce manquée est le couloir, dont l'extrémité droite n'est pas fermée dans
le masque. La classe « porte » n'est toujours pas apprise : les pièces ne
sont séparées que grâce au post-traitement (fermeture des ouvertures), qui
suppose des murs orthogonaux. Les noms de pièces restent hors de portée du
modèle (OCR à prévoir).

Intégration : « Solution PromoPro » est un **vrai fournisseur** derrière
`FournisseurPlan3d` (`src/lib/plan3d/promopro.ts`), sans clé, exécuté sur le
serveur en une seconde, mais `activable: false` : le Super Admin peut le
comparer aux autres dans le bac à sable, le serveur refuse de l'activer pour
les biens. Installation du modèle : DEPLOY.md, section 12.

Rendu du `.glb` (retour du promoteur sur le bac à sable, 1er octobre 2026) :
la première version construisait quatre murs par pièce, dans un gris presque
blanc identique au sol — les cloisons apparaissaient doublées et le modèle
semblait un bloc blanc. Désormais les bords des pièces sont alignés sur des
lignes de murs communes (le jour laissé par la segmentation entre deux pièces
voisines est refermé), chaque mur n'est construit qu'une fois, et une palette commune
(`src/lib/plan3d/palette.ts`) donne un sol en bois clair en deux teintes
alternées, des murs crème et un dessus de mur brun moyen : le plan reste
lisible vu de dessus comme de trois quarts. La même palette est appliquée aux
maillages de Neural4D au téléchargement (ils arrivent sans couleur). Cela ne change rien à la
reconnaissance elle-même : le couloir manqué et les portes absentes viennent du
modèle, pas de l'extrusion.

**Validation sur de vrais plans toujours attendue.** Tant qu'elle n'a pas eu
lieu, le verdict ne change pas : Gemini reste la référence (noms de pièces
compris), la Solution PromoPro est un candidat prometteur sur plans propres et
non prouvé sur scans ou plans cotés avec mobilier. Prochaine étape : déposer
dans le bac à sable 5 à 10 vrais plans de projets et comparer avec MeltFlex ou
Neural4D sur les mêmes plans ; puis, si l'écart est acceptable, annoter 30 à
50 plans réels pour un cycle d'ajustement (cycle 3 du plan) avant toute
activation.

## 10. Premier vrai plan dans le bac à sable (2 octobre 2026)

Le promoteur a déposé un plan d'appartement réel (1240 × 800, murs épais en
noir, fenêtres en double trait fin, arcs de porte, noms des pièces en
capitales, treize pièces : séjour, deux terrasses, trois chambres dont un
bureau, hall de nuit, hall d'entrée, hall commun, cuisine, WC, salle de bains,
buanderie). Résultat de la version précédente : neuf fragments sans rapport
avec le plan, la moitié gauche absente.

Diagnostic sur le masque du modèle : les murs épais sont reconnus, mais **ni
les fenêtres en double trait, ni les murs fins** (classés fond) ; les pièces
se déversent donc les unes dans les autres et dans l'extérieur, et la
fermeture morphologique de 8 % du grand côté, conçue pour reboucher les
portes, remplissait aussi tout espace plus étroit que 100 px (terrasses, WC,
halls) tout en reliant le texte aux murs.

Deux corrections de post-traitement, sans réentraînement :

1. **Encre de l'image** (`ajouterEncre`) : sur un plan au trait à fond
   clair, les pixels sombres hors des murs déjà reconnus deviennent des
   barrières, après filtrage des composantes trop petites (texte, cotes) et
   non droites (arcs de porte, cuvette, lavabo). Garde-fous : fond clair exigé
   (médiane presque blanche), rien n'est ajouté si l'encre gardée dépasse un
   quart de l'image (photo, scan sombre).
2. **Rebouchage des portes** (`reboucherSelonAxe`) : une coupure n'est
   rebouchée, jusqu'à 8 % du grand côté, que si un tronçon de mur d'au moins
   la moitié de cette largeur la borde dans la direction de l'axe (une porte
   interrompt un mur) ; les petites cassures (un quart) le sont toujours. Un
   espace entre deux murs parallèles n'est plus rempli.

| Plan | Avant | Après |
|---|---|---|
| Appartement réel (13 pièces) | 9 fragments, moitié gauche absente | 15 pièces : les 13 retrouvées, le hall de nuit coupé en deux par la porte du WC, la baignoire comptée comme une pièce |
| villa_plan_2d.png (référence Gemini, 9 pièces) | 8 / 9 (couloir IoU 0,15) | 8 / 9 (couloir IoU 0,54) |
| Temps | 0,8 s | 0,9 à 1,4 s |

Limites qui restent : les portes ne sont toujours pas reconnues (0 porte sur
les deux plans, les murs du modèle 3D sont pleins), un équipement rectangulaire
(baignoire) peut devenir une pièce, les noms de pièces ne sont pas lus. Le
verdict ne change pas : Gemini reste la référence ; la Solution PromoPro est
désormais utilisable pour juger la structure d'un plan au trait propre dans le
bac à sable, et le cycle d'ajustement sur 30 à 50 plans réels annotés reste
nécessaire avant toute activation.

## 11. Second modèle reçu (best.safetensors, 2 octobre 2026) : mesuré, non retenu

Le promoteur a remis un second entraînement, `best.safetensors` (poids
PyTorch, même architecture U-Net ResNet-34 à 4 classes, 278 tenseurs,
24,5 M de paramètres, métadonnées `best_miou 0,983` à l'époque 26 — mesure
sur son propre jeu de validation, pas sur de vrais plans). Le site n'exécute
que de l'ONNX et la machine de développement n'a pas Python : le fichier a
été converti **sans Python** par `scripts/prototypes/safetensors-vers-onnx.mjs`
(lecture de l'en-tête safetensors, fusion de chaque BatchNorm dans la
convolution qui la précède, écriture des 94 initialisateurs dans une copie du
graphe de `promopro-plan3d.onnx`, formes vérifiées une à une ; le décodeur
protobuf minimal est dans `onnx-proto.mjs`). Usage :

```bash
node scripts/prototypes/safetensors-vers-onnx.mjs best.safetensors storage/modeles/promopro-plan3d.onnx storage/modeles/promopro-avance.onnx
```

Mesure avec la chaîne exacte du site (inférence, encre, rebouchage,
extraction), `PLAN3D_MODELE_CHEMIN` pointant sur l'un ou l'autre fichier :

| | Modèle en place (promopro-plan3d.onnx) | best.safetensors converti |
|---|---|---|
| villa_plan_2d.png, pièces retrouvées (IoU ≥ 0,7) sur 9 | **8** (couloir 0,54) | 6 (cuisine et terrasse fusionnées, couloir 0,56) |
| villa, portes (référence 2) | 0 | 0 |
| Appartement réel, 13 pièces | **15** (13 + hall de nuit coupé + baignoire) | 16 (idem + hall d'entrée coupé) |
| Appartement, « portes » rendues | 0 | 26 (fenêtres classées portes, restes de texte) |
| Inférence | 0,8 à 1,2 s | 0,9 à 1,2 s |

Observations sur les masques : les murs épais du second modèle sont plus
nets et plus continus (le progrès vu par le promoteur est réel), mais le mur
fin entre cuisine et terrasse de la villa est rendu en pointillé, d'où la
fusion ; les noms de pièces sont classés porte ou fenêtre (comme le modèle
pré-entraîné du carnet 01) ; les fenêtres sont classées porte ; les arcs de
porte ne sont pas reconnus. Deux garde-fous ont été ajoutés au
post-traitement pour tout modèle à venir : les classes porte / fenêtre posées
sur du texte sont effacées (`ajouterEncre`), et une ouverture n'est gardée
que si du mur la borde aux deux bouts (`ouverturesDansLesMurs`). Même avec
eux, le second modèle reste en dessous ou à égalité sur la structure des
pièces et introduit de fausses portes : **il ne remplace pas le modèle en
place**. À la demande du promoteur, il est proposé dans le bac à sable de
/admin/plan3d sous le nom neutre « PromoPro — variante B (epoch 26) »
(fournisseur `PROMOPRO_B`, fichier `storage/modeles/promopro-variante-b.onnx`
ou `PLAN3D_MODELE_B_CHEMIN` / `PLAN3D_MODELE_B_URL`, hors git), côte à côte
avec la Solution PromoPro pour les comparaisons à venir, sa carte rappelant le
résultat mesuré. Comme la Solution PromoPro, il n'est pas activable pour les
biens (`activable: false`, refus côté serveur) et ne le deviendra pas tant
qu'il n'a pas dépassé le modèle en place sur ces deux plans et sur 5 à 10
autres vrais plans, avec confirmation explicite du promoteur.

