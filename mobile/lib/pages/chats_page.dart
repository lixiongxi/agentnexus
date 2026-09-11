import 'package:flutter/material.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../providers/session.dart';
import '../widgets/common.dart';
import 'chat_detail_page.dart';
import 'groups_page.dart';

/// 会话列表（单聊会话 + 群聊入口）
class ChatsPage extends StatefulWidget {
  const ChatsPage({super.key});

  @override
  State<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends State<ChatsPage> {
  List<ConnectionView> _items = [];
  bool _loading = true;
  String? _error;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final items = await ConnectionsApi.list();
      final unread = items.fold<int>(0, (s, c) => s + c.unread);
      if (!mounted) return;
      setState(() { _items = items; _unread = unread; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('会话', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.groups),
            tooltip: '群聊',
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const GroupsPage())).then((_) => _load()),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return EmptyView(emoji: '📡', text: _error!,
          action: TextButton(onPressed: _load, child: const Text('重试')));
    }
    if (_items.isEmpty) {
      return const EmptyView(emoji: '💬', text: '还没有会话：去广场发现企业 Agent 并加为联系人');
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        children: [
          // 群聊入口（聚合行）
          ListTile(
            leading: const AgentAvatar(emoji: '👥', color: Color(0xFFE8F5EF)),
            title: const Text('群聊', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: const Text('多 Agent 协作空间', style: TextStyle(fontSize: 12)),
            trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC3CAD8)),
            onTap: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const GroupsPage())).then((_) => _load()),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          if (_unread > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text('🔴 $_unread 条未读', style: const TextStyle(fontSize: 11, color: Color(0xFFB3382C))),
            ),
          ..._items.map(_buildTile),
        ],
      ),
    );
  }

  Widget _buildTile(ConnectionView c) {
    return Card(
      child: ListTile(
        onTap: () => Navigator.push(context, MaterialPageRoute(
            builder: (_) => ChatDetailPage(peer: c.peer))).then((_) => _load()),
        leading: Stack(children: [
          AgentAvatar(emoji: c.peer.emoji),
          Positioned(right: 0, bottom: 0, child: OnlineDot(online: c.peer.online)),
        ]),
        title: Row(children: [
          Flexible(child: Text(c.peer.name, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
          VerifiedBadge(verified: c.peer.verified),
        ]),
        subtitle: Text(
          c.last?.text ?? '暂无消息',
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (c.last != null)
              Text(fmtTime(c.last!.createdAt),
                  style: const TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
            if (c.unread > 0)
              Container(
                margin: const EdgeInsets.only(top: 3),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                    color: const Color(0xFFE5484D), borderRadius: BorderRadius.circular(9)),
                child: Text('${c.unread}',
                    style: const TextStyle(color: Colors.white, fontSize: 10)),
              ),
          ],
        ),
      ),
    );
  }
}
