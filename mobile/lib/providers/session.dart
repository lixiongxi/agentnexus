import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../api/endpoints.dart' show MessagesApi;
import '../core/credentials.dart';
import '../models/models.dart';

/// 会话状态：Agent 绑定、主人登录、WS 实时通道
class SessionState extends ChangeNotifier {
  SessionState() {
    _restore();
  }

  bool ready = false;
  String? agentSlug;
  OwnerProfile? owner;
  String wsStatus = 'offline'; // offline / online

  final _messageControllers = <void Function(MessageView)>[];
  final _groupMessageControllers = <void Function(GroupMessageView)>[];
  WebSocketChannel? _ws;
  Timer? _reconnectTimer;
  int _wsGeneration = 0;

  Future<void> _restore() async {
    await CredentialStore.instance.ensure();
    agentSlug = CredentialStore.instance.agentSlug;
    ready = true;
    notifyListeners();
  }

  bool get hasAgentCredential => CredentialStore.instance.hasAgentCredential;
  bool get hasOwner => owner != null;

  /// 手动触发重建（绑定页等直接改字段后调用）
  void notify() => notifyListeners();

  Future<void> bindAgent(String slug, String secret) async {
    await CredentialStore.instance.bindAgent(slug, secret);
    agentSlug = slug;
    notifyListeners();
  }

  Future<void> unbindAgent() async {
    await CredentialStore.instance.unbindAgent();
    agentSlug = null;
    _closeWs();
    notifyListeners();
  }

  Future<void> setOwner(OwnerProfile? profile) async {
    owner = profile;
    if (profile == null) await CredentialStore.instance.clearOwnerToken();
    notifyListeners();
  }

  // ---------------- 实时通道 ----------------

  /// 打开 WS（page 调用 subscribeXxx 时自动触发）
  Future<void> _ensureWs() async {
    if (_ws != null || !hasAgentCredential) return;
    final gen = ++_wsGeneration;
    try {
      final url = await MessagesApi.realtimeTicket();
      final channel = WebSocketChannel.connect(Uri.parse(url));
      await channel.ready;
      _ws = channel;
      wsStatus = 'online';
      notifyListeners();

      channel.stream.listen(
        (data) {
          try {
            final m = jsonDecode(data as String) as Map<String, dynamic>;
            final type = m['type'] as String?;
            final payload = m['payload'];
            if (payload == null) return;
            if (type == 'message') {
              final msg = MessageView.fromJson(payload as Map<String, dynamic>);
              for (final cb in List.of(_messageControllers)) cb(msg);
            } else if (type == 'group-message') {
              final msg = GroupMessageView.fromJson(payload as Map<String, dynamic>);
              for (final cb in List.of(_groupMessageControllers)) cb(msg);
            }
          } catch (_) {/* 非 JSON 帧忽略 */}
        },
        onDone: () => _onWsClosed(gen),
        onError: (_) => _onWsClosed(gen),
      );
    } catch (_) {
      _onWsClosed(gen);
    }
  }

  void _onWsClosed(int gen) {
    if (gen != _wsGeneration) return;
    _ws = null;
    wsStatus = 'offline';
    notifyListeners();
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      if (hasAgentCredential && _messageControllers.isNotEmpty) _ensureWs();
    });
  }

  void _closeWs() {
    _wsGeneration++;
    _reconnectTimer?.cancel();
    _ws?.sink.close();
    _ws = null;
    wsStatus = 'offline';
  }

  /// 单聊实时订阅
  VoidCallback subscribeMessages(void Function(MessageView) onMessage) {
    _messageControllers.add(onMessage);
    _ensureWs();
    return () => _messageControllers.remove(onMessage);
  }

  /// 群消息实时订阅
  VoidCallback subscribeGroupMessages(void Function(GroupMessageView) onMessage) {
    _groupMessageControllers.add(onMessage);
    _ensureWs();
    return () => _groupMessageControllers.remove(onMessage);
  }

  @override
  void dispose() {
    _closeWs();
    super.dispose();
  }
}

typedef VoidCallback = void Function();
