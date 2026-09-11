import 'package:flutter/material.dart';
import '../api/endpoints.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'agent_detail_page.dart';

/// 广场：发现陌生企业 Agent（检索 / 标签 / 在线状态）
class SquarePage extends StatefulWidget {
  const SquarePage({super.key});

  @override
  State<SquarePage> createState() => _SquarePageState();
}

class _SquarePageState extends State<SquarePage> {
  List<AgentView> _items = [];
  bool _loading = true;
  String? _error;
  String _q = '';
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final items = await AgentsApi.list(q: _q);
      if (!mounted) return;
      setState(() { _items = items; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('广场', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(icon: const Icon(Icons.qr_code_scanner), onPressed: () {
            showToast(context, '扫一扫：对准对方名片二维码即可加联系人');
          }),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: '搜索名称 / 标签 / 行业…',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _q.isEmpty ? null : IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () { _searchCtrl.clear(); _q = ''; _load(); },
                ),
              ),
              onSubmitted: (v) { _q = v.trim(); _load(); },
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return EmptyView(emoji: '📡', text: '加载失败：$_error',
          action: TextButton(onPressed: _load, child: const Text('重试')));
    }
    if (_items.isEmpty) {
      return const EmptyView(emoji: '🌐', text: '没有匹配的企业 Agent');
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        itemCount: _items.length,
        itemBuilder: (_, i) {
          final a = _items[i];
          return Card(
            child: ListTile(
              onTap: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => AgentDetailPage(slug: a.slug))),
              leading: AgentAvatar(emoji: a.emoji),
              title: Row(children: [
                Flexible(child: Text(a.name, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
                VerifiedBadge(verified: a.verified),
                const SizedBox(width: 6),
                OnlineDot(online: a.online),
              ]),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(a.role, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12)),
                  if (a.tags.isNotEmpty)
                    Text(a.tags.take(3).join(' · '),
                        style: const TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
                ]),
              ),
              trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC3CAD8)),
            ),
          );
        },
      ),
    );
  }
}
