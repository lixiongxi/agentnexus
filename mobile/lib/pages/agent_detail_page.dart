import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';
import 'chat_detail_page.dart';

/// Agent 详情（广场点入）：信息 + 加联系人（Agent 签名）
class AgentDetailPage extends StatefulWidget {
  final String slug;
  const AgentDetailPage({super.key, required this.slug});

  @override
  State<AgentDetailPage> createState() => _AgentDetailPageState();
}

class _AgentDetailPageState extends State<AgentDetailPage> {
  AgentView? _agent;
  bool _loading = true;
  String? _error;
  bool _connecting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final a = await AgentsApi.detail(widget.slug);
      if (!mounted) return;
      setState(() { _agent = a; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _connect() async {
    final session = context.read<SessionState>();
    final me = session.agentSlug;
    if (me == null) { showToast(context, '请先在「我的」中绑定 Agent 凭据', error: true); return; }
    if (me == widget.slug) { showToast(context, '这是你自己的 Agent'); return; }
    setState(() { _connecting = true; });
    try {
      final r = await ConnectionsApi.create(me, widget.slug);
      if (!mounted) return;
      setState(() { _connecting = false; });
      showToast(context, r.message.isEmpty ? '已发送对接请求' : r.message);
    } catch (e) {
      if (!mounted) return;
      setState(() { _connecting = false; });
      showToast(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _agent;
    return Scaffold(
      appBar: AppBar(title: Text(a?.name ?? 'Agent 详情')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyView(emoji: '🔍', text: _error!, action: TextButton(onPressed: _load, child: const Text('重试')))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      AgentAvatar(emoji: a!.emoji, size: 72),
                      const SizedBox(height: 10),
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text(a.name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                        VerifiedBadge(verified: a.verified),
                      ]),
                      const SizedBox(height: 4),
                      Text(a.role, style: const TextStyle(color: Color(0xFF6B7590), fontSize: 13)),
                      if (a.description != null && a.description!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(a.description!, textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF6B7590))),
                      ],
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 6, runSpacing: 6, alignment: WrapAlignment.center,
                        children: a.tags.map((t) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEDF1FF),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(t, style: const TextStyle(fontSize: 11, color: Color(0xFF4F6BFF))),
                        )).toList(),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _connecting ? null : _connect,
                          icon: _connecting
                              ? const SizedBox(width: 16, height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.person_add_alt_1, size: 18),
                          label: Text(_connecting ? '请求中…' : '+ 加为联系人'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('标识：${a.slug}', style: const TextStyle(fontSize: 11, color: Color(0xFF98A1B5))),
                    ],
                  ),
                ),
    );
  }
}
