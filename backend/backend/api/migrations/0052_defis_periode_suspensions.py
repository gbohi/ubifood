"""
Défis : période date / heure de début et de fin (au lieu d'un mois) ;
suspension des jeux.
"""
import calendar
from datetime import datetime, time

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


def mois_vers_periode(apps, schema_editor):
    CampagneDefis = apps.get_model('api', 'CampagneDefis')
    tz = timezone.get_current_timezone()
    for c in CampagneDefis.objects.all():
        dernier = calendar.monthrange(c.annee, c.mois)[1]
        c.debut = timezone.make_aware(datetime(c.annee, c.mois, 1, 0, 0), tz)
        c.fin = timezone.make_aware(datetime.combine(datetime(c.annee, c.mois, dernier).date(), time(23, 59)), tz)
        c.save(update_fields=['debut', 'fin'])


class Migration(migrations.Migration):
    dependencies = [('api', '0051_role_employe_commandes_recentes'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.AddField('campagnedefis', 'debut', models.DateTimeField(null=True)),
        migrations.AddField('campagnedefis', 'fin', models.DateTimeField(null=True)),
        migrations.RunPython(mois_vers_periode, migrations.RunPython.noop),
        migrations.RemoveField('campagnedefis', 'annee'),
        migrations.RemoveField('campagnedefis', 'mois'),
        migrations.AlterField('campagnedefis', 'debut', models.DateTimeField()),
        migrations.AlterField('campagnedefis', 'fin', models.DateTimeField()),
        migrations.AlterModelOptions('campagnedefis', {'ordering': ['-debut', '-id']}),
        migrations.CreateModel(
            name='SuspensionJeu',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(choices=[('quiz', 'Quiz'), ('defis', 'Défis'), ('pronostics', 'Pronostics'), ('ticket', 'Tickets à gratter')], max_length=12)),
                ('source_id', models.PositiveIntegerField()),
                ('debut', models.DateTimeField(default=timezone.now)),
                ('fin', models.DateTimeField(blank=True, null=True)),
                ('motif', models.CharField(blank=True, max_length=255)),
                ('repris_par', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('suspendu_par', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'jeu_suspension', 'ordering': ['-debut'],
                     'indexes': [models.Index(fields=['source', 'source_id'], name='jeu_suspens_source_d2c458_idx')]},
        ),
    ]
