"""
Documents PDF de la caisse (reportlab) :

  - Reçu de caisse (non fiscal) : format ticket 80 mm (hauteur ajustée au
    contenu) ou A5 portrait : n°, date / heure, caissier, employé (nom,
    matricule), type, montant, mode, détail des repas régularisés, solde
    après, mention « Reçu non fiscal ». Reçu annulé : bandeau « ANNULÉ ».
  - Journal de caisse d'une journée (A4) : reçus, totaux par type et par
    caissier, clôtures de caisse du jour.
  - Mouvements du compte repas d'un employé (A4, comptabilité) et leur
    export Excel (.xlsx écrit sans bibliothèque : zip + XML SpreadsheetML).

Identité de la société et polices Poppins : comme pdf_factures.py.
"""

import zipfile
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Spacer, Table, TableStyle

from .pdf_factures import (
    G200, G300, G500, G600, G900, NAVY, ROUGE, VERT, VERT_F, UTILE, _canvas, _doc, _entete,
    _entete_suite, _h2, _logo, _meta, _p, _polices, _style_tableau, _styles, fcfa,
)

MENTION_NON_FISCAL = "Reçu non fiscal"


def _nom(user):
    from .serializers import nom_complet
    return nom_complet(user) if user else '—'


def _f(montant):
    return f"{fcfa(montant)} F"


# ══════════════════════════════════════════════════════════════
# Reçu de caisse
# ══════════════════════════════════════════════════════════════

def _styles_recu(echelle):
    f = _polices()
    base = ParagraphStyle('r', fontName=f['R'], fontSize=7.6 * echelle, leading=10 * echelle, textColor=G900)
    return {
        'n': base,
        'c': ParagraphStyle('rc', parent=base, alignment=TA_CENTER),
        'petit_c': ParagraphStyle('rpc', parent=base, fontSize=6.6 * echelle, leading=8.6 * echelle,
                                  textColor=G500, alignment=TA_CENTER),
        'soc': ParagraphStyle('rs', parent=base, fontName=f['B'], fontSize=9.5 * echelle, leading=12 * echelle,
                              textColor=NAVY, alignment=TA_CENTER),
        'titre': ParagraphStyle('rt', parent=base, fontName=f['B'], fontSize=10.5 * echelle,
                                leading=13 * echelle, textColor=NAVY, alignment=TA_CENTER),
        'num': ParagraphStyle('rn', parent=base, fontName=f['SB'], fontSize=8.4 * echelle, leading=11 * echelle,
                              textColor=VERT, alignment=TA_CENTER),
        'annule': ParagraphStyle('ra', parent=base, fontName=f['B'], fontSize=10 * echelle, leading=13 * echelle,
                                 textColor=ROUGE, alignment=TA_CENTER),
        'd': ParagraphStyle('rd', parent=base, alignment=TA_RIGHT),
        'db': ParagraphStyle('rdb', parent=base, fontName=f['B'], alignment=TA_RIGHT, textColor=NAVY),
        'b': ParagraphStyle('rb', parent=base, fontName=f['B'], textColor=NAVY),
        'lb': ParagraphStyle('rl', parent=base, textColor=G600),
    }


def _contenu_recu(recu, societe, largeur, echelle):
    st = _styles_recu(echelle)
    el = []
    logo = _logo(societe, 12 * mm * echelle, 40 * mm * echelle)
    if logo:
        logo.hAlign = 'CENTER'
        el += [logo, Spacer(1, 1.5 * mm)]
    if societe.nom:
        el.append(_p(societe.nom, st['soc']))
    adresse = ' — '.join(x for x in ((societe.adresse or '').replace('\n', ', '), societe.ville) if x)
    if adresse:
        el.append(_p(adresse, st['petit_c']))
    contact = ' · '.join(x for x in (societe.telephone and f"Tél. {societe.telephone}", societe.email) if x)
    if contact:
        el.append(_p(contact, st['petit_c']))
    el += [Spacer(1, 2.5 * mm), _p('REÇU DE CAISSE — COMPTE REPAS', st['titre']), _p(recu.numero, st['num'])]
    if recu.statut == 'annule':
        el += [Spacer(1, 1.5 * mm), _p('ANNULÉ', st['annule']),
               _p(f"le {timezone.localtime(recu.annule_le):%d/%m/%Y à %H:%M} par {_nom(recu.annule_par)} : "
                  f"{recu.motif_annulation}", st['petit_c'])]
    el.append(Spacer(1, 2.5 * mm))

    def ligne(libelle, valeur, gras=False):
        return [_p(libelle, st['lb']), _p(valeur, st['db'] if gras else st['d'])]

    infos = [
        ligne('Date', f"{timezone.localtime(recu.created_at):%d/%m/%Y à %H:%M}"),
        ligne('Caissier', _nom(recu.caissier)),
        ligne('Employé', _nom(recu.user), gras=True),
        ligne('Matricule', recu.user.username),
        ligne('Opération', recu.get_type_display()),
        ligne('Mode', recu.get_mode_display()),
    ]
    if recu.reference:
        infos.append(ligne('Référence', recu.reference))
    el.append(_tableau_cles(infos, largeur, echelle))

    if recu.type == 'regularisation':
        lignes = list(recu.lignes.all())
        el += [Spacer(1, 2 * mm), _p(f"Repas régularisés ({len(lignes)})", st['b']), Spacer(1, 1 * mm)]
        donnees = [[_p(f"{l.date_menu:%d/%m/%Y}", st['n']), _p(l.plat_nom, st['n']), _p(fcfa(l.montant), st['d'])]
                   for l in lignes]
        t = Table(donnees, colWidths=[largeur * .27, largeur * .48, largeur * .25])
        t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), .2 * mm, G200),
                               ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                               ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                               ('TOPPADDING', (0, 0), (-1, -1), .6 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), .8 * mm)]))
        el.append(t)

    montants = []
    if recu.type == 'recharge':
        montants.append(ligne('Montant crédité', _f(recu.montant), gras=True))
    elif recu.type == 'regularisation':
        montants.append(ligne('Total des repas', _f(recu.montant_repas), gras=True))
        if recu.montant_recu is not None:
            montants.append(ligne('Montant reçu', _f(recu.montant_recu)))
        if recu.monnaie:
            montants.append(ligne('Monnaie créditée sur le compte' if recu.monnaie_creditee else 'Monnaie rendue',
                                  _f(recu.monnaie)))
    else:
        montants.append(ligne('Montant remboursé', _f(recu.montant), gras=True))
        if recu.motif:
            montants.append(ligne('Motif', recu.motif))
    montants.append(ligne('Solde du compte après', _f(recu.solde_apres), gras=True))
    el += [Spacer(1, 2 * mm), _tableau_cles(montants, largeur, echelle, filet=True)]

    el += [Spacer(1, 3 * mm), _p(MENTION_NON_FISCAL, ParagraphStyle('nf', parent=st['c'], fontName=_polices()['SB'],
                                                                      textColor=NAVY)),
           _p("Repas non couverts : retenus sur salaire à la clôture du mois.", st['petit_c'])]
    for l in (societe.pied_de_page or '').splitlines():
        if l.strip():
            el.append(_p(l.strip(), st['petit_c']))
    el.append(_p(f"Édité le {timezone.localtime():%d/%m/%Y à %H:%M}", st['petit_c']))
    return el


def _tableau_cles(lignes, largeur, echelle, filet=False):
    t = Table(lignes, colWidths=[largeur * .45, largeur * .55])
    style = [('VALIGN', (0, 0), (-1, -1), 'TOP'),
             ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
             ('TOPPADDING', (0, 0), (-1, -1), .5 * mm * echelle), ('BOTTOMPADDING', (0, 0), (-1, -1), .5 * mm * echelle)]
    if filet:
        style += [('LINEABOVE', (0, 0), (-1, 0), .3 * mm, G300), ('LINEABOVE', (0, -1), (-1, -1), .3 * mm, VERT),
                  ('BACKGROUND', (0, -1), (-1, -1), VERT_F)]
    t.setStyle(TableStyle(style))
    return t


def _document(tampon, taille, marge, recu, societe):
    """Document à un seul cadre sans marges intérieures (la largeur utile est exacte)."""
    cadre = Frame(marge, marge, taille[0] - 2 * marge, taille[1] - 2 * marge,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = BaseDocTemplate(tampon, pagesize=taille, leftMargin=marge, rightMargin=marge, topMargin=marge,
                          bottomMargin=marge, title=f"Reçu {recu.numero}", author=societe.nom or 'Ubifood')
    doc.addPageTemplates([PageTemplate(id='recu', frames=[cadre])])
    return doc


def generer_recu(recu, societe, format_papier='ticket'):
    """PDF (bytes) d'un reçu : format « ticket » (80 mm) ou « a5 »."""
    tampon = BytesIO()
    if format_papier == 'a5':
        marge = 12 * mm
        _document(tampon, A5, marge, recu, societe).build(_contenu_recu(recu, societe, A5[0] - 2 * marge, 1.25))
        return tampon.getvalue()
    # Ticket : largeur 80 mm, hauteur calculée d'après le contenu (une seule page)
    marge = 4 * mm
    largeur = 80 * mm - 2 * marge
    hauteur = sum(e.wrap(largeur, 10000)[1] + e.getSpaceBefore() + e.getSpaceAfter()
                  for e in _contenu_recu(recu, societe, largeur, 1.0))
    taille = (80 * mm, hauteur + 2 * marge + 4 * mm)
    _document(tampon, taille, marge, recu, societe).build(_contenu_recu(recu, societe, largeur, 1.0))
    return tampon.getvalue()


# ══════════════════════════════════════════════════════════════
# Journal de caisse (A4)
# ══════════════════════════════════════════════════════════════

def generer_journal(journal, societe):
    """PDF (bytes) du journal de caisse ; journal : caisse.journal_caisse(...)."""
    st = _styles()
    jour = journal['date_objet']
    meta = _meta([
        ('Journée', f"{jour:%d/%m/%Y}", None),
        ('Caissier', escape(journal['caissier_libelle']), None),
        ('Reçus', str(journal['nb_recus']), None),
        ('Édité le', f"{timezone.localtime():%d/%m/%Y à %H:%M}", None),
    ], st)
    el = [_entete(societe, 'JOURNAL DE CAISSE', f"Compte repas · {jour:%d/%m/%Y}", meta, st,
                  sous_ligne_societe='Caisse de la cantine'), Spacer(1, 4 * mm)]

    el.append(_h2('Totaux par opération', 'reçus valides ; annulés exclus', st))
    donnees = [['Opération', 'Reçus', 'Montant (FCFA)', 'Espèces (FCFA)']]
    for t in journal['par_type']:
        donnees.append([t['libelle'], str(t['nb']), fcfa(t['montant']), fcfa(t['encaissement'])])
    donnees.append(['Solde espèces de la journée', str(journal['nb_valides']), '', fcfa(journal['especes_net'])])
    tab = Table(donnees, colWidths=[UTILE - 110 * mm, 25 * mm, 42 * mm, 43 * mm], repeatRows=1)
    tab.setStyle(TableStyle(_style_tableau(len(donnees), 1)))
    el.append(tab)
    if journal['nb_annules']:
        el += [Spacer(1, 1.5 * mm), _p(f"{journal['nb_annules']} reçu(s) annulé(s) : "
                                       f"{fcfa(journal['montant_annules'])} F, exclus des totaux.", st['petit'])]

    el.append(_h2('Détail des reçus', 'ordre chronologique', st))
    donnees = [['Heure', 'N° reçu', 'Employé (matricule)', 'Opération', 'Caissier', 'Mode', 'Montant', 'Espèces']]
    style = _style_tableau(0, 6, total=False, taille=7.2)
    cel = ParagraphStyle('jc', parent=st['cellule'], fontSize=7.2, leading=9)
    for i, r in enumerate(journal['recus'], start=1):
        annule = r['statut'] == 'annule'
        donnees.append([
            r['heure'], _p(r['numero'], cel),
            _p(f"{r['employe']['nom_prenom']} ({r['employe']['matricule']})", cel),
            _p(r['type_libelle'] + (' — ANNULÉ' if annule else ''), cel),
            _p(r['caissier_nom'], cel), r['mode_libelle'], fcfa(r['montant']), fcfa(r['encaissement']),
        ])
        if annule:
            style.append(('TEXTCOLOR', (0, i), (-1, i), ROUGE))
    if len(donnees) == 1:
        donnees.append(['', '', 'Aucune opération', '', '', '', '', ''])
    tab = Table(donnees, colWidths=[11 * mm, 32 * mm, UTILE - 147 * mm, 27 * mm, 27 * mm, 16 * mm, 17 * mm, 17 * mm],
                repeatRows=1)
    tab.setStyle(TableStyle(style))
    el.append(tab)

    if journal['par_caissier']:
        el.append(_h2('Par caissier', 'reçus valides', st))
        donnees = [['Caissier', 'Reçus', 'Espèces (FCFA)']]
        for c in journal['par_caissier']:
            donnees.append([c['caissier_nom'], str(c['nb']), fcfa(c['encaissement'])])
        tab = Table(donnees, colWidths=[UTILE - 70 * mm, 25 * mm, 45 * mm], repeatRows=1)
        tab.setStyle(TableStyle(_style_tableau(len(donnees), 1, total=False)))
        el.append(tab)

    if journal['clotures']:
        el.append(_h2('Clôtures de caisse du jour', '', st))
        donnees = [['Caissier', 'Théorique', 'Compté', 'Écart', 'Statut']]
        for c in journal['clotures']:
            donnees.append([c['caissier_nom'], fcfa(c['montant_theorique']), fcfa(c['montant_compte']),
                            fcfa(c['ecart']), c['statut_libelle']])
        tab = Table(donnees, colWidths=[UTILE - 120 * mm, 25 * mm, 25 * mm, 20 * mm, 50 * mm], repeatRows=1)
        tab.setStyle(TableStyle(_style_tableau(len(donnees), 1, total=False)))
        el.append(tab)

    el += [Spacer(1, 3 * mm), _p(f"{MENTION_NON_FISCAL}s. Les remboursements du solde sont des sorties d'espèces "
                                 "de la comptabilité.", ParagraphStyle('jn', parent=st['petit'], textColor=G500))]
    tampon = BytesIO()
    doc = _doc(tampon, f"Journal de caisse — {jour:%d/%m/%Y}", societe.nom or 'Ubifood',
               _entete_suite(societe, 'Journal de caisse', f" · {jour:%d/%m/%Y}"))
    doc.build(el, canvasmaker=_canvas(societe, f"Journal de caisse {jour:%d/%m/%Y}"))
    return tampon.getvalue()


# ══════════════════════════════════════════════════════════════
# Mouvements du compte repas d'un employé (comptabilité)
# ══════════════════════════════════════════════════════════════

def _periode(debut, fin):
    if debut and fin:
        return f"du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}"
    if debut:
        return f"depuis le {debut:%d/%m/%Y}"
    if fin:
        return f"jusqu'au {fin:%d/%m/%Y}"
    return "depuis l'ouverture du compte"


def _date_heure(iso):
    return f"{datetime.fromisoformat(iso):%d/%m/%Y %H:%M}"


def generer_mouvements(donnees, societe):
    """PDF (bytes) du grand livre d'un compte ; donnees : caisse.MouvementsCompteView."""
    st = _styles()
    e = donnees['employe']
    periode = _periode(donnees['debut'], donnees['fin'])
    meta = _meta([
        ('Employé', escape(f"{e['nom_prenom']} ({e['matricule']})"), None),
        ('Agence', escape(e['agence'] or '—'), None),
        ('Période', periode, None),
        ('Édité le', f"{timezone.localtime():%d/%m/%Y à %H:%M}", None),
    ], st)
    el = [_entete(societe, 'COMPTE REPAS', f"Mouvements · {e['nom_prenom']} · {periode}", meta, st,
                  sous_ligne_societe='Comptabilité — compte repas prépayé'), Spacer(1, 4 * mm)]

    el.append(_h2('Synthèse', 'mouvements de la période', st))
    t = donnees['totaux']
    synthese = [['Crédits (recharges, recrédits…)', 'Débits (repas, remboursements…)', 'Solde actuel du compte'],
                [_f(t['credits']), _f(t['debits']), _f(donnees['solde'])]]
    tab = Table(synthese, colWidths=[UTILE / 3] * 3)
    tab.setStyle(TableStyle(_style_tableau(2, 0, total=True)))
    el.append(tab)

    el.append(_h2('Détail des mouvements', 'du plus récent au plus ancien', st))
    cel = ParagraphStyle('mv', parent=st['cellule'], fontSize=7.4, leading=9.2)
    lignes = [['Date', 'Type', 'Libellé', 'Reçu', 'Montant', 'Solde après']]
    style = _style_tableau(0, 4, total=False, taille=7.4)
    for i, m in enumerate(donnees['mouvements'], start=1):
        lignes.append([_date_heure(m['date']), _p(escape(m['type_libelle']), cel), _p(escape(m['libelle'] or ''), cel),
                       _p(escape(m['recu_numero'] or ''), cel),
                       f"{'+' if m['montant'] > 0 else ''}{fcfa(m['montant'])}", fcfa(m['solde_apres'])])
        if m['montant'] < 0:
            style.append(('TEXTCOLOR', (4, i), (4, i), ROUGE))
    if len(lignes) == 1:
        lignes.append(['', '', 'Aucun mouvement sur la période', '', '', ''])
    tab = Table(lignes, colWidths=[27 * mm, 30 * mm, UTILE - 135 * mm, 32 * mm, 23 * mm, 23 * mm], repeatRows=1)
    tab.setStyle(TableStyle(style))
    el.append(tab)
    el += [Spacer(1, 3 * mm), _p("Montants en francs CFA : + crédit du compte, − débit. Le solde après est celui "
                                 "du compte juste après le mouvement.", ParagraphStyle('mn', parent=st['petit'], textColor=G500))]
    tampon = BytesIO()
    titre = f"Mouvements du compte repas — {e['nom_prenom']}"
    doc = _doc(tampon, titre, societe.nom or 'Ubifood', _entete_suite(societe, 'Compte repas', f" · {e['nom_prenom']}"))
    doc.build(el, canvasmaker=_canvas(societe, f"Compte repas {e['matricule']}"))
    return tampon.getvalue()


def _xlsx_cellule(ref, valeur, style=0):
    if valeur is None or valeur == '':
        return f'<c r="{ref}" s="{style}"/>'
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
        return f'<c r="{ref}" s="{style}"><v>{valeur}</v></c>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(valeur))}</t></is></c>'


def _colonne(i):
    lettres = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        lettres = chr(65 + r) + lettres
    return lettres


def classeur_xlsx(nom_feuille, lignes, largeurs, lignes_titre=()):
    """
    Classeur Excel minimal (une feuille) : lignes = listes de valeurs (texte ou
    nombre). Styles : 1 = gras (titres, en-têtes), 2 = nombre « # ##0 ».
    lignes_titre : indices (0-based) des lignes en gras.
    """
    rangs = []
    for i, ligne in enumerate(lignes, start=1):
        cellules = ''.join(
            _xlsx_cellule(f"{_colonne(j)}{i}", v,
                          1 if (i - 1) in lignes_titre else (2 if isinstance(v, (int, float)) else 0))
            for j, v in enumerate(ligne))
        rangs.append(f'<row r="{i}">{cellules}</row>')
    cols = ''.join(f'<col min="{j}" max="{j}" width="{w}" customWidth="1"/>' for j, w in enumerate(largeurs, start=1))
    feuille = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
               f'<cols>{cols}</cols><sheetData>{"".join(rangs)}</sheetData></worksheet>')
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'
              '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
              '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
              '<fills count="2"><fill><patternFill patternType="none"/></fill>'
              '<fill><patternFill patternType="gray125"/></fill></fills>'
              '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
              '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
              '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
              '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
              '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
              '</styleSheet>')
    nom = escape(nom_feuille[:31])
    fichiers = {
        '[Content_Types].xml': (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>'),
        '_rels/.rels': (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/></Relationships>'),
        'xl/workbook.xml': (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{nom}" sheetId="1" r:id="rId1"/></sheets></workbook>'),
        'xl/_rels/workbook.xml.rels': (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            'Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
            'Target="styles.xml"/></Relationships>'),
        'xl/styles.xml': styles,
        'xl/worksheets/sheet1.xml': feuille,
    }
    tampon = BytesIO()
    with zipfile.ZipFile(tampon, 'w', zipfile.ZIP_DEFLATED) as z:
        for nom_fichier, contenu in fichiers.items():
            z.writestr(nom_fichier, contenu)
    return tampon.getvalue()


def generer_mouvements_xlsx(donnees):
    """Excel (bytes) des mouvements d'un compte : mêmes colonnes que le PDF."""
    e = donnees['employe']
    t = donnees['totaux']
    lignes = [
        [f"Mouvements du compte repas — {e['nom_prenom']} ({e['matricule']})"],
        [f"Agence : {e['agence'] or '—'} · Période : {_periode(donnees['debut'], donnees['fin'])}"],
        ['Crédits', float(t['credits']), 'Débits', float(t['debits']), 'Solde actuel', float(donnees['solde'])],
        [],
        ['Date', 'Type', 'Libellé', 'Reçu', 'Montant (F)', 'Solde après (F)'],
    ]
    for m in donnees['mouvements']:
        lignes.append([_date_heure(m['date']), m['type_libelle'], m['libelle'] or '', m['recu_numero'] or '',
                       m['montant'], m['solde_apres']])
    return classeur_xlsx('Mouvements', lignes, [18, 22, 48, 20, 14, 16], lignes_titre=(0, 4))
