# Certification HAS 2028 — V4.9

Évaluateurs à deux niveaux :
- évaluateurs généraux de la méthode/action ;
- personnalisation optionnelle par déclinaison de service ;
- héritage automatique pour les services non personnalisés ;
- vue utilisateurs et PDF avec évaluateurs effectifs ;
- migration D1 non destructive, schéma 2.8.

## Reports et suivi par service — schéma D1 2.9

- Pour une évaluation simple, choisissez le nouveau mois dans « Modifier ». Vous pouvez préciser la date immédiatement ou ultérieurement. Les programmations précédentes restent visibles dans leur mois.
- Pour une évaluation déclinée par service, définissez le mois et la date de chaque intervention dans le suivi mensuel de l’évaluation. Depuis un mois de destination, « Modifier le suivi » ouvre ce formulaire. La progression suit le nombre de services réalisés.
- Le compteur « Avec report » comptabilise les évaluations qui ont un historique de reprogrammation. Le statut courant se calcule d’après les échéances actives. Une intervention du mois sans jour précis devient en retard le mois suivant.

### Migration Cloudflare

Après validation, sauvegarder la base D1, puis appliquer une seule fois `migration_reports.sql` sur le schéma 2.8 avant d’activer le nouveau code Pages. La migration ajoute le mois de programmation des services et l’historique sans supprimer de lignes. Elle récupère le mois des dates existantes. Une ligne sans date reprend le mois de son évaluation. Les sauvegardes JSON antérieures restent importables. Les nouvelles sauvegardes incluent l’historique.

Pour une nouvelle base, utiliser `schema.sql`. Le projet Pages conserve sa liaison D1 `DB` et son secret `ADMIN_KEY`.

### Tests

- API, migration et calcul des vues via SQLite, avec Node.js 24 ou ultérieur : `node --test tests/planning.test.mjs`
- Parcours d’administration et de consultation avec Playwright et Chromium installés : `node tests/browser.mjs`
