// lib/shared/models/compte_repas_models.dart
//
// Compte repas prépayé de l'employé (routes /compte-repas/…) : solde,
// repas du mois et leur mode de paiement, mouvements du compte, reçus de
// caisse. Montants en francs CFA.

import 'package:flutter/material.dart';
import '../../core/widgets/common_widgets.dart' show TonPastille;

Map<String, dynamic> _objet(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};

List<Map<String, dynamic>> _liste(dynamic v) =>
    v is List ? [for (final e in v) _objet(e)] : const [];

double _montant(dynamic v) => v is num ? v.toDouble() : 0;

double? _montantOuNull(dynamic v) => v is num ? v.toDouble() : null;

int _entier(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

int? _entierOuNull(dynamic v) => v is num ? v.toInt() : int.tryParse('$v');

String _texte(dynamic v) => v?.toString() ?? '';

/// Date seule (« 2026-11-06 ») ou horodatage ISO, en heure locale.
DateTime? _date(dynamic v) {
  final d = DateTime.tryParse(_texte(v));
  return d?.isUtc == true ? d!.toLocal() : d;
}

// ══════════════════════════════════════════════════════════════
// STATUT DE PAIEMENT D'UN REPAS
// ══════════════════════════════════════════════════════════════

enum StatutPaiementRepas {
  debiteCompte('debite_compte', 'Compte repas'),
  retenuePrevue('retenue_prevue', 'Retenue sur salaire'),
  retenue('retenue', 'Retenu sur salaire'),
  payeCaisse('paye_caisse', 'Payé à la caisse');

  final String code;

  /// Libellé court (pastille) ; le libellé long vient de l'API
  final String libelle;
  const StatutPaiementRepas(this.code, this.libelle);

  static StatutPaiementRepas depuis(String code) =>
      values.firstWhere((s) => s.code == code,
          orElse: () => StatutPaiementRepas.retenuePrevue);

  /// Mode de règlement d'une ligne de facturation (`reglement`) : compte,
  /// caisse, retenue ; null : pas encore réglé (retenue à la clôture).
  static StatutPaiementRepas? depuisReglement(String? reglement) =>
      switch (reglement) {
        'compte' => StatutPaiementRepas.debiteCompte,
        'caisse' => StatutPaiementRepas.payeCaisse,
        'retenue' => StatutPaiementRepas.retenue,
        _ => null,
      };

  TonPastille get ton => switch (this) {
        StatutPaiementRepas.debiteCompte => TonPastille.vert,
        StatutPaiementRepas.retenuePrevue => TonPastille.or,
        StatutPaiementRepas.retenue => TonPastille.gris,
        StatutPaiementRepas.payeCaisse => TonPastille.bleu,
      };

  IconData get icone => switch (this) {
        StatutPaiementRepas.debiteCompte =>
          Icons.account_balance_wallet_outlined,
        StatutPaiementRepas.retenuePrevue => Icons.receipt_long_outlined,
        StatutPaiementRepas.retenue => Icons.badge_outlined,
        StatutPaiementRepas.payeCaisse => Icons.point_of_sale_rounded,
      };
}

// ══════════════════════════════════════════════════════════════
// MODE DE PAIEMENT CHOISI À LA COMMANDE
// ══════════════════════════════════════════════════════════════

/// « compte » : débité du compte repas à la commande ; « retenue » : retenu
/// sur salaire à la clôture du mois.
enum ModePaiementCommande {
  compte('compte', 'Compte repas'),
  retenue('retenue', 'Retenue sur salaire');

  final String code;
  final String libelle;
  const ModePaiementCommande(this.code, this.libelle);

  static ModePaiementCommande? depuis(String? code) => switch (code) {
        'compte' => ModePaiementCommande.compte,
        'retenue' => ModePaiementCommande.retenue,
        _ => null,
      };

  IconData get icone => this == ModePaiementCommande.compte
      ? Icons.account_balance_wallet_outlined
      : Icons.receipt_long_outlined;

  TonPastille get ton =>
      this == ModePaiementCommande.compte ? TonPastille.vert : TonPastille.or;
}

/// GET compte-repas/paiement/?menu=ID : ce que l'écran de commande propose
class InfoPaiement {
  final double solde;
  final double? prix; // null : pas de tarif
  final bool sansTarif;
  final bool comptePossible;
  final String? raisonCompteImpossible;
  final ModePaiementCommande modePrefere;
  final ModePaiementCommande modeParDefaut;

  const InfoPaiement({
    required this.solde,
    required this.prix,
    this.sansTarif = false,
    required this.comptePossible,
    this.raisonCompteImpossible,
    this.modePrefere = ModePaiementCommande.compte,
    this.modeParDefaut = ModePaiementCommande.retenue,
  });

  factory InfoPaiement.fromJson(Map<String, dynamic> j) {
    final raison = _texte(j['raison_compte_impossible']);
    return InfoPaiement(
      solde: _montant(j['solde']),
      prix: _montantOuNull(j['prix']),
      sansTarif: j['sans_tarif'] == true,
      comptePossible: j['compte_possible'] == true,
      raisonCompteImpossible: raison.isEmpty || raison == 'null' ? null : raison,
      modePrefere: ModePaiementCommande.depuis(_texte(j['mode_paiement_prefere'])) ??
          ModePaiementCommande.compte,
      modeParDefaut: ModePaiementCommande.depuis(_texte(j['mode_par_defaut'])) ??
          ModePaiementCommande.retenue,
    );
  }
}

/// Repas du mois et son paiement
class RepasCompte {
  final int commandeId;
  final DateTime? dateMenu;
  final String plat;
  final String agenceMenu;
  final String statutCommande;
  final double? montant; // null : pas de tarif
  final bool sansTarif;
  final StatutPaiementRepas statut;
  final String statutLibelle;

  /// Mode choisi à la commande (null : serveur antérieur)
  final ModePaiementCommande? modePaiement;

  /// Changement de mode encore possible (avant la date limite de commande)
  final bool modeModifiable;

  const RepasCompte({
    required this.commandeId,
    required this.dateMenu,
    required this.plat,
    required this.agenceMenu,
    required this.statutCommande,
    required this.montant,
    required this.sansTarif,
    required this.statut,
    required this.statutLibelle,
    this.modePaiement,
    this.modeModifiable = false,
  });

  factory RepasCompte.fromJson(Map<String, dynamic> j) {
    final statut = StatutPaiementRepas.depuis(_texte(j['statut']));
    final libelle = _texte(j['statut_libelle']);
    return RepasCompte(
      commandeId: _entier(j['commande_id']),
      dateMenu: _date(j['date_menu']),
      plat: _texte(j['plat']),
      agenceMenu: _texte(j['agence_menu']),
      statutCommande: _texte(j['statut_commande']),
      montant: _montantOuNull(j['montant']),
      sansTarif: j['sans_tarif'] == true,
      statut: statut,
      statutLibelle: libelle.isEmpty ? statut.libelle : libelle,
      modePaiement: ModePaiementCommande.depuis(_texte(j['mode_paiement'])),
      modeModifiable: j['mode_modifiable'] == true,
    );
  }

  bool get retire => statutCommande == 'retiree';
}

/// Nombre de repas et montant d'un statut
class TotalPaiement {
  final int nb;
  final double montant;
  final String libelle;
  const TotalPaiement({this.nb = 0, this.montant = 0, this.libelle = ''});

  factory TotalPaiement.fromJson(Map<String, dynamic> j) => TotalPaiement(
      nb: _entier(j['nb']),
      montant: _montant(j['montant']),
      libelle: _texte(j['libelle']));
}

// ══════════════════════════════════════════════════════════════
// SITUATION DU MOIS (GET compte-repas/?annee=&mois=)
// ══════════════════════════════════════════════════════════════

class CompteRepas {
  final int annee;
  final int mois;
  final bool moisCloture;
  final double solde;
  final List<RepasCompte> repas;
  final Map<String, TotalPaiement> totaux;
  final double restePrevu;
  final String mentionReste;
  final List<MouvementCompte> derniersMouvements;

  /// Mode proposé par défaut à la commande (profil)
  final ModePaiementCommande modePaiementPrefere;

  const CompteRepas({
    required this.annee,
    required this.mois,
    required this.moisCloture,
    required this.solde,
    required this.repas,
    required this.totaux,
    required this.restePrevu,
    required this.mentionReste,
    required this.derniersMouvements,
    this.modePaiementPrefere = ModePaiementCommande.compte,
  });

  factory CompteRepas.fromJson(Map<String, dynamic> j) {
    final t = _objet(j['totaux']);
    return CompteRepas(
      annee: _entier(j['annee']),
      mois: _entier(j['mois']),
      moisCloture: j['mois_cloture'] == true,
      solde: _montant(j['solde']),
      repas: [for (final r in _liste(j['repas'])) RepasCompte.fromJson(r)],
      totaux: {
        for (final e in t.entries)
          e.key: TotalPaiement.fromJson(_objet(e.value))
      },
      restePrevu: _montant(j['reste_a_payer_prevu']),
      mentionReste: _texte(j['mention_reste']),
      derniersMouvements: [
        for (final m in _liste(j['derniers_mouvements']))
          MouvementCompte.fromJson(m)
      ],
      modePaiementPrefere:
          ModePaiementCommande.depuis(_texte(j['mode_paiement_prefere'])) ??
              ModePaiementCommande.compte,
    );
  }

  TotalPaiement total(String cle) => totaux[cle] ?? const TotalPaiement();
  TotalPaiement get consomme => total('consomme');
  TotalPaiement get debiteCompte => total('debite_compte');
  TotalPaiement get payeCaisse => total('paye_caisse');
  TotalPaiement get retenue => total('retenue');

  /// Repas en retenue sur salaire, retenus à la clôture du mois
  TotalPaiement get retenuePrevue => total('retenue_prevue');
}

/// Ligne « reste à payer » du mois : (texte, détail, ton)
({String texte, String detail, TonPastille ton}) resteAPayer(
    CompteRepas c, String Function(double) fmt) {
  if (c.moisCloture) {
    final r = c.retenue.montant;
    return r > 0
        ? (
            texte: 'Retenu sur salaire : ${fmt(r)}',
            detail: 'Mois clôturé : montants définitifs.',
            ton: TonPastille.gris
          )
        : (
            texte: 'Aucune retenue sur salaire',
            detail: 'Mois clôturé : tous vos repas sont payés.',
            ton: TonPastille.vert
          );
  }
  if (c.restePrevu > 0) {
    return (
      texte:
          'Reste à payer prévu à la clôture : ${fmt(c.restePrevu)} (retenue sur salaire)',
      detail: 'Repas en retenue sur salaire. Pour payer un repas par votre '
          'compte, rechargez-le à la caisse puis changez le mode de paiement '
          'avant la date limite de commande.',
      ton: TonPastille.or
    );
  }
  return (
    texte: 'Reste à payer prévu à la clôture : ${fmt(0)}',
    detail: 'Aucun repas en retenue sur salaire ce mois-ci.',
    ton: TonPastille.vert
  );
}

// ══════════════════════════════════════════════════════════════
// MOUVEMENTS DU COMPTE
// ══════════════════════════════════════════════════════════════

enum TypeMouvement {
  recharge('recharge', 'Recharge'),
  debitRepas('debit_repas', 'Repas débité'),
  recredit('recredit', 'Repas recrédité'),
  regularisation('regularisation', 'Monnaie de régularisation créditée'),
  remboursement('remboursement', 'Remboursement du solde'),
  annulation('annulation', "Annulation d'un reçu"),
  autre('', 'Mouvement');

  final String code;
  final String libelle;
  const TypeMouvement(this.code, this.libelle);

  static TypeMouvement depuis(String code) => values
      .firstWhere((t) => t.code == code, orElse: () => TypeMouvement.autre);

  IconData get icone => switch (this) {
        TypeMouvement.recharge => Icons.add_card_rounded,
        TypeMouvement.debitRepas => Icons.restaurant_rounded,
        TypeMouvement.recredit => Icons.undo_rounded,
        TypeMouvement.regularisation => Icons.savings_outlined,
        TypeMouvement.remboursement => Icons.payments_outlined,
        TypeMouvement.annulation => Icons.block_rounded,
        TypeMouvement.autre => Icons.swap_vert_rounded,
      };
}

class MouvementCompte {
  final int id;
  final TypeMouvement type;
  final String typeLibelle;

  /// Signé : + crédit, − débit
  final double montant;
  final double soldeApres;
  final String libelle;
  final int? commandeId;
  final int? recuId;
  final String? recuNumero;
  final DateTime? date;

  const MouvementCompte({
    required this.id,
    required this.type,
    required this.typeLibelle,
    required this.montant,
    required this.soldeApres,
    required this.libelle,
    this.commandeId,
    this.recuId,
    this.recuNumero,
    this.date,
  });

  factory MouvementCompte.fromJson(Map<String, dynamic> j) {
    final type = TypeMouvement.depuis(_texte(j['type']));
    final libelleType = _texte(j['type_libelle']);
    final numero = _texte(j['recu_numero']);
    return MouvementCompte(
      id: _entier(j['id']),
      type: type,
      typeLibelle: libelleType.isEmpty ? type.libelle : libelleType,
      montant: _montant(j['montant']),
      soldeApres: _montant(j['solde_apres']),
      libelle: _texte(j['libelle']),
      commandeId: _entierOuNull(j['commande_id']),
      recuId: _entierOuNull(j['recu_id']),
      recuNumero: numero.isEmpty ? null : numero,
      date: _date(j['date']),
    );
  }

  bool get credit => montant > 0;
}

/// Mouvements groupés par jour (ordre conservé : du plus récent)
List<(DateTime, List<MouvementCompte>)> mouvementsParJour(
    List<MouvementCompte> mouvements) {
  final groupes = <(DateTime, List<MouvementCompte>)>[];
  for (final m in mouvements) {
    final d = m.date;
    final jour = d == null ? DateTime(0) : DateTime(d.year, d.month, d.day);
    if (groupes.isEmpty || groupes.last.$1 != jour) {
      groupes.add((jour, [m]));
    } else {
      groupes.last.$2.add(m);
    }
  }
  return groupes;
}

// ══════════════════════════════════════════════════════════════
// REÇUS DE CAISSE
// ══════════════════════════════════════════════════════════════

class LigneRecu {
  final int commandeId;
  final DateTime? dateMenu;
  final String plat;
  final double montant;
  const LigneRecu(
      {required this.commandeId,
      required this.dateMenu,
      required this.plat,
      required this.montant});

  factory LigneRecu.fromJson(Map<String, dynamic> j) => LigneRecu(
      commandeId: _entier(j['commande_id']),
      dateMenu: _date(j['date_menu']),
      plat: _texte(j['plat']),
      montant: _montant(j['montant']));
}

class RecuCaisse {
  final int id;
  final String numero;

  /// recharge · regularisation · remboursement
  final String type;
  final String typeLibelle;

  /// valide · annule
  final String statut;
  final String statutLibelle;
  final DateTime? date;
  final String caissierNom;
  final String mode;
  final String modeLibelle;
  final double montant;
  final double montantRepas;
  final double? montantRecu;
  final double monnaie;
  final bool monnaieCreditee;
  final double soldeAvant;
  final double soldeApres;
  final String motif;
  final String? annuleParNom;
  final DateTime? annuleLe;
  final String motifAnnulation;
  final List<LigneRecu> lignes;

  const RecuCaisse({
    required this.id,
    required this.numero,
    required this.type,
    required this.typeLibelle,
    required this.statut,
    required this.statutLibelle,
    required this.date,
    required this.caissierNom,
    required this.mode,
    required this.modeLibelle,
    required this.montant,
    required this.montantRepas,
    required this.montantRecu,
    required this.monnaie,
    required this.monnaieCreditee,
    required this.soldeAvant,
    required this.soldeApres,
    required this.motif,
    required this.annuleParNom,
    required this.annuleLe,
    required this.motifAnnulation,
    required this.lignes,
  });

  factory RecuCaisse.fromJson(Map<String, dynamic> j) {
    final type = _texte(j['type']);
    final statut = _texte(j['statut']);
    final mode = _texte(j['mode']);
    String ou(String v, String defaut) => v.isEmpty ? defaut : v;
    final annulePar = _texte(j['annule_par_nom']);
    return RecuCaisse(
      id: _entier(j['id']),
      numero: _texte(j['numero']),
      type: type,
      typeLibelle: ou(
          _texte(j['type_libelle']),
          switch (type) {
            'recharge' => 'Recharge du compte',
            'regularisation' => 'Régularisation du mois',
            'remboursement' => 'Remboursement du solde',
            _ => 'Reçu',
          }),
      statut: statut,
      statutLibelle: ou(_texte(j['statut_libelle']),
          statut == 'annule' ? 'Annulé' : 'Valide'),
      date: _date(j['date']),
      caissierNom: _texte(j['caissier_nom']),
      mode: mode,
      modeLibelle: ou(_texte(j['mode_libelle']),
          mode == 'mobile_money' ? 'Mobile Money' : 'Espèces'),
      montant: _montant(j['montant']),
      montantRepas: _montant(j['montant_repas']),
      montantRecu: _montantOuNull(j['montant_recu']),
      monnaie: _montant(j['monnaie']),
      monnaieCreditee: j['monnaie_creditee'] == true,
      soldeAvant: _montant(j['solde_avant']),
      soldeApres: _montant(j['solde_apres']),
      motif: _texte(j['motif']),
      annuleParNom: annulePar.isEmpty ? null : annulePar,
      annuleLe: _date(j['annule_le']),
      motifAnnulation: _texte(j['motif_annulation']),
      lignes: [for (final l in _liste(j['lignes'])) LigneRecu.fromJson(l)],
    );
  }

  bool get annule => statut == 'annule';

  /// Effet sur le compte repas : + crédit (recharge, monnaie créditée),
  /// − débit (remboursement) ; 0 : régularisation sans monnaie créditée.
  double get effetSurCompte => soldeApres - soldeAvant;
}

/// Page d'une liste paginée DRF (count, next, results)
class PageCompte<T> {
  final int count;
  final bool suivante;
  final List<T> resultats;
  const PageCompte(
      {required this.count, required this.suivante, required this.resultats});

  factory PageCompte.fromJson(
      dynamic data, T Function(Map<String, dynamic>) lire) {
    // Liste simple (sans pagination) acceptée aussi
    if (data is List) {
      final r = [for (final e in _liste(data)) lire(e)];
      return PageCompte(count: r.length, suivante: false, resultats: r);
    }
    final j = _objet(data);
    final r = [for (final e in _liste(j['results'])) lire(e)];
    return PageCompte(
        count: j['count'] is num ? _entier(j['count']) : r.length,
        suivante: j['next'] != null,
        resultats: r);
  }
}
