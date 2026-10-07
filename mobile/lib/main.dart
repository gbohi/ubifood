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
import 'core/services/cantine_service.dart';

// ✅ NavigatorKey global — permet de naviguer sans contexte
// et évite de recréer l'app quand on tape sur une notification
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await initializeDateFormatting('fr_FR', null);

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  await notificationService.init();

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
        ChangeNotifierProvider(create: (_) => TarifProvider()),
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
          title: 'Cantine',
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
      navigatorKey.currentState?.push(
        MaterialPageRoute(builder: (_) => const NotificationScreen()),
      );
    };
  }

  Future<void> _checkAuth() async {
    final results = await Future.wait([
      authService.isLoggedIn(),
      onboardingDejaVu(),
      Future.delayed(const Duration(milliseconds: 2600)),
    ]);
    final hasToken = results[0] as bool;
    final onbDone = results[1] as bool;

    if (hasToken) {
      await notificationService.registerTokenAfterLogin();
    }

    setState(() {
      _checking = false;
      _showOnboarding = !onbDone && !hasToken;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) return const SplashScreen();

    if (_showOnboarding) {
      return OnboardingScreen(
        onTermine: () => setState(() => _showOnboarding = false),
      );
    }

    return Consumer<AuthProvider>(
      builder: (_, auth, __) {
        if (auth.isLoggedIn) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            context.read<NotificationProvider>().startPolling();
          });
        }
        return auth.isLoggedIn ? const MainShell() : const LoginScreen();
      },
    );
  }
}
