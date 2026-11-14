"""
Tâches périodiques d'UbiFood (lancées toutes les heures par le service « taches »
de docker-compose) : rappels de réservation aux employés programmés, suivi des repas, notifications des jeux.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Tâches périodiques : rappels de réservation du planning des équipes."

    def handle(self, *args, **options):
        from api.planning_equipes import envoyer_rappels
        from api.jeux import taches_jeux
        from api.suivi_repas import taches_suivi
        n = envoyer_rappels()
        self.stdout.write(f"Rappels de réservation envoyés : {n}")
        self.stdout.write(f"Suivi des repas : {taches_suivi()}")
        self.stdout.write(f"Jeux : {taches_jeux()}")
