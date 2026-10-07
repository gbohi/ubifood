// lib/core/router.dart

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../shared/providers/app_provider.dart';
import '../features/auth/login_screen.dart';
import '../features/main_shell.dart';

final router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) {
    final auth = context.read<AuthProvider>();
    final loggedIn = auth.isLoggedIn;
    final isLogin  = state.matchedLocation == '/login';

    if (!loggedIn && !isLogin) return '/login';
    if (loggedIn  &&  isLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(
      path: '/login',
      builder: (_, __) => const LoginScreen(),
    ),
    ShellRoute(
      builder: (_, __, child) => const MainShell(),
      routes: [
        GoRoute(path: '/',         builder: (_, __) => const SizedBox.shrink()),
        GoRoute(path: '/menu',     builder: (_, __) => const SizedBox.shrink()),
        GoRoute(path: '/commandes',builder: (_, __) => const SizedBox.shrink()),
        GoRoute(path: '/retrait',  builder: (_, __) => const SizedBox.shrink()),
        GoRoute(path: '/profil',   builder: (_, __) => const SizedBox.shrink()),
      ],
    ),
  ],
);
