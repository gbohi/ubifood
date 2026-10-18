// lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'core/services/notification_service.dart';
import 'shared/theme/app_theme.dart';
import 'shared/providers/app_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/main_shell.dart';
import 'features/splash/splash_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/notifications/notification_screen.dart';

// ✅ NavigatorKey global — permet de naviguer sans contexte
// et évite de recréer l'app quand on tape sur une notification
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await initializeDateFormatting('fr_FR', null);

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Un échec des notifications (permissions, services Google absents…)
  // ne doit pas empêcher l'application de démarrer
  try {
    await notificationService.init();
  } catch (e) {
    debugPrint('⚠️ Notifications indisponibles : $e');
  }

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const CantineApp());
}

class CantineApp extends StatelessWidget {
  const CantineApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => MenuProvider()),
        ChangeNotifierProvider(create: (_) => CommandeProvider()),
        ChangeNotifierProvider(create: (_) => RetraitProvider()),
        ChangeNotifierProvider(create: (_) => FacturationProvider()),
        ChangeNotifierProvider(create: (_) => NotificationProvider()),
        ChangeNotifierProxyProvider<AuthProvider, AllergieProvider>(
          create: (_) => AllergieProvider(),
          update: (_, auth, allergies) {
            allergies?.setAuthUser(auth.user);
            return allergies ?? AllergieProvider();
          },
        ),
      ],
      child: Consumer<ThemeProvider>(
        builder: (_, theme, __) => MaterialApp(
          // ✅ NavigatorKey global — réutilise l'instance existante
          // au lieu d'en créer une nouvelle quand on tape une notification
          navigatorKey: navigatorKey,
          title: 'UbiFood',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: theme.mode,
          home: const _AuthGate(),
        ),
      ),
    );
  }
}

// ── Auth gate ──────────────────────────────────────────────────
class _AuthGate extends StatefulWidget {
  const _AuthGate();
  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  bool _checking = true;
  bool _showOnboarding = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();

    // ✅ Tap sur notification (background/terminée)
    // → utilise navigatorKey pour naviguer sans recréer l'app
    notificationService.onMessageTap = (message) {
      if (!mounted) return;
      // Pas encore connecté (app lancée par la notification : la session est
      // en cours de restauration) → ouverture dès la connexion.
      // Avant : le tap était ignoré et l'écran ne s'ouvrait jamais.
      if (!context.read<AuthProvider>().isLoggedIn) {
        _notifEnAttente = true;
        return;
      }
      _ouvrirNotifications();
    };
  }

  /// Notification tapée avant que la session soit restaurée
  bool _notifEnAttente = false;
  bool _notifOuvertes = false;

  void _ouvrirNotifications() {
    _notifEnAttente = false;
    // Déjà affiché : pas de second écran par-dessus
    if (_notifOuvertes) return;
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    // La notification vient d'arriver : liste à jour sans attendre le polling
    context.read<NotificationProvider>().charger();
    _notifOuvertes = true;
    nav
        .push(MaterialPageRoute(builder: (_) => const NotificationScreen()))
        .whenComplete(() => _notifOuvertes = false);
  }

  bool _pollingActif = false;
  bool _horsLigne = false;

  Future<void> _checkAuth() async {
    // restoreSession() recharge le profil si un jeton est stocké :
    // l'utilisateur reste connecté entre deux lancements de l'app.
    final results = await Future.wait([
      context.read<AuthProvider>().restoreSession(),
      onboardingDejaVu(),
      Future.delayed(const Duration(milliseconds: 1500)),
    ]);
    final etat = results[0] as EtatSession;
    final onbDone = results[1] as bool;

    if (etat == EtatSession.connecte) {
      // Sans attendre : l'envoi du token FCM ne doit pas retarder l'accueil
      notificationService.registerTokenAfterLogin();
    } else if (etat == EtatSession.deconnecte) {
      // Plus de session : la notification tapée ne concerne pas le
      // prochain compte qui se connectera
      _notifEnAttente = false;
    }

    if (!mounted) return;
    setState(() {
      _checking = false;
      _horsLigne = etat == EtatSession.horsLigne;
      _showOnboarding = !onbDone && etat == EtatSession.deconnecte;
    });
  }

  /// Déconnexion ou session expirée : fermer les écrans ouverts par-dessus
  /// et vider les données du compte (téléphone partagé).
  void _apresDeconnexion() {
    navigatorKey.currentState?.popUntil((r) => r.isFirst);
    context.read<NotificationProvider>().stopPolling();
    context.read<MenuProvider>().reset();
    context.read<CommandeProvider>().reset();
    context.read<RetraitProvider>().reset();
    context.read<FacturationProvider>().reset();
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) return const SplashScreen();

    if (_horsLigne) {
      return _HorsLigneScreen(onReessayer: () {
        setState(() {
          _checking = true;
          _horsLigne = false;
        });
        _checkAuth();
      });
    }

    if (_showOnboarding) {
      return OnboardingScreen(
        onTermine: () => setState(() => _showOnboarding = false),
      );
    }

    return Consumer<AuthProvider>(
      builder: (_, auth, __) {
        // Démarre / arrête le rafraîchissement des notifications une seule
        // fois par changement d'état de connexion (avant : à chaque rebuild).
        if (auth.isLoggedIn != _pollingActif) {
          _pollingActif = auth.isLoggedIn;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            if (auth.isLoggedIn) {
              context.read<NotificationProvider>().startPolling();
              if (_notifEnAttente) _ouvrirNotifications();
            } else {
              _apresDeconnexion();
            }
          });
        }
        return auth.isLoggedIn ? const MainShell() : const LoginScreen();
      },
    );
  }
}


/// Serveur injoignable au démarrage alors qu'une session existe :
/// on propose de réessayer au lieu de déconnecter l'utilisateur.
class _HorsLigneScreen extends StatelessWidget {
  final VoidCallback onReessayer;
  const _HorsLigneScreen({required this.onReessayer});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.wifi_off_rounded, size: 56, color: Colors.grey),
              const SizedBox(height: 16),
              Text('Serveur injoignable',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                  'Vérifiez votre connexion internet puis réessayez. '
                  'Vous restez connecté.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onReessayer,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Réessayer'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
