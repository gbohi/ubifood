"""
Comptes sans le rôle « Employé » qui ont un historique de repas (commandes ou
solde de compte repas) : ils ne peuvent plus commander. Ajoutez-leur le rôle
dans Paramètres → Utilisateurs si nécessaire.
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Max


class Command(BaseCommand):
    help = "Liste les comptes sans rôle Employé ayant commandé ou ayant un solde de compte repas."

    def handle(self, *args, **options):
        from api.models import CompteRepas, User
        qs = (User.objects.exclude(groups__name='employe').exclude(groups__name__in=('prestataire', 'agent_comptoir'))
              .annotate(nb=Count('commandes'), derniere=Max('commandes__date_commande')))
        lignes = []
        for u in qs:
            solde = CompteRepas.objects.filter(user=u).values_list('solde', flat=True).first() or 0
            if u.nb or solde:
                lignes.append((u.username, f"{u.nom} {u.prenom}", u.nb, u.derniere, solde))
        if not lignes:
            self.stdout.write("Aucun compte concerné.")
            return
        self.stdout.write(f"{len(lignes)} compte(s) sans rôle Employé avec un historique de repas :")
        for mat, nom, nb, der, solde in lignes:
            self.stdout.write(f"  {mat:<12} {nom:<30} {nb:>4} commande(s), dernière : "
                              f"{der:%d/%m/%Y}" if der else f"  {mat:<12} {nom:<30} aucune commande", ending='')
            self.stdout.write(f" · solde {solde} F")
