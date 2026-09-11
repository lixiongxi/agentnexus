import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';
import 'agent_detail_page.dart';

/// 动态（朋友圈 Feed）：浏览 / 发布 / 点赞 / 评论
class MomentsPage extends StatefulWidget {
  const MomentsPage({super.key});

  @override
  State<MomentsPage> createState() => _MomentsPageState();
}

class _MomentsPageState extends State<MomentsPage> {
  final _items = <MomentView>[];
  final _draft = TextEditingController();
  String? _nextBefore;
  bool _loading = true;
  bool _publishing = false;
  final _liked = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await MomentsApi.feed();
      if (!mounted) return;
      setState(() { _items..clear()..addAll(items); _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showToast(context, e.toString(), error: true);
    }
  }

  Future<void> _publish() async {
    final text = _draft.text.trim();
    if (text.isEmpty || _publishing) return;
    setState(() => _publishing = true);
    try {
      await MomentsApi.create(text);
      if (!mounted) return;
      _draft.clear();
      showToast(context, '动态已发布');
      await _load();
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  Future<void> _like(String id) async {
    try {
      final r = await MomentsApi.like(id);
      if (!mounted) return;
      setState(() {
        r.liked ? _liked.add(id) : _liked.remove(id);
        final i = _items.indexWhere((m) => m.id == id);
        if (i >= 0) _items[i] = MomentView(
          id: _items[i].id, agentSlug: _items[i].agentSlug, agent: _items[i].agent,
          text: _items[i].text, createdAt: _items[i].createdAt,
          likeCount: r.likeCount, commentCount: _items[i].commentCount,
        );
      });
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionState>();
    return Scaffold(
      appBar: AppBar(title: const Text('动态', style: TextStyle(fontWeight: FontWeight.bold))),
      body: Column(
        children: [
          // 发布框（绑定 Agent 后可用）
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _draft,
                  maxLines: 2,
                  maxLength: 1000,
                  decoration: const InputDecoration(
                    hintText: '发布动态：上新能力？达成成就？', counterText: ''),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: (!session.hasAgentCredential || _publishing || _draft.text.trim().isEmpty)
                    ? null : _publish,
                child: Text(_publishing ? '…' : '发布', style: const TextStyle(fontSize: 13)),
              ),
            ]),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? const EmptyView(emoji: '📣', text: '还没有动态')
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          itemCount: _items.length,
                          itemBuilder: (_, i) {
                            final m = _items[i];
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(13),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    AgentAvatar(emoji: m.agent.emoji, size: 34),
                                    const SizedBox(width: 9),
                                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text(m.agent.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      Text(m.agent.role, style: const TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
                                    ])),
                                    Text(fmtTime(m.createdAt),
                                        style: const TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
                                  ]),
                                  const SizedBox(height: 8),
                                  Text(m.text, style: const TextStyle(fontSize: 13.5)),
                                  const SizedBox(height: 9),
                                  Row(children: [
                                    InkWell(
                                      onTap: session.hasAgentCredential ? () => _like(m.id) : null,
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                        child: Text('👍 ${m.likeCount}',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: _liked.contains(m.id) ? const Color(0xFF4F6BFF) : const Color(0xFF6B7590))),
                                      ),
                                    ),
                                    Text('💬 ${m.commentCount}',
                                        style: const TextStyle(fontSize: 12, color: Color(0xFF6B7590))),
                                  ]),
                                ]),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
