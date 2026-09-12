import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// 本地凭据存储：Agent（slug+secret）与主人令牌。
/// 使用 SharedPreferences（演示级）；生产可替换 flutter_secure_storage。
class CredentialStore {
  CredentialStore._();
  static final CredentialStore instance = CredentialStore._();

  static const _kSlug = 'agent.slug';
  static const _kSecret = 'agent.secret';
  static const _kOwnerToken = 'owner.token';
  static const _kOwnerProfile = 'owner.profile';
  static const _kBaseUrl = 'app.baseUrl';

  late SharedPreferences _prefs;
  bool _ready = false;

  Future<void> ensure() async {
    if (_ready) return;
    _prefs = await SharedPreferences.getInstance();
    _ready = true;
  }

  // ---- Agent 凭据 ----
  String? get agentSlug => _ready ? _prefs.getString(_kSlug) : null;
  String? get agentSecret => _ready ? _prefs.getString(_kSecret) : null;
  bool get hasAgentCredential =>
      _ready && _prefs.getString(_kSlug) != null && _prefs.getString(_kSecret) != null;

  Future<void> bindAgent(String slug, String secret) async {
    await ensure();
    await _prefs.setString(_kSlug, slug);
    await _prefs.setString(_kSecret, secret);
  }

  Future<void> unbindAgent() async {
    await ensure();
    await _prefs.remove(_kSlug);
    await _prefs.remove(_kSecret);
  }

  // ---- 主人令牌 ----
  String? get ownerToken => _ready ? _prefs.getString(_kOwnerToken) : null;

  Future<void> setOwnerToken(String token) async {
    await ensure();
    await _prefs.setString(_kOwnerToken, token);
  }

  Future<void> clearOwnerToken() async {
    await ensure();
    await _prefs.remove(_kOwnerToken);
    await _prefs.remove(_kOwnerProfile);
  }

  // ---- 主人资料缓存（App 重启后「我的」页不丢失显示） ----
  OwnerProfile? get cachedOwnerProfile => OwnerProfile.fromCacheJson(
      _ready ? _prefs.getString(_kOwnerProfile) : null);

  Future<void> setOwnerProfile(OwnerProfile profile) async {
    await ensure();
    await _prefs.setString(_kOwnerProfile, jsonEncode(profile.toJson()));
  }

  // ---- 服务地址 ----
  String get baseUrl {
    if (!_ready) return '';
    final v = _prefs.getString(_kBaseUrl);
    return (v == null || v.isEmpty) ? _default : v;
  }

  static const String _default =
      'https://0192ec810ee94e74b0aad99819f20557.app.workbuddy.link';

  Future<void> setBaseUrl(String url) async {
    await ensure();
    await _prefs.setString(_kBaseUrl, url.trim());
  }
}

/// 主人资料（来自 /api/auth/me 与一体化注册响应）
class OwnerProfile {
  final String id;
  final String name;
  final String org;
  final String? title;
  final String? email;
  final String role;

  OwnerProfile({
    required this.id,
    required this.name,
    required this.org,
    this.title,
    this.email,
    required this.role,
  });

  factory OwnerProfile.fromJson(Map<String, dynamic> j) => OwnerProfile(
        id: j['id'] as String,
        name: j['name'] as String,
        org: j['org'] as String,
        title: j['title'] as String?,
        email: j['email'] as String?,
        role: j['role'] as String,
      );

  Map<String, dynamic> toJson() => {
        'id': id, 'name': name, 'org': org, 'title': title, 'email': email, 'role': role,
      };

  /// 令牌刷新场景：从本地缓存恢复
  static OwnerProfile? fromCacheJson(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      return OwnerProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}
