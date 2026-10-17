"""
Facture prestataire officielle au format PDF (reportlab).

Générée à partir de la facture FIGÉE (FacturePrestataire / LigneFacturePrestataire) :
le document est identique à chaque téléchargement, sauf l'en-tête société
(ParametresSociete), modifiable à tout moment par un administrateur.
"""

from collections import OrderedDict
from decimal import Decimal
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre']

BLEU = colors.HexColor('#092440')
GRIS = colors.HexColor('#F2F4F7')


# ══════════════════════════════════════════════════════════════
# Montants
# ══════════════════════════════════════════════════════════════

def fcfa(montant):
    """1234567.00 → '1 234 567'"""
    return f"{int(Decimal(montant).quantize(Decimal('1'))):,}".replace(',', ' ')


_UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
           'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
_DIZAINES = {20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante'}


def _moins_de_cent(n):
    if n <= 16:
        return _UNITES[n]
    if n < 20:
        return 'dix-' + _UNITES[n - 10]
    if n < 70:
        d, u = divmod(n, 10)
        base = _DIZAINES[d * 10]
        if u == 0:
            return base
        return f"{base}-et-un" if u == 1 else f"{base}-{_UNITES[u]}"
    if n < 80:                                   # 70-79 : soixante-dix…
        return 'soixante-et-onze' if n == 71 else 'soixante-' + _moins_de_cent(n - 60)
    if n == 80:
        return 'quatre-vingts'
    return 'quatre-vingt-' + _moins_de_cent(n - 80)   # 81-99


def _moins_de_mille(n):
    c, reste = divmod(n, 100)
    if c == 0:
        return _moins_de_cent(reste)
    centaines = 'cent' if c == 1 else f"{_UNITES[c]}-cent{'s' if reste == 0 else ''}"
    return centaines if reste == 0 else f"{centaines}-{_moins_de_cent(reste)}"


def montant_en_lettres(montant):
    """Entier en toutes lettres (orthographe rectifiée de 1990 : traits d'union partout)."""
    n = int(Decimal(montant).quantize(Decimal('1')))
    if n == 0:
        return 'zéro'
    morceaux = []
    for valeur, sing, plur in ((10 ** 9, 'milliard', 'milliards'),
                               (10 ** 6, 'million', 'millions'),
                               (1000, 'mille', 'mille')):
        q, n = divmod(n, valeur)
        if q:
            if valeur == 1000:
                # « cent » et « vingt » perdent leur s devant « mille » (invariable)
                texte = _moins_de_mille(q)
                if texte.endswith(('cents', 'vingts')):
                    texte = texte[:-1]
                morceaux.append('mille' if q == 1 else f"{texte}-mille")
            else:
                morceaux.append(f"{_moins_de_mille(q)}-{sing if q == 1 else plur}")
    if n:
        morceaux.append(_moins_de_mille(n))
    return '-'.join(morceaux)


# ══════════════════════════════════════════════════════════════
# Pied de page numéroté (« Page x / y »)
# ══════════════════════════════════════════════════════════════

def _canvas_numerote(texte_pied):
    class CanvasNumerote(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for etat in self._pages:
                self.__dict__.update(etat)
                self._pied(total)
                super().showPage()
            super().save()

        def _pied(self, total):
            largeur, _ = A4
            self.setStrokeColor(colors.HexColor('#D0D5DD'))
            self.line(15 * mm, 18 * mm, largeur - 15 * mm, 18 * mm)
            self.setFont('Helvetica', 7)
            self.setFillColor(colors.HexColor('#667085'))
            y = 14 * mm
            for ligne in texte_pied[:3]:
                self.drawString(15 * mm, y, ligne[:150])
                y -= 3.2 * mm
            self.drawRightString(largeur - 15 * mm, 14 * mm,
                                 f"Page {self._pageNumber} / {total}")
    return CanvasNumerote


# ══════════════════════════════════════════════════════════════
# Document
# ══════════════════════════════════════════════════════════════

def generer_facture_prestataire(facture, societe):
    """Renvoie le PDF (bytes) de la FacturePrestataire figée."""
    styles = getSampleStyleSheet()
    normal = ParagraphStyle('n', parent=styles['Normal'], fontSize=9, leading=12)
    petit = ParagraphStyle('p', parent=normal, fontSize=8, leading=10,
                           textColor=colors.HexColor('#475467'))
    titre = ParagraphStyle('t', parent=normal, fontName='Helvetica-Bold', fontSize=16,
                           leading=20, textColor=BLEU, alignment=TA_RIGHT)
    droite = ParagraphStyle('d', parent=normal, alignment=TA_RIGHT)
    gras = ParagraphStyle('g', parent=normal, fontName='Helvetica-Bold')

    def p(texte, style=normal):
        return Paragraph(escape(texte or '').replace('\n', '<br/>'), style)

    periode = f"{MOIS[facture.mois - 1]} {facture.annee}"
    cloturee_le = timezone.localtime(facture.cloture.cloturee_le)
    elements = []

    # ── En-tête : société (gauche) / titre de la facture (droite) ──
    bloc_societe = []
    if societe.logo:
        try:
            logo = Image(societe.logo.path)
            ratio = min(40 * mm / logo.imageWidth, 22 * mm / logo.imageHeight)
            logo.drawWidth, logo.drawHeight = logo.imageWidth * ratio, logo.imageHeight * ratio
            logo.hAlign = 'LEFT'
            bloc_societe += [logo, Spacer(1, 2 * mm)]
        except Exception:
            pass   # logo illisible ou absent du disque : facture sans logo
    if societe.nom:
        bloc_societe.append(p(societe.nom, gras))
    for valeur in (societe.adresse, societe.ville, societe.telephone and f"Tél. : {societe.telephone}",
                   societe.email, societe.site_web):
        if valeur:
            bloc_societe.append(p(valeur, petit))

    bloc_titre = [
        Paragraph('FACTURE PRESTATAIRE', titre),
        Spacer(1, 2 * mm),
        p(f"N° {facture.numero or facture.id}", ParagraphStyle('nr', parent=droite, fontName='Helvetica-Bold')),
        p(f"Période : {periode}", droite),
        p(f"Clôturée le {cloturee_le:%d/%m/%Y à %H:%M}", droite),
    ]
    entete = Table([[bloc_societe, bloc_titre]], colWidths=[95 * mm, 85 * mm])
    entete.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                                ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    elements += [entete, Spacer(1, 8 * mm)]

    # ── Prestataire ────────────────────────────────────────────
    cadre = Table([[p('PRESTATAIRE', petit)], [p(facture.prestataire_libelle, gras)]],
                  colWidths=[180 * mm])
    cadre.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), GRIS),
                               ('LEFTPADDING', (0, 0), (-1, -1), 4 * mm),
                               ('TOPPADDING', (0, 0), (-1, -1), 1.5 * mm),
                               ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5 * mm)]))
    elements += [cadre, Spacer(1, 4 * mm),
                 p(f"Repas servis au personnel en {periode} — {facture.nb_repas} repas. "
                   "Montants figés à la clôture du mois."),
                 Spacer(1, 4 * mm)]

    # ── Détail : par agence puis par jour (et prix unitaire) ───
    groupes = OrderedDict()
    for l in facture.lignes.all().order_by('agence_nom', 'date_menu'):
        cle = (l.date_menu, l.montant)
        jour = groupes.setdefault(l.agence_nom or '—', OrderedDict()).setdefault(cle, 0)
        groupes[l.agence_nom or '—'][cle] = jour + 1

    # ── Récapitulatif par agence ───────────────────────────────
    recap = [['Agence', 'Nb repas', 'Montant (FCFA)']]
    for agence, jours in groupes.items():
        recap.append([agence, str(sum(jours.values())),
                      fcfa(sum((prix * nb for (_, prix), nb in jours.items()), Decimal('0')))])
    recap.append(['TOTAL', str(facture.nb_repas), fcfa(facture.montant_total)])
    tableau_recap = Table(recap, colWidths=[110 * mm, 30 * mm, 40 * mm])
    tableau_recap.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BLEU), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), GRIS), ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#D0D5DD')),
        ('TOPPADDING', (0, 0), (-1, -1), 1.6 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.6 * mm),
    ]))
    elements += [p('Récapitulatif par agence', gras), Spacer(1, 2 * mm), tableau_recap,
                 Spacer(1, 6 * mm), p('Détail par jour', gras), Spacer(1, 2 * mm)]

    lignes_tableau = [['Date', 'Agence', 'Nb repas', 'Prix unitaire (FCFA)', 'Montant (FCFA)']]
    styles_tableau = [
        ('BACKGROUND', (0, 0), (-1, 0), BLEU),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#D0D5DD')),
        ('TOPPADDING', (0, 0), (-1, -1), 1.6 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.6 * mm),
    ]
    for agence, jours in groupes.items():
        nb_agence, total_agence = 0, Decimal('0')
        for (date_menu, prix), nb in jours.items():
            lignes_tableau.append([f"{date_menu:%d/%m/%Y}", agence, str(nb), fcfa(prix), fcfa(prix * nb)])
            nb_agence += nb
            total_agence += prix * nb
        lignes_tableau.append(['', f"Sous-total {agence}", str(nb_agence), '', fcfa(total_agence)])
        i = len(lignes_tableau) - 1
        styles_tableau += [('BACKGROUND', (0, i), (-1, i), GRIS),
                           ('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold')]
    lignes_tableau.append(['', 'TOTAL', str(facture.nb_repas), '', fcfa(facture.montant_total)])
    i = len(lignes_tableau) - 1
    styles_tableau += [('BACKGROUND', (0, i), (-1, i), BLEU),
                       ('TEXTCOLOR', (0, i), (-1, i), colors.white),
                       ('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold')]

    tableau = Table(lignes_tableau, colWidths=[24 * mm, 66 * mm, 22 * mm, 34 * mm, 34 * mm],
                    repeatRows=1)
    tableau.setStyle(TableStyle(styles_tableau))
    elements += [tableau, Spacer(1, 6 * mm)]

    # ── Montant en lettres ─────────────────────────────────────
    elements.append(p(
        f"Arrêtée la présente facture à la somme de {montant_en_lettres(facture.montant_total)} "
        f"francs CFA ({fcfa(facture.montant_total)} FCFA).", gras))
    if societe.ville:
        elements += [Spacer(1, 8 * mm),
                     p(f"Fait à {societe.ville}, le {cloturee_le:%d/%m/%Y}", droite)]

    # ── Pied de page : identifiants légaux + mentions ──────────
    legal = ' — '.join(x for x in (
        societe.nom,
        societe.identifiant_fiscal and f"N° contribuable : {societe.identifiant_fiscal}",
        societe.registre_commerce and f"RCCM : {societe.registre_commerce}",
    ) if x)
    pied = [legal] if legal else []
    pied += [l.strip() for l in (societe.pied_de_page or '').splitlines() if l.strip()]

    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=28 * mm,
        title=f"Facture {facture.numero or facture.id} — {facture.prestataire_libelle}",
        author=societe.nom or 'Ubifood',
    )
    doc.build(elements, canvasmaker=_canvas_numerote(pied))
    return tampon.getvalue()
