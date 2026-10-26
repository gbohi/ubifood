"""
Documents PDF de la facturation (reportlab), A4 portrait :

  - Relevé de prestations — Bon à facturer (prestataire) : émis par la
    société, le prestataire le joint à sa propre facture en reportant son
    numéro. Page 1 : en-tête société, n° / période / clôture, émetteur et
    prestataire, récapitulatif par plat, HT / TVA / net, montant en
    lettres, visas. Pages suivantes : grille jour × plat avec sous-totaux
    par semaine (totaux identiques à la page 1).
      * officiel  : mois clôturé, numéroté (RP-AAAA-NNN), montants figés ;
      * provisoire : avant clôture, sans numéro, filigrane « PROVISOIRE ».
  - Relevé des repas — Retenues sur salaire (agents) : synthèse par
    catégorie et une ligne par agent, regroupés par agence.

Les données viennent de releves.py (mêmes lignes que l'écran). L'en-tête
société (ParametresSociete) est celui en vigueur au moment du
téléchargement ; les montants d'un mois clôturé, eux, ne changent plus.

Police : Poppins (OFL, api/fonts/) pour les accents ; séparateur de
milliers = espace normale (l'espace fine n'existe pas dans la police).
"""

import os
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
        'septembre', 'octobre', 'novembre', 'décembre']

NAVY = colors.HexColor('#092440')
VERT = colors.HexColor('#3EC970')
VERT_F = colors.HexColor('#EAFBF1')
ORANGE = colors.HexColor('#B7791F')
ROUGE = colors.HexColor('#D9452B')
G900 = colors.HexColor('#1D2939')
G700 = colors.HexColor('#344054')
G600 = colors.HexColor('#475467')
G500 = colors.HexColor('#667085')
G400 = colors.HexColor('#98A2B3')
G300 = colors.HexColor('#D0D5DD')
G200 = colors.HexColor('#EAECF0')
G100 = colors.HexColor('#F2F4F7')
G50 = colors.HexColor('#F8FAFC')

LARGEUR, HAUTEUR = A4
MARGE = 15 * mm
UTILE = LARGEUR - 2 * MARGE


# ══════════════════════════════════════════════════════════════
# Polices
# ══════════════════════════════════════════════════════════════

_POLICES = {'R': 'Helvetica', 'M': 'Helvetica', 'SB': 'Helvetica-Bold', 'B': 'Helvetica-Bold'}


def _polices():
    """Enregistre Poppins (une fois) ; repli sur Helvetica si les fichiers manquent."""
    if _POLICES['R'] == 'Poppins':
        return _POLICES
    dossier = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
    try:
        for cle, nom, fichier in (('R', 'Poppins', 'Poppins-Regular.ttf'),
                                  ('M', 'Poppins-Medium', 'Poppins-Medium.ttf'),
                                  ('SB', 'Poppins-SemiBold', 'Poppins-SemiBold.ttf'),
                                  ('B', 'Poppins-Bold', 'Poppins-Bold.ttf')):
            if nom not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(nom, os.path.join(dossier, fichier)))
        pdfmetrics.registerFontFamily('Poppins', normal='Poppins', bold='Poppins-Bold',
                                      italic='Poppins', boldItalic='Poppins-Bold')
        _POLICES.update(R='Poppins', M='Poppins-Medium', SB='Poppins-SemiBold', B='Poppins-Bold')
    except Exception:
        pass
    return _POLICES


# ══════════════════════════════════════════════════════════════
# Montants
# ══════════════════════════════════════════════════════════════

def fcfa(montant):
    """1234567.00 → '1 234 567' (espace normale : rendue par toutes les polices)."""
    if montant is None:
        return '—'
    return f"{int(Decimal(montant).quantize(Decimal('1'))):,}".replace(',', ' ')


_UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
           'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
_DIZAINES = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'}


def _moins_de_cent(n):
    """0-99, orthographe traditionnelle : vingt et un, soixante et onze, quatre-vingts."""
    if n <= 16:
        return _UNITES[n]
    if n < 20:
        return 'dix-' + _UNITES[n - 10]
    if n < 70:
        d, u = divmod(n, 10)
        if u == 0:
            return _DIZAINES[d]
        return f"{_DIZAINES[d]} et un" if u == 1 else f"{_DIZAINES[d]}-{_UNITES[u]}"
    if n < 80:                                   # 70-79 : soixante-dix, soixante et onze…
        return 'soixante et onze' if n == 71 else 'soixante-' + _moins_de_cent(n - 60)
    if n == 80:
        return 'quatre-vingts'
    return 'quatre-vingt-' + _moins_de_cent(n - 80)   # 81-99 : quatre-vingt-un, quatre-vingt-onze


def _moins_de_mille(n, devant_mille=False):
    """
    0-999. « cents » et « quatre-vingts » prennent un s en fin de nombre, mais
    pas devant « mille » (adjectif invariable) ; ils le gardent devant
    « million(s) » / « milliard(s) » (noms).
    """
    c, reste = divmod(n, 100)
    if c == 0:
        texte = _moins_de_cent(reste)
    elif reste == 0:
        texte = 'cent' if c == 1 else f"{_UNITES[c]} cents"
    else:
        texte = ('cent' if c == 1 else f"{_UNITES[c]} cent") + ' ' + _moins_de_cent(reste)
    if devant_mille and texte.endswith(('cents', 'vingts')):
        texte = texte[:-1]
    return texte


def montant_en_lettres(montant):
    """
    Entier en toutes lettres, orthographe traditionnelle (traits d'union
    seulement sous cent, « et » sans trait d'union) :
    472 500 → « quatre cent soixante-douze mille cinq cents ».
    """
    n = int(Decimal(montant).quantize(Decimal('1')))
    if n == 0:
        return 'zéro'
    morceaux = []
    for valeur, sing, plur in ((10 ** 9, 'milliard', 'milliards'), (10 ** 6, 'million', 'millions')):
        q, n = divmod(n, valeur)
        if q:
            morceaux.append(f"{montant_en_lettres(q) if q >= 1000 else _moins_de_mille(q)} "
                            f"{sing if q == 1 else plur}")
    q, n = divmod(n, 1000)
    if q:
        morceaux.append('mille' if q == 1 else f"{_moins_de_mille(q, devant_mille=True)} mille")
    if n:
        morceaux.append(_moins_de_mille(n))
    return ' '.join(morceaux)


def montant_en_lettres_phrase(montant):
    """« Quatre cent soixante-douze mille cinq cents »"""
    t = montant_en_lettres(montant)
    return t[:1].upper() + t[1:]


# ══════════════════════════════════════════════════════════════
# Mise en page commune
# ══════════════════════════════════════════════════════════════

def _styles():
    f = _polices()
    base = ParagraphStyle('n', fontName=f['R'], fontSize=8, leading=11.5, textColor=G600)
    return {
        'n': base,
        'petit': ParagraphStyle('p', parent=base, fontSize=7.3, leading=10.5, textColor=G500),
        'nom_soc': ParagraphStyle('ns', parent=base, fontName=f['B'], fontSize=10, leading=13, textColor=NAVY),
        'titre': ParagraphStyle('t', parent=base, fontName=f['B'], fontSize=17, leading=20,
                                textColor=NAVY, alignment=TA_RIGHT),
        'sous_titre': ParagraphStyle('st', parent=base, fontName=f['SB'], fontSize=8, leading=11,
                                     textColor=VERT, alignment=TA_RIGHT),
        'lb': ParagraphStyle('lb', parent=base, fontName=f['SB'], fontSize=6.6, leading=9, textColor=G400),
        'bloc_nom': ParagraphStyle('bn', parent=base, fontName=f['B'], fontSize=10, leading=13, textColor=NAVY),
        'h2': ParagraphStyle('h2', parent=base, fontName=f['B'], fontSize=9.5, leading=12, textColor=NAVY),
        'h2_note': ParagraphStyle('h2n', parent=base, fontSize=7.3, leading=12, textColor=G500, alignment=TA_RIGHT),
        'lettres': ParagraphStyle('le', parent=base, fontSize=8.4, leading=12, textColor=G700),
        'cellule': ParagraphStyle('c', parent=base, fontSize=8.2, leading=10.5, textColor=G900),
        'entete_col': ParagraphStyle('ec', parent=base, fontName=f['M'], fontSize=6.6, leading=8,
                                     textColor=colors.white, alignment=TA_RIGHT),
        'sign_t': ParagraphStyle('sgt', parent=base, fontName=f['B'], fontSize=8, leading=10.5, textColor=NAVY),
        'sign': ParagraphStyle('sg', parent=base, fontSize=7.6, leading=10, textColor=G600),
        'sign_bas': ParagraphStyle('sgb', parent=base, fontSize=6.8, leading=9, textColor=G400),
        'kpi': ParagraphStyle('k', parent=base, fontSize=7.4, leading=9.5, textColor=G500),
        'kpi_v': ParagraphStyle('kv', parent=base, fontName=f['B'], fontSize=12, leading=15, textColor=NAVY),
    }


def _p(texte, style):
    """Paragraphe à partir de texte brut (échappé) ; '\\n' → saut de ligne."""
    return Paragraph(escape(str(texte or '')).replace('\n', '<br/>'), style)


def _logo(societe, hauteur_max, largeur_max):
    if not getattr(societe, 'logo', None):
        return None
    try:
        img = Image(societe.logo.path)
        ratio = min(largeur_max / img.imageWidth, hauteur_max / img.imageHeight)
        img.drawWidth, img.drawHeight = img.imageWidth * ratio, img.imageHeight * ratio
        img.hAlign = 'LEFT'
        return img
    except Exception:
        return None   # logo illisible ou absent du disque : document sans logo


def _texte_legal(societe):
    """
    Lignes du pied de page : [(gras, texte, texte_court)] — nom de la société
    en gras, identifiants et adresse ; texte_court (adresse réduite à sa
    première partie et à la ville) quand la ligne complète est trop longue.
    """
    def ident(valeur, prefixe):
        return valeur if not valeur or valeur.upper().startswith(prefixe) else f"{prefixe} {valeur}"

    adresse = (societe.adresse or '').replace('\n', ', ')
    ids = [x for x in (ident(societe.identifiant_fiscal, 'CC'), ident(societe.registre_commerce, 'RCCM')) if x]
    complet = ', '.join(x for x in (adresse, societe.ville) if x)
    court = ', '.join(x for x in (adresse.split(',')[0].strip(), societe.ville) if x)
    lignes = [(societe.nom or '', ' — '.join(ids + ([complet] if complet else [])),
               ' — '.join(ids + ([court] if court else [])))]
    lignes += [('', l.strip(), l.strip()) for l in (societe.pied_de_page or '').splitlines() if l.strip()]
    return lignes


def _canvas(societe, reference, filigrane=None):
    """
    Canvas qui, à l'enregistrement, ajoute sur chaque page : bandeau de
    couleur, filigrane éventuel, pied de page légal et « Page x / y ».
    """
    f = _polices()
    legal = _texte_legal(societe)

    class CanvasReleve(rl_canvas.Canvas):
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
                self._decor(total)
                super().showPage()
            super().save()

        def _decor(self, total):
            self.saveState()
            # Bandeau : bleu nuit puis vert
            self.setFillColor(NAVY)
            self.rect(0, HAUTEUR - 3.2 * mm, LARGEUR * .72, 3.2 * mm, stroke=0, fill=1)
            self.setFillColor(VERT)
            self.rect(LARGEUR * .72, HAUTEUR - 3.2 * mm, LARGEUR * .28, 3.2 * mm, stroke=0, fill=1)
            if filigrane:
                self.saveState()
                self.setFillColor(colors.HexColor('#F06548'))
                self.setFillAlpha(.10)
                self.translate(LARGEUR / 2, HAUTEUR / 2 - 10 * mm)
                self.rotate(30)
                self.setFont(f['B'], 64)
                self.drawCentredString(0, 0, filigrane)
                self.restoreState()
            # Pied de page
            self.setStrokeColor(G300)
            self.setLineWidth(.3 * mm * .8)
            self.line(MARGE, 19 * mm, LARGEUR - MARGE, 19 * mm)
            y = 15.5 * mm
            for gras, texte, court in legal[:3]:
                x = MARGE
                if gras:
                    self.setFont(f['B'], 6.6)
                    self.setFillColor(G700)
                    self.drawString(x, y, gras)
                    x += pdfmetrics.stringWidth(gras, f['B'], 6.6)
                    texte = f" — {texte}" if texte else ''
                    court = f" — {court}" if court else ''
                self.setFont(f['R'], 6.6)
                self.setFillColor(G500)
                largeur_max = LARGEUR - MARGE - 40 * mm - x
                if pdfmetrics.stringWidth(texte, f['R'], 6.6) > largeur_max:
                    texte = court
                while texte and pdfmetrics.stringWidth(texte, f['R'], 6.6) > largeur_max:
                    texte = texte[:-2].rstrip() + '…'
                self.drawString(x, y, texte)
                y -= 3.3 * mm
            self.setFont(f['SB'], 6.8)
            self.setFillColor(NAVY)
            self.drawRightString(LARGEUR - MARGE, 15.5 * mm,
                                 f"{reference + ' · ' if reference else ''}Page {self._pageNumber} / {total}")
            self.restoreState()

    return CanvasReleve


def _doc(tampon, titre, auteur, entete_suite=None):
    """Document à deux gabarits : première page, puis pages suivantes (mini en-tête)."""
    bas = 24 * mm
    premiere = Frame(MARGE, bas, UTILE, HAUTEUR - bas - 14 * mm, id='p1',
                     leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    haut_suite = 24 * mm if entete_suite else 14 * mm
    suite = Frame(MARGE, bas, UTILE, HAUTEUR - bas - haut_suite, id='suite',
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = BaseDocTemplate(tampon, pagesize=A4, title=titre, author=auteur,
                          leftMargin=MARGE, rightMargin=MARGE, topMargin=14 * mm, bottomMargin=bas)
    doc.addPageTemplates([
        PageTemplate(id='premiere', frames=[premiere], autoNextPageTemplate='suite'),
        PageTemplate(id='suite', frames=[suite], onPage=entete_suite or (lambda c, d: None)),
    ])
    return doc


def _entete_suite(societe, texte_gras, texte):
    """Mini en-tête des pages 2 et suivantes : logo à gauche, référence à droite, filet."""
    f = _polices()

    def dessiner(c, doc):
        c.saveState()
        y = HAUTEUR - 18 * mm
        if getattr(societe, 'logo', None):
            try:
                from reportlab.lib.utils import ImageReader
                img = ImageReader(societe.logo.path)
                l, h = img.getSize()
                ratio = min(30 * mm / l, 8 * mm / h)
                c.drawImage(img, MARGE, y - 1 * mm, l * ratio, h * ratio, mask='auto')
            except Exception:
                pass
        x = LARGEUR - MARGE
        c.setFont(f['R'], 8)
        c.setFillColor(G600)
        c.drawRightString(x, y + 1.5 * mm, texte)
        c.setFont(f['B'], 8)
        c.setFillColor(NAVY)
        c.drawRightString(x - pdfmetrics.stringWidth(texte, f['R'], 8), y + 1.5 * mm, texte_gras)
        c.setStrokeColor(NAVY)
        c.setLineWidth(.4 * mm)
        c.line(MARGE, y - 2.5 * mm, LARGEUR - MARGE, y - 2.5 * mm)
        c.restoreState()
    return dessiner


def _bloc_societe(societe, st, sous_ligne=None):
    bloc = []
    logo = _logo(societe, 15 * mm, 45 * mm)
    if logo:
        bloc += [logo, Spacer(1, 2 * mm)]
    if societe.nom:
        bloc.append(_p(societe.nom, st['nom_soc']))
    if sous_ligne:
        bloc.append(_p(sous_ligne, st['n']))
    else:
        adresse = ' — '.join(x for x in ((societe.adresse or '').replace('\n', ', '), societe.ville) if x)
        if adresse:
            bloc.append(_p(adresse, st['n']))
        contact = ' · '.join(x for x in (societe.telephone and f"Tél. {societe.telephone}", societe.email) if x)
        if contact:
            bloc.append(_p(contact, st['n']))
    return bloc


def _meta(lignes, st):
    """Petit cadre libellé / valeur (n°, période, dates)."""
    f = _polices()
    donnees = [[_p(l, ParagraphStyle('ml', parent=st['n'], textColor=G500)),
                Paragraph(v, ParagraphStyle('mv', parent=st['n'], fontName=f['B'], textColor=couleur or NAVY))]
               for l, v, couleur in lignes]
    t = Table(donnees, colWidths=[16 * mm, 52 * mm], hAlign='RIGHT', cornerRadii=[2 * mm] * 4)
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), .3 * mm, G300),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), .3 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), .3 * mm),
        ('TOPPADDING', (0, 0), (-1, 0), 2.4 * mm), ('BOTTOMPADDING', (0, -1), (-1, -1), 2.4 * mm),
        ('RIGHTPADDING', (0, 0), (0, -1), 0),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def _entete(societe, titre, sous_titre, meta, st, sous_ligne_societe=None):
    droite = [Paragraph(escape(titre), st['titre']), Spacer(1, 1 * mm),
              Paragraph(escape(sous_titre.upper()), st['sous_titre']), Spacer(1, 3 * mm), meta]
    t = Table([[_bloc_societe(societe, st, sous_ligne_societe), droite]], colWidths=[UTILE - 92 * mm, 92 * mm])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                           ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return t


def _h2(titre, note, st, avant=6 * mm):
    t = Table([[Paragraph(escape(titre), st['h2']), Paragraph(escape(note or ''), st['h2_note'])]],
              colWidths=[UTILE * .45, UTILE * .55])
    t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                           ('TOPPADDING', (0, 0), (-1, -1), avant), ('BOTTOMPADDING', (0, 0), (-1, -1), 2 * mm),
                           ('VALIGN', (0, 0), (-1, -1), 'BOTTOM')]))
    return t


def _style_tableau(nb_lignes, droite_depuis, total=True, taille=8.3):
    """Tableau de données : en-tête bleu nuit, filets fins, ligne total verte."""
    f = _polices()
    s = [
        ('FONTNAME', (0, 0), (-1, -1), f['R']), ('FONTSIZE', (0, 0), (-1, -1), taille),
        ('TEXTCOLOR', (0, 0), (-1, -1), G900),
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), f['SB']), ('FONTSIZE', (0, 0), (-1, 0), 7.6),
        ('ALIGN', (droite_depuis, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 1), (-1, -1), .25 * mm, G200),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.7 * mm),
        ('TOPPADDING', (0, 0), (-1, 0), 1.8 * mm), ('BOTTOMPADDING', (0, 0), (-1, 0), 2 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 2.5 * mm),
    ]
    if total:
        s += [('BACKGROUND', (0, nb_lignes - 1), (-1, nb_lignes - 1), VERT_F),
              ('FONTNAME', (0, nb_lignes - 1), (-1, nb_lignes - 1), f['B']),
              ('FONTSIZE', (0, nb_lignes - 1), (-1, nb_lignes - 1), 9),
              ('TEXTCOLOR', (0, nb_lignes - 1), (-1, nb_lignes - 1), NAVY),
              ('LINEABOVE', (0, nb_lignes - 1), (-1, nb_lignes - 1), .4 * mm, VERT),
              ('LINEBELOW', (0, nb_lignes - 1), (-1, nb_lignes - 1), 0, colors.white)]
    return s


def _signatures(cases, st):
    """Cadres de visa (titre, fonction, mention en bas)."""
    largeur = (UTILE - 4 * mm * (len(cases) - 1)) / len(cases)
    cellules = []
    for titre, fonction, bas in cases:
        interieur = Table([[[_p(titre, st['sign_t']), _p(fonction, st['sign'])]], [_p(bas, st['sign_bas'])]],
                          colWidths=[largeur], rowHeights=[23 * mm, 7 * mm], cornerRadii=[2 * mm] * 4)
        interieur.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), .3 * mm, G300), ('VALIGN', (0, 0), (-1, 0), 'TOP'),
            ('VALIGN', (0, 1), (-1, 1), 'BOTTOM'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 3 * mm),
            ('TOPPADDING', (0, 0), (-1, 0), 2.4 * mm), ('BOTTOMPADDING', (0, 1), (-1, 1), 2.4 * mm)]))
        cellules.append(interieur)
    largeurs = []
    ligne = []
    for i, c in enumerate(cellules):
        if i:
            ligne.append('')
            largeurs.append(4 * mm)
        ligne.append(c)
        largeurs.append(largeur)
    t = Table([ligne], colWidths=largeurs)
    t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                           ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return t


def _date(d):
    return f"{timezone.localtime(d):%d/%m/%Y}" if hasattr(d, 'hour') else f"{d:%d/%m/%Y}"


# ══════════════════════════════════════════════════════════════
# Relevé de prestations — Bon à facturer
# ══════════════════════════════════════════════════════════════

def generer_releve_prestations(synth, prestataire, societe, numero=None, cloturee_le=None,
                               filigrane=None, etabli_le=None):
    """
    PDF (bytes) du relevé de prestations d'un prestataire.
    synth : releves.synthese(...) ; numero : None pour un document provisoire
    (filigrane « PROVISOIRE », sans numéro) ; cloturee_le : date de clôture.
    """
    st = _styles()
    f = _polices()
    etabli_le = etabli_le or cloturee_le or timezone.now()
    reference = numero or 'Provisoire'
    periode = synth['periode']
    nom_prest = getattr(prestataire, 'libelle', None) or synth.get('prestataire_libelle') or '—'
    elements = []

    # ── En-tête ───────────────────────────────────────────────
    meta = _meta([
        ('N°', escape(numero) if numero else 'attribué à la clôture', None if numero else ORANGE),
        ('Période', f"du {synth['debut']:%d/%m/%Y} au {synth['fin']:%d/%m/%Y}", None),
        ('Établi le', _date(etabli_le), None),
        ('Clôture', f"figé le {_date(cloturee_le)}" if cloturee_le else 'non clôturé — provisoire',
         None if cloturee_le else ORANGE),
    ], st)
    elements += [_entete(societe, 'RELEVÉ DE PRESTATIONS', 'Bon à facturer · restauration du personnel',
                         meta, st), Spacer(1, 7 * mm)]

    # ── Émetteur (client) / prestataire ───────────────────────
    def ids(fiscal, rccm):
        return ' · '.join(x for x in (
            fiscal and (fiscal if fiscal.upper().startswith('CC') else f"CC {fiscal}"),
            rccm and (rccm if rccm.upper().startswith('RCCM') else f"RCCM {rccm}")) if x)

    emetteur = [_p('ÉMETTEUR (CLIENT)', st['lb']), _p(societe.nom or '—', st['bloc_nom']),
                _p('Service gestion de la cantine', st['n'])]
    if ids(societe.identifiant_fiscal, societe.registre_commerce):
        emetteur.append(_p(ids(societe.identifiant_fiscal, societe.registre_commerce), st['n']))
    if synth['agences']:
        emetteur.append(_p(f"Sites concernés : {', '.join(synth['agences'])}", st['n']))

    p = prestataire
    bloc_p = [_p('PRESTATAIRE', st['lb']), _p(nom_prest, st['bloc_nom'])]
    for valeur in (
        getattr(p, 'contact_nom', '') and f"À l'attention de {p.contact_nom}",
        ' — '.join(x for x in ((getattr(p, 'adresse', '') or '').replace('\n', ', '), getattr(p, 'ville', '')) if x),
        ' · '.join(x for x in (getattr(p, 'telephone', '') and f"Tél. {p.telephone}", getattr(p, 'email', '')) if x),
        ids(getattr(p, 'identifiant_fiscal', ''), getattr(p, 'registre_commerce', '')),
    ):
        if valeur:
            bloc_p.append(_p(valeur, st['n']))
    blocs = Table([[emetteur, '', bloc_p]], colWidths=[(UTILE - 5 * mm) / 2, 5 * mm, (UTILE - 5 * mm) / 2])
    blocs.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (0, 0), .3 * mm, colors.HexColor('#E4E7EC')),
        ('BOX', (2, 0), (2, 0), .3 * mm, colors.HexColor('#E4E7EC')),
        ('BACKGROUND', (2, 0), (2, 0), G50),
        ('LEFTPADDING', (0, 0), (-1, -1), 4 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 4 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), 3 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm),
        ('LEFTPADDING', (1, 0), (1, 0), 0), ('RIGHTPADDING', (1, 0), (1, 0), 0),
    ]))
    elements.append(blocs)

    # ── Récapitulatif par plat ────────────────────────────────
    elements.append(_h2('Récapitulatif par plat',
                        'Repas commandés et non annulés · tarif contractuel en vigueur', st))
    donnees = [['N°', 'Désignation', 'Quantité', 'P.U. (FCFA)', 'Montant (FCFA)']]
    for i, l in enumerate(synth['par_plat'], start=1):
        donnees.append([str(i), Paragraph(escape(l['plat']), st['cellule']), str(l['nb_repas']),
                        fcfa(l['pu']) if l['pu'] is not None else 'sans tarif',
                        fcfa(l['montant']) if l['pu'] is not None else '—'])
    nb = synth['nb_repas']
    donnees.append(['', f"TOTAL — {nb} repas", str(nb), '', fcfa(synth['montant'])])
    t = Table(donnees, colWidths=[10 * mm, UTILE - 98 * mm, 24 * mm, 30 * mm, 34 * mm], repeatRows=1)
    style = _style_tableau(len(donnees), 2)
    style += [('ALIGN', (0, 0), (0, -1), 'LEFT')]
    for i, l in enumerate(synth['par_plat'], start=1):
        if l['pu'] is None:
            style.append(('TEXTCOLOR', (3, i), (4, i), ROUGE))
    t.setStyle(TableStyle(style))
    elements.append(t)

    # ── HT / TVA / net ────────────────────────────────────────
    nets = Table([['Total hors taxes', fcfa(synth['montant'])],
                  ['TVA', 'selon facture du prestataire'],
                  ['Net à payer (FCFA)', fcfa(synth['montant'])]],
                 colWidths=[46 * mm, 46 * mm], hAlign='RIGHT')
    nets.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), f['R']), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (-1, -1), G900), ('TEXTCOLOR', (1, 1), (1, 1), G500),
        ('FONTNAME', (0, 2), (-1, 2), f['B']), ('TEXTCOLOR', (0, 2), (-1, 2), NAVY),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, 1), .25 * mm, G200),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.7 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 2.5 * mm),
    ]))
    elements += [Spacer(1, 3 * mm), nets]

    # ── Montant en lettres ────────────────────────────────────
    lettres = Table([[Paragraph(
        f"Arrêté le présent relevé à la somme de <font name='{f['B']}' color='#092440'>"
        f"{escape(montant_en_lettres_phrase(synth['montant']))} ({fcfa(synth['montant'])}) francs CFA</font> "
        "hors taxes.", st['lettres'])]], colWidths=[UTILE])
    lettres.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), G50), ('LINEBEFORE', (0, 0), (0, -1), 1.2 * mm, VERT),
        ('LEFTPADDING', (0, 0), (-1, -1), 4 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 4 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), 2.6 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.8 * mm)]))
    elements += [Spacer(1, 4 * mm), lettres, Spacer(1, 2.5 * mm)]

    note = (f"Dont {synth['retires']} repas retiré{'s' if synth['retires'] > 1 else ''} et "
            f"{synth['non_retires']} repas commandé{'s' if synth['non_retires'] > 1 else ''} non "
            f"retiré{'s' if synth['non_retires'] > 1 else ''} (dus selon le contrat). "
            "Détail par jour en page 2 ; détail par agent disponible sur demande. ")
    if numero:
        note += ("Ce relevé ne vaut pas facture : le prestataire établit sa facture en y reportant "
                 f"le n° {numero}.")
    else:
        note += ("Document provisoire : les montants et le numéro du relevé sont attribués à la "
                 "clôture du mois. Ce relevé ne vaut pas facture.")
    if synth['repas_sans_tarif']:
        note += (f" Attention : {synth['repas_sans_tarif']} repas sans tarif du prestataire "
                 "à la date du menu, non chiffrés.")
    elements.append(_p(note, st['petit']))

    # ── Visas ─────────────────────────────────────────────────
    elements += [Spacer(1, 6 * mm), KeepTogether(_signatures([
        ('Établi par', 'Gestionnaire cantine', 'Nom, date et signature'),
        ('Validé par', 'Direction administrative et financière', 'Nom, date, signature et cachet'),
        ('Bon pour accord', f"Prestataire — {nom_prest}", 'Date, signature et cachet'),
    ], st))]

    # ── Pages suivantes : grille jour × plat ──────────────────
    if synth['semaines']:
        elements += [NextPageTemplate('suite'), PageBreak()]
        elements += _grille_jours(synth, st)

    tampon = BytesIO()
    titre_suite = f"{reference}" if numero else 'Relevé provisoire'
    doc = _doc(tampon, f"Relevé de prestations {numero or '(provisoire)'} — {nom_prest}",
               societe.nom or 'Ubifood',
               _entete_suite(societe, titre_suite, f" · {nom_prest} · {periode}"))
    doc.build(elements, canvasmaker=_canvas(societe, numero or 'Provisoire', filigrane))
    return tampon.getvalue()


def _grille_jours(synth, st):
    """Grille jour × plat, sous-totaux par semaine, total = récapitulatif page 1."""
    f = _polices()
    tarifs = synth['tarifs']
    pu = (f"P.U. {fcfa(tarifs[0])} FCFA" if len(tarifs) == 1
          else f"P.U. {fcfa(tarifs[0])} à {fcfa(tarifs[-1])} FCFA" if tarifs else 'sans tarif')
    elements = [_h2('Détail par jour et par plat',
                    f"quantités servies · {pu} · « · » = plat non servi ce jour", st, avant=0)]
    plats = synth['plats_ordre']
    totaux_plat = {}
    for l in synth['par_plat']:
        totaux_plat[l['plat']] = totaux_plat.get(l['plat'], 0) + l['nb_repas']
    # Au-delà de 9 plats, la grille est découpée en plusieurs tableaux
    paquets = [plats[i:i + 9] for i in range(0, len(plats), 9)] or [[]]
    for n, paquet in enumerate(paquets):
        largeur_plat = (UTILE - 21 * mm - 13 * mm - 19 * mm) / max(len(paquet), 1)
        entete = [Paragraph('Date', ParagraphStyle('ed', parent=st['entete_col'], alignment=TA_LEFT,
                                                     fontName=f['SB'], fontSize=7.4))]
        entete += [Paragraph(escape(p), st['entete_col']) for p in paquet]
        entete += [Paragraph('Repas', ParagraphStyle('er', parent=st['entete_col'], fontName=f['SB'], fontSize=7.4)),
                   Paragraph('Montant', ParagraphStyle('em', parent=st['entete_col'], fontName=f['SB'], fontSize=7.4))]
        lignes = [entete]
        style = [
            ('FONTNAME', (0, 0), (-1, -1), f['R']), ('FONTSIZE', (0, 0), (-1, -1), 7.8),
            ('TEXTCOLOR', (0, 0), (-1, -1), G900),
            ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('VALIGN', (0, 0), (-1, 0), 'BOTTOM'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 1.6 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 1.6 * mm),
            ('TOPPADDING', (0, 0), (-1, -1), .9 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.15 * mm),
            ('TOPPADDING', (0, 0), (-1, 0), 1.6 * mm), ('BOTTOMPADDING', (0, 0), (-1, 0), 1.6 * mm),
            ('LINEBELOW', (0, 1), (-1, -1), .25 * mm, G200),
            ('FONTNAME', (-2, 1), (-2, -1), f['SB']),
        ]
        for s in synth['semaines']:
            for j in s['jours']:
                q = dict(j['plats'])
                i = len(lignes)
                ligne = [_libelle_jour(j['date'])]
                for p in paquet:
                    if p in q:
                        ligne.append(str(q[p]))
                    else:
                        ligne.append('·')
                        style.append(('TEXTCOLOR', (len(ligne) - 1, i), (len(ligne) - 1, i), G300))
                ligne += [str(j['nb_repas']), fcfa(j['montant'])]
                lignes.append(ligne)
            i = len(lignes)
            lignes.append([f"Semaine {s['numero']}"] + [str(s['plats'][p]) if s['plats'].get(p) else ''
                                                       for p in paquet]
                          + [str(s['nb_repas']), fcfa(s['montant'])])
            style += [('BACKGROUND', (0, i), (-1, i), G100), ('FONTNAME', (0, i), (-1, i), f['SB']),
                      ('FONTSIZE', (0, i), (-1, i), 7.2), ('TEXTCOLOR', (0, i), (-1, i), G700),
                      ('LINEBELOW', (0, i), (-1, i), .3 * mm, G300)]
        i = len(lignes)
        lignes.append(['TOTAL'] + [str(totaux_plat.get(p, 0)) for p in paquet]
                      + [str(synth['nb_repas']), fcfa(synth['montant'])])
        style += [('BACKGROUND', (0, i), (-1, i), VERT_F), ('FONTNAME', (0, i), (-1, i), f['B']),
                  ('FONTSIZE', (0, i), (-1, i), 8), ('TEXTCOLOR', (0, i), (-1, i), NAVY),
                  ('LINEABOVE', (0, i), (-1, i), .4 * mm, VERT)]
        t = Table(lignes, colWidths=[21 * mm] + [largeur_plat] * len(paquet) + [13 * mm, 19 * mm], repeatRows=1)
        t.setStyle(TableStyle(style))
        if n:
            elements.append(Spacer(1, 5 * mm))
        elements.append(t)
    elements += [Spacer(1, 2.5 * mm), _p(
        "Les totaux par plat de ce tableau sont ceux du récapitulatif de la page 1. "
        "Montants en FCFA hors taxes.", st['petit'])]
    return elements


def _libelle_jour(d):
    jours = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']
    return f"{jours[d.weekday()]} {d:%d/%m}"


def generer_facture_prestataire(facture, societe):
    """Relevé officiel (bytes) d'une FacturePrestataire figée : numéroté, sans filigrane."""
    from .releves import fact, lignes_de_facture, synthese
    debut, fin = fact.bornes_mois(facture.annee, facture.mois)
    synth = synthese(lignes_de_facture(facture), debut, fin)
    synth['prestataire_libelle'] = facture.prestataire_libelle
    return generer_releve_prestations(
        synth, facture.prestataire, societe, numero=facture.numero or f"FP-{facture.id}",
        cloturee_le=facture.cloture.cloturee_le)


# ══════════════════════════════════════════════════════════════
# Relevé des repas — Retenues sur salaire (agents)
# ══════════════════════════════════════════════════════════════

def generer_releve_agents(data, societe, debut, fin, agences_libelle='toutes'):
    """PDF (bytes) du relevé des repas des agents ; data : releves.releve_agents(...)."""
    from .releves import libelle_periode, mois_entier
    st = _styles()
    f = _polices()
    periode = libelle_periode(debut, fin)
    etat = data['etat']
    libelle_etat, couleur_etat = (('Clôturé (montants figés)', colors.HexColor('#219653')) if etat == 'cloturee'
                                  else ('Partiellement clôturé', ORANGE) if etat == 'partielle'
                                  else ('Provisoire (non clôturé)', ORANGE))
    m = mois_entier(debut, fin)
    reference = f"Relevé agents {m[1]:02d}/{m[0]}" if m else f"Relevé agents {debut:%d/%m/%y}–{fin:%d/%m/%y}"
    elements = []

    meta = _meta([
        ('Période', f"du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}", None),
        ('Agences', escape(agences_libelle), None),
        ('État', libelle_etat, couleur_etat),
        ('Édité le', f"{timezone.localtime():%d/%m/%Y à %H:%M}", None),
    ], st)
    elements += [_entete(societe, 'RELEVÉ DES REPAS AGENTS', f"Retenues sur salaire · {periode}", meta, st,
                         sous_ligne_societe='Service gestion de la cantine'), Spacer(1, 5 * mm)]

    # ── 4 chiffres ────────────────────────────────────────────
    sans = data['repas_sans_tarif']
    chiffres = [('Agents', str(data['nb_agents'])), ('Repas facturés', str(data['nb_repas'])),
                ('Montant à retenir', f"{fcfa(data['montant'])} F"), ('Repas sans tarif', str(sans))]
    largeur = (UTILE - 9 * mm) / 4
    cases = []
    for i, (l, v) in enumerate(chiffres):
        alerte = i == 3 and sans
        case = Table([[_p(l, ParagraphStyle('kl', parent=st['kpi'], textColor=ROUGE if alerte else G500))],
                      [_p(v, ParagraphStyle('kv2', parent=st['kpi_v'], textColor=ROUGE if alerte else NAVY))]],
                     colWidths=[largeur], cornerRadii=[2 * mm] * 4)
        case.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), .3 * mm, colors.HexColor('#F3B9AC') if alerte else colors.HexColor('#E4E7EC')),
            ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm), ('TOPPADDING', (0, 0), (-1, 0), 2.4 * mm),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 2.4 * mm), ('TOPPADDING', (0, 1), (-1, 1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, 0), .5 * mm)]))
        cases += ([''] if i else []) + [case]
    kpis = Table([cases], colWidths=[largeur, 3 * mm] * 3 + [largeur])
    kpis.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    elements.append(kpis)

    # ── Synthèse par catégorie ────────────────────────────────
    elements.append(_h2('Synthèse par catégorie', 'tarif de la catégorie à la date du menu', st))
    donnees = [['Catégorie', 'Agents', 'Repas', 'Tarif (FCFA)', 'Montant (FCFA)']]
    style_extra = []
    for c in data['par_categorie']:
        if c['tarif'] is not None:
            tarif = fcfa(c['tarif'])
        elif c['tarif_min'] is not None:
            tarif = f"{fcfa(c['tarif_min'])} – {fcfa(c['tarif_max'])}"
        else:
            tarif = '—'
        donnees.append([c['categorie'] or 'Sans catégorie (à compléter)', str(c['nb_agents']), str(c['nb_repas']),
                        tarif, fcfa(c['montant']) if c['montant'] else '—'])
        if not c['categorie']:
            style_extra.append(('TEXTCOLOR', (0, len(donnees) - 1), (0, len(donnees) - 1), ROUGE))
    donnees.append(['TOTAL', str(data['nb_agents']), str(data['nb_repas']), '', fcfa(data['montant'])])
    t = Table(donnees, colWidths=[UTILE - 100 * mm, 20 * mm, 20 * mm, 28 * mm, 32 * mm], repeatRows=1)
    t.setStyle(TableStyle(_style_tableau(len(donnees), 1) + style_extra))
    elements.append(t)

    # ── Détail par agence ─────────────────────────────────────
    cel = ParagraphStyle('ca', parent=st['cellule'], fontSize=7.6, leading=9.5)
    for g in data['agences']:
        elements.append(_h2(f"Détail par agent — {g['agence']}", 'trié par nom · 1 ligne par agent', st))
        donnees = [['N°', 'Agent (matricule)', 'Catégorie', 'Repas', 'Tarif', 'À retenir (FCFA)']]
        style = _style_tableau(0, 3, total=False, taille=7.6)
        style += [('TOPPADDING', (0, 1), (-1, -1), .9 * mm), ('BOTTOMPADDING', (0, 1), (-1, -1), 1.1 * mm),
                  ('ALIGN', (0, 0), (0, -1), 'RIGHT'), ('TEXTCOLOR', (0, 1), (0, -1), G400),
                  ('FONTNAME', (5, 1), (5, -1), f['B'])]
        for i, e in enumerate(g['agents'], start=1):
            sans_cat = not e['categorie']
            donnees.append([
                str(i),
                Paragraph(f"<font name='{f['B']}'>{escape(e['nom_prenom'])}</font> "
                          f"<font color='#98A2B3'>{escape(e['username'])}</font>", cel),
                Paragraph(escape(e['categorie'] or 'Sans catégorie'),
                          ParagraphStyle('cc', parent=cel, textColor=ROUGE if sans_cat else G900)),
                str(e['nb_repas']),
                fcfa(e['tarif_unitaire']) if e['tarif_unitaire'] is not None else '—',
                fcfa(e['total']) if not e['repas_sans_tarif'] else
                (f"{fcfa(e['total'])} + à compléter" if e['total'] else 'à compléter'),
            ])
            if e['repas_sans_tarif']:
                style.append(('TEXTCOLOR', (5, i), (5, i), ROUGE))
        i = len(donnees)
        donnees.append(['', f"Sous-total {g['agence']} · {len(g['agents'])} agent{'s' if len(g['agents']) > 1 else ''}",
                        '', str(g['nb_repas']), '', fcfa(g['montant'])])
        style += [('SPAN', (1, i), (2, i)), ('BACKGROUND', (0, i), (-1, i), G50),
                  ('FONTNAME', (0, i), (-1, i), f['SB']), ('TEXTCOLOR', (0, i), (-1, i), G700)]
        t = Table(donnees, colWidths=[8 * mm, UTILE - 106 * mm, 34 * mm, 16 * mm, 20 * mm, 28 * mm], repeatRows=1)
        t.setStyle(TableStyle(style))
        elements.append(t)

    total = Table([['', f"TOTAL GÉNÉRAL · {data['nb_agents']} agents", str(data['nb_repas']), '',
                    fcfa(data['montant'])]],
                  colWidths=[8 * mm, UTILE - 72 * mm, 16 * mm, 20 * mm, 28 * mm])
    total.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), f['B']), ('FONTSIZE', (0, 0), (-1, -1), 8.6),
        ('BACKGROUND', (0, 0), (-1, -1), VERT_F), ('TEXTCOLOR', (0, 0), (-1, -1), NAVY),
        ('LINEABOVE', (0, 0), (-1, 0), .4 * mm, VERT), ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.8 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 2 * mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 2.5 * mm)]))
    elements += [Spacer(1, 3 * mm), total]

    note = ("Repas commandés et non annulés (retirés ou non), au tarif de la catégorie salarié "
            "en vigueur à la date du menu. ")
    note += ("Montants figés à la clôture du mois." if etat == 'cloturee' else
             "Montants provisoires tant que le mois n'est pas clôturé.")
    if sans:
        note += f" {sans} repas sans tarif (catégorie ou tarif manquant) : à compléter avant la retenue."
    elements += [Spacer(1, 2.5 * mm), _p(note, st['petit']), Spacer(1, 6 * mm),
                 KeepTogether(_signatures([
                     ('Établi par', 'Gestionnaire cantine', 'Nom, date et signature'),
                     ('Visa', 'Ressources humaines / Paie', 'Nom, date, signature et cachet'),
                 ], st))]

    tampon = BytesIO()
    doc = _doc(tampon, f"Relevé des repas agents — {periode}", societe.nom or 'Ubifood',
               _entete_suite(societe, 'Relevé des repas agents', f" · retenues sur salaire · {periode}"))
    doc.build(elements, canvasmaker=_canvas(societe, reference))
    return tampon.getvalue()
