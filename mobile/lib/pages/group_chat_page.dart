import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 群聊页：聊天 / 任务 双 tab
class GroupChatPage extends StatefulWidget {
  final String groupId;
  const GroupChatPage({super.key, required this.groupId});

  @override
  State<GroupChatPage> createState() => _GroupChatPageState();
}

class _GroupChatPageState extends State<GroupChatPage> {
  late SessionState _session;
  GroupDetailView? _detail;
  final _messages = <GroupMessageView>[];
  final _tasks = <GroupTaskView>[];
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  VoidCallback? _unsub;
  bool _tab = false; // false=聊天 true=任务
  bool _sending = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _session = context.read<SessionState>();
    _load();
    _unsub = _session.subscribeGroupMessages((msg) {
      if (msg.groupId != widget.groupId) return;
      if (_messages.any((m) => m.id == msg.id)) return;
      setState(() {
        _messages.add(msg);
        if (msg.type == 'bot' && msg.text.contains('TSK-')) _loadTasks();
      });
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
      final d = await GroupsApi.detail(widget.groupId);
      if (!mounted) return;
      setState(() { _detail = d; _messages..clear()..addAll(d.messages); _loading = false; });
      _loadTasks();
      _scrollBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _loadTasks() async {
    try {
      final t = await GroupsApi.tasks(widget.groupId);
      if (!mounted) return;
      setState(() => _tasks..clear()..addAll(t));
    } catch (_) {/* 任务面板静默 */}
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
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final msg = await GroupsApi.send(widget.groupId, text);
      if (!mounted) return;
      if (!_messages.any((m) => m.id == msg.id)) setState(() => _messages.add(msg));
      _ctrl.clear();
      _scrollBottom();
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _flow(GroupTaskView t, String status) async {
    try {
      final updated = await GroupsApi.updateTaskStatus(widget.groupId, t.id, status);
      if (!mounted) return;
      setState(() => _tasks..removeWhere((x) => x.id == t.id)..add(updated));
      showToast(context, '${updated.taskCode} → $status');
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    final me = _session.agentSlug;
    return Scaffold(
      appBar: AppBar(
        title: Column(children: [
          Text(d?.name ?? '群聊', style: const TextStyle(fontSize: 16)),
          if (d != null)
            Text('${d.members.length} 名成员', style: const TextStyle(fontSize: 11)),
        ]),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyView(emoji: '🚫', text: _error!)
              : Column(children: [
                  // tab 切换
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: false, label: Text('💬 聊天')),
                        ButtonSegment(value: true, label: Text('📋 任务')),
                      ],
                      selected: {_tab},
                      onSelectionChanged: (s) => setState(() => _tab = s.first),
                    ),
                  ),
                  Expanded(
                    child: _tab ? _taskPanel(me) : _chatPanel(me),
                  ),
                  if (!_tab) _inputBar(),
                ]),
    );
  }

  Widget _chatPanel(String? me) {
    final d = _detail!;
    if (_messages.isEmpty) {
      return const EmptyView(emoji: '💬', text: '说点什么，@助理 召唤助理，或「@成员 任务：描述」分派任务');
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: _messages.length,
      itemBuilder: (_, i) {
        final m = _messages[i];
        final mine = m.fromAgent == me;
        final member = d.members.where((x) => x.agentSlug == m.fromAgent).firstOrNull;
        final isTaskCard = m.type == 'bot' && m.text.contains('TSK-');
        return Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
            decoration: BoxDecoration(
              color: mine ? const Color(0xFF4F6BFF) : (isTaskCard ? const Color(0xFFEEF4FF) : Colors.white),
              borderRadius: BorderRadius.circular(12),
              border: mine ? null : Border.all(color: const Color(0xFFE6EAF2)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (!mine)
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text('${member?.emoji ?? '🤖'} ${member?.name ?? m.fromAgent}',
                      style: const TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
                ),
              InkWell(
                onTap: isTaskCard ? () => setState(() => _tab = true) : null,
                child: Text(m.text,
                    style: TextStyle(fontSize: 13.5, color: mine ? Colors.white : const Color(0xFF16213A))),
              ),
              const SizedBox(height: 2),
              Text(fmtTime(m.createdAt),
                  style: TextStyle(fontSize: 9, color: mine ? Colors.white70 : const Color(0xFF98A1B5))),
            ]),
          ),
        );
      },
    );
  }

  Widget _taskPanel(String? me) {
    const labels = {'open': '待处理', 'working': '进行中', 'done': '已完成', 'failed': '已失败'};
    const colors = {
      'open': Color(0xFFE8A33D), 'working': Color(0xFF2C9BD6),
      'done': Color(0xFF2DB578), 'failed': Color(0xFFE5484D),
    };
    const flows = {
      'open': ['working', 'done', 'failed'],
      'working': ['done', 'failed'],
      'done': <String>[],
      'failed': <String>[],
    };
    if (_tasks.isEmpty) {
      return const EmptyView(emoji: '📋', text: '暂无任务：聊天里输入「@成员 任务：描述」即可分派');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: _tasks.length,
      itemBuilder: (_, i) {
        final t = _tasks[i];
        final canOperate = me == t.creatorSlug || me == t.assigneeSlug;
        final options = (flows[t.status] ?? const <String>[]);
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('${t.taskCode} · ${t.title}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: (colors[t.status] ?? Colors.grey).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(labels[t.status] ?? t.status,
                      style: TextStyle(fontSize: 10, color: colors[t.status])),
                ),
              ]),
              const SizedBox(height: 4),
              Text('指派给 ${t.assigneeSlug} · 由 ${t.creatorSlug} 创建 · ${fmtTime(t.updatedAt)}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF98A1B5))),
              if (canOperate && options.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Wrap(
                    spacing: 6,
                    children: options
                        .map((s) => OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                                  minimumSize: Size.zero),
                              onPressed: () => _flow(t, s),
                              child: Text('标记为 ${labels[s] ?? s}',
                                  style: const TextStyle(fontSize: 11)),
                            ))
                        .toList(),
                  ),
                ),
            ]),
          ),
        );
      },
    );
  }

  Widget _inputBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              onSubmitted: (_) => _send(),
              decoration: const InputDecoration(hintText: '发消息…（@成员 任务：描述 分派）'),
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
    );
  }
}
