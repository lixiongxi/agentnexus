import 'package:flutter/material.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';
import 'group_chat_page.dart';

/// 群列表 + 建群
class GroupsPage extends StatefulWidget {
  const GroupsPage({super.key});

  @override
  State<GroupsPage> createState() => _GroupsPageState();
}

class _GroupsPageState extends State<GroupsPage> {
  List<GroupBrief> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final items = await GroupsApi.list();
      if (!mounted) return;
      setState(() { _items = items; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _createGroup() async {
    final nameCtrl = TextEditingController();
    final partners = <_Partner>[];
    try {
      final conns = await ConnectionsApi.list();
      partners.addAll(conns.map((c) => _Partner(c.peer.slug, c.peer.name, c.peer.emoji)));
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
      return;
    }
    if (!mounted) return;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => _CreateGroupSheet(nameCtrl: nameCtrl, partners: partners, onCreated: (id) {
        Navigator.pop(ctx);
        Navigator.push(context, MaterialPageRoute(builder: (_) => GroupChatPage(groupId: id)))
            .then((_) => _load());
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('群聊', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          TextButton.icon(
            onPressed: _createGroup,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('发起群聊'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyView(emoji: '📡', text: _error!, action: TextButton(onPressed: _load, child: const Text('重试')))
              : _items.isEmpty
                  ? const EmptyView(emoji: '👥', text: '还没有群：发起群聊，把已对接的伙伴拉进来协作')
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _items.length,
                        itemBuilder: (_, i) {
                          final g = _items[i];
                          return Card(
                            child: ListTile(
                              onTap: () => Navigator.push(context,
                                  MaterialPageRoute(builder: (_) => GroupChatPage(groupId: g.id)))
                                  .then((_) => _load()),
                              leading: const AgentAvatar(emoji: '👥', color: Color(0xFFE8F5EF)),
                              title: Text(g.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                              subtitle: Text(
                                '${g.memberCount} 名成员${g.lastMessage != null ? ' · ${g.lastMessage!.fromAgent}: ${g.lastMessage!.text}' : ' · 暂无消息'}',
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12),
                              ),
                              trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC3CAD8)),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _Partner {
  final String slug;
  final String name;
  final String emoji;
  _Partner(this.slug, this.name, this.emoji);
}

class _CreateGroupSheet extends StatefulWidget {
  final TextEditingController nameCtrl;
  final List<_Partner> partners;
  final void Function(String groupId) onCreated;
  const _CreateGroupSheet({required this.nameCtrl, required this.partners, required this.onCreated});

  @override
  State<_CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends State<_CreateGroupSheet> {
  final _selected = <String>{};
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('发起群聊', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: widget.nameCtrl,
            decoration: const InputDecoration(hintText: '群名称（例：华东供应商协作群）'),
          ),
          const SizedBox(height: 12),
          if (widget.partners.isEmpty)
            const Text('通讯录为空：先去广场对接一些 Agent',
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7590)))
          else
            ...widget.partners.map((p) => CheckboxListTile(
                  dense: true,
                  value: _selected.contains(p.slug),
                  onChanged: (v) => setState(() {
                    v == true ? _selected.add(p.slug) : _selected.remove(p.slug);
                  }),
                  title: Text('${p.emoji} ${p.name}',
                      style: const TextStyle(fontSize: 13)),
                  subtitle: Text(p.slug, style: const TextStyle(fontSize: 10)),
                  contentPadding: EdgeInsets.zero,
                )),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? '创建中…' : '创建群聊'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final id = await GroupsApi.create(widget.nameCtrl.text.trim(), _selected.toList());
      if (!mounted) return;
      showToast(context, '群创建成功');
      widget.onCreated(id);
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      showToast(context, e.toString(), error: true);
    }
  }
}
