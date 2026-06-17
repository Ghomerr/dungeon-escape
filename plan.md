# Plan de l'application
L'application doit être un site Web (pureJS + JQuery ou autre pour simplifier), et dialogue avec un serveur (en nodeJS ?).

Exemple de projet similaire : ../skull-king (fait en pureJS + JQuery et back en nodeJS, dialoguent en SockJS).

# Page d'accueil et connexion
Une page d'accueil quand un joueur arrive sur le site, qui se découpe en : 
- en-tête
- corps
- pied de page

## En-tête 
Il faudrait avoir le nom du jeu "Dungeon Escape" et un logo (à venir, utiliser une placeholder)

## Corps 
Dans cette partie, on doit pouvoir : 
* visualiser les parties en cours : nom + nombre de joueurs vs nombre max (6) + statut de la partie (attente joueurs, en cours, en pause (si un joueur se déconnecte temporairement))
* pouvoir rejoindre une partie en cours via un bouton
* pour rejoindre ou créer une nouvelle partie il faut entrer : son pseudonyme (ne doit pas déjà exister), le un mot de passe (optionel si en création de partie, requis si on rejoint une partie privée), et le nom de la salle (uniquement en création)
* le formulaire doit générer un UUID caché et transmis lors de la connexion à une partie, afin d'identifier de manière fiable le joueur qui se connecte parmi les autres joueurs

## Pied de page 
On doit pouvoir retrouver la version de l'appli + les règles du jeu (lien vers le rules.md) + un lien vers mon profil twitter @Ghomerr

# Page d'attente des joueurs
Quand les joueurs sont dans la salle d'attente, avant de commencer la partie, on doit voir : 
* qui est le propriétaire de la salle (via un picto, couronne par exemple)
* l'ordre des joueurs et la possibilité de les changer d'ordre (uniquement pour le propriétaire)
* le choix du personnage parmi les 8 proposés, avec une description rapide, une image de profil et un rappel des capacités (on ne peut pas choisir deux fois le même personnage)
* un même joueur peut choisir plus d'un personnage à contrôler si on est moins de 3 joueurs
* une bouton pour expulser le joueur (pour le prioriétaire seulement)
* un bouton pour envoyer des emojis
* un bouton pour lancer la partie quand il y a assez de joueurs et/ou personnages

# Page partie en cours
Quand la partie est lancée, on doit voir : 
* à qui c'est de jouer (personnage et joueur, car un joueur peut gérer plusieurs personnages) et combien de points d'action il lui reste
* un rappel des joueurs connectés, leur personnage (juste le nom) et les points de vie restants (et un marqueur "inconscient" ou "mort")
* une zone centrale "carte du donjon" dans laquelle on verra les tuiles placées par les joueurs
* une barre d'actions qui liste les actions possibles (en 2 catégories, cf. les règles) avec seulement le nom de l'action, le coût en PA et en infobulle, la description de l'action.
* dans une section à part : les capacités actives du personnage courant, le coût en PA et en info-bulle la description de l'action
* En cas d'événements fâcheurs, on doit voir l'événement courant actif (ex: poison, qui est actif un tour)
* On aura un marqueur pour indiquer la présence de Dragons (au moins 1) dans le Donjon
* Si le personnage est inconscient, un bouton pour passer son tour
* dans une barre d'actions, on pourra aussi envoyer un emoji autres joueurs (comme dans la salle d'attente) en identifiant bien quel joueur l'a déclenché
* Un rappel du nombre de tour restants (ça correspond au nombre d'événements fâcheux restants à résoudre)
* En mode mort subite (plus aucun événéments fâcheux restants) : c'est indiqué à la place des événements fâcheux.

# Fin de partie
Rappeler l'état de la partie : combien de joueurs survivants VS morts, et en cas de victoire, en combien de tours.
Mettre le grade (bronze, argent ou or, cf. les règles) en fonction des survivants restants.
Afficher un bouton pour quitter la partie et revenir à la page d'accueil.
