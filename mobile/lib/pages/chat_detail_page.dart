import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 单聊详情：实时消息 + 助理自动应答
class ChatDetailPage extends StatefulWidget {
  final AgentView peer;
  const ChatDetailPage({super.key, required this.peer});

  @override
  State<ChatDetailPage> createState() => _ChatDetailPageState();
}

class _ChatDetailPageState extends State<ChatDetailPage> {
  final _items = <MessageView>[];
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  late SessionState _session;
  VoidCallback? _unsub;
  bool _sending = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _session = context.read<SessionState>();
    _load();
    _unsub = _session.subscribeMessages((msg) {
      final me = _session.agentSlug;
      final peerSlug = widget.peer.slug;
      final relevant =
          (msg.fromAgent == peerSlug && msg.toAgent == me) ||
          (msg.fromAgent == me && msg.toAgent == peerSlug);
      if (!relevant) return;
      if (_items.any((m) => m.id == msg.id)) return;
      setState(() => _items.add(msg));
      _scrollBottom();
    });
  }

  @override
  void dispose() {
    _unsub?.call();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final msgs = await MessagesApi.history(widget.peer.slug);
      if (!mounted) return;
      setState(() { _items..clear()..addAll(msgs); _loading = false; });
      _scrollBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showToast(context, e.toString(), error: true);
    }
  }

  void _scrollBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    final me = _session.agentSlug;
    if (text.isEmpty || _sending || me == null) return;
    setState(() => _sending = true);
    try {
      final r = await MessagesApi.send(me, widget.peer.slug, text);
      if (!mounted) return;
      if (!_items.any((m) => m.id == r.message.id)) setState(() => _items.add(r.message));
      if (r.bot != null && !_items.any((m) => m.id == r.bot!.id)) {
        setState(() => _items.add(r.bot!));
      }
      _ctrl.clear();
      _scrollBottom();
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = _session.agentSlug;
    return Scaffold(
      appBar: AppBar(
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          AgentAvatar(emoji: widget.peer.emoji, size: 30),
          const SizedBox(width: 8),
          Text(widget.peer.name, style: const TextStyle(fontSize: 16)),
        ]),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? const EmptyView(emoji: '💬', text: '说点什么吧 —— 对方的助理可能自动应答')
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _items.length,
                        itemBuilder: (_, i) {
                          final m = _items[i];
                          final mine = m.fromAgent == me;
                          return _bubble(m, mine);
                        },
                      ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    maxLines: 1,
                    onSubmitted: (_) => _send(),
                    decoration: const InputDecoration(hintText: '发消息…'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : _send,
                  icon: _sending
                      ? const SizedBox(width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send, size: 19),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(MessageView m, bool mine) {
    final isBot = m.type == 'bot';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.76),
        decoration: BoxDecoration(
          color: mine ? const Color(0xFF4F6BFF) : (isBot ? const Color(0xFFEEF7F4) : Colors.white),
          borderRadius: BorderRadius.circular(12),
          border: mine ? null : Border.all(color: const Color(0xFFE6EAF2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && isBot)
              const Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Text('🤖 自动应答', style: TextStyle(fontSize: 10, color: Color(0xFF178A50))),
              ),
            Text(m.text,
                style: TextStyle(
                    fontSize: 13.5,
                    color: mine ? Colors.white : const Color(0xFF16213A))),
            const SizedBox(height: 2),
            Text(fmtTime(m.createdAt),
                style: TextStyle(fontSize: 9, color: mine ? Colors.white70 : const Color(0xFF98A1B5))),
          ],
        ),
      ),
    );
  }
}
