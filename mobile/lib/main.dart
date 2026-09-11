import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/session.dart';
import 'pages/home_shell.dart';
import 'pages/login_page.dart';
import 'pages/bind_page.dart';

void main() {
  runApp(const AgentNexusApp());
}

const brandColor = Color(0xFF4F6BFF);

class AgentNexusApp extends StatelessWidget {
  const AgentNexusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SessionState(),
      child: MaterialApp(
        title: 'AgentNexus',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: brandColor),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFF6F8FC),
          appBarTheme: const AppBarTheme(
            backgroundColor: Colors.white,
            foregroundColor: Color(0xFF16213A),
            elevation: 0.5,
            centerTitle: true,
          ),
          cardTheme: const CardThemeData(
            color: Colors.white,
            elevation: 0.4,
            margin: EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFFFBFCFE),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFE6EAF2)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFFE6EAF2)),
            ),
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          ),
        ),
        home: const _EntryGate(),
      ),
    );
  }
}

/// 入口分流：未绑定 Agent → 绑定页（可注册/登录）；已绑定 → 主界面
class _EntryGate extends StatelessWidget {
  const _EntryGate();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionState>();
    if (!session.ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!session.hasAgentCredential) {
      return const BindPage();
    }
    return const HomeShell();
  }
}
