# Essayer FocusReplay

## Premier essai avec votre vraie journée

1. Ouvrez `FocusReplay-0.2.0-Windows.exe`. Aucune installation ni connexion n’est nécessaire. Cette première version n’est pas signée : Windows peut afficher un avertissement sur l’éditeur.
2. Cliquez sur **Commencer une session**. L’application capture réellement l’écran sélectionné et relève le logiciel au premier plan. Aucun objectif ou commentaire à remplir.
3. Pour un premier essai rapide, choisissez **10 secondes** entre les captures dans **Réglages**. Vous pourrez ensuite revenir à **1 minute**, le réglage par défaut.
4. Passez quelques instants dans deux logiciels, puis revenez dans FocusReplay. Glissez le curseur de la timeline : l’image change immédiatement. La piste des logiciels et le récapitulatif montrent les durées observées.
5. Cliquez sur **Pause**, puis choisissez **2, 5, 10, 15 minutes**, une durée personnalisée ou une pause indéfinie. Écran, caméra et suivi des logiciels sont suspendus. À la fin du minuteur, un son et une notification vous préviennent. Cliquez sur **Reprendre** lorsque vous êtes prêt.
6. Cliquez sur **Terminer** pour clore définitivement cette session. Vous pourrez toujours la revoir et démarrer une nouvelle session ensuite.

Fermer la fenêtre laisse l’application dans la zone de notification de Windows et conserve la session en cours. Pour quitter complètement : icône FocusReplay → **Quitter**.

## Caméra et musique

La caméra est **désactivée par défaut**. Dans les réglages, cochez l’option puis confirmez l’autorisation. Windows doit aussi autoriser la caméra pour les applications de bureau. La caméra par défaut est utilisée, sans microphone. Sa lumière peut rester allumée pendant la session ; seules les photos périodiques sont enregistrées.

La photo apparaît en petit dans le replay et peut être incluse dans le MP4. Une caméra indisponible n’empêche pas les captures d’écran. La détection de présence par caméra n’est pas incluse : le temps d’inactivité correspond au clavier et à la souris.

Choisissez votre propre MP3 pour la musique de démarrage. Réglez son volume et sa durée, puis utilisez le bouton d’écoute pour l’essayer. Spotify n’est pas intégré à cette version.

## Exporter et conserver

**Exporter en MP4** exporte directement la journée ou la session affichée, à la vitesse du curseur de lecture. Choisissez simplement le fichier de destination. Le MP4 contient une heure lisible, les logiciels et leurs durées, les catégories et une timeline animée. La caméra est incluse lorsqu’une photo est disponible. L’Explorateur sélectionne automatiquement la vidéo terminée.

Les captures sont conservées **3 jours**, avec un plafond de **1 Go** par défaut. Les plus anciennes sont supprimées lorsque ces limites sont atteintes. Ces deux limites sont modifiables. Les vidéos exportées restent dans le dossier que vous avez choisi, indépendamment du nettoyage.

Les vraies données restent sur ce PC, hors du code source. Retrouvez leur emplacement dans **Réglages → Ouvrir le dossier local**. Ne mettez pas ce dossier sur GitHub. Aucun compte, cloud ou service d’analyse n’est utilisé.

## Points et récompenses, si vous en avez envie

Ouvrez **Pauses & récompenses** et activez les points. Choisissez le nombre de points gagnés par heure observée et les activités qui comptent. Modifiez les exemples ou ajoutez une récompense, comme 30 minutes de jeu ou une promenade. Les pauses ordinaires restent toujours disponibles gratuitement.

Les durées et catégories sont des estimations : un logiciel ou une période sans frappe ne suffit pas à savoir si vous travaillez vraiment.

## Modifier rapidement l’application

Dans le dossier du projet, lancez `npm run dev`. Les changements de l’interface et des couleurs apparaissent immédiatement. Les changements du moteur sauvegardent et terminent la session en cours avant de relancer l’application. Les données de développement sont séparées de celles de votre usage normal.

La structure des modules et la procédure de vérification sont expliquées dans `CONTRIBUTING.md`. Pour une nouvelle version autonome, utilisez `npm run dist`. Fermez complètement l’ancienne version avant de remplacer l’exécutable ; les données locales restent conservées.

**Raccourcis :** Espace lance ou arrête la lecture ; les flèches passent d’une capture à l’autre ; la molette sur la timeline zoome ou dézoome. Les curseurs horizontaux règlent la vitesse et le zoom. Les passages courts dans un logiciel restent lisibles grâce aux étiquettes décalées.

**Classement :** les outils de code, bureautique et création reconnus comptent comme travail probable ; certains loisirs comme distraction probable. Les usages ambigus restent indéterminés. Dans Réglages → Classement des logiciels, une règle facultative par logiciel corrige aussi l’historique, sans annotations de session ni recalcul des points déjà gagnés.
