import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 助理能力配置器：为绑定的 Agent 配置 FAQ（客服/销售/秘书开关保留 v1 精简版 = FAQ）
class FactoryPage extends StatefulWidget {
  const FactoryPage({super.key});

  @override
  State<FactoryPage> createState() => _FactoryPageState();
}

class _FactoryPageState extends State<FactoryPage> {
  final _faqList = <_FaqDraft>[{'keywords': '', 'answer': ''}];
  bool caps = true, sales = true, ticket = true;
  bool _saving = false;
  bool _loading = true;
  late final String slug;

  @override
  void initState() {
    super.initState();
    slug = context.read<SessionState>().agentSlug ?? '';
    _load();
  }

  Future<void> _load() async {
    try {
      final j = await AssistantsApi.detail(slug);
      final profile = (j['profile'] ?? {}) as Map<String, dynamic>;
      final c = (profile['capabilities'] ?? {}) as Map<String, dynamic>;
      final faq = (profile['faq'] ?? []) as List;
      if (!mounted) return;
      setState(() {
        caps = (c['secretary'] ?? true) as bool;
        sales = (c['sales'] ?? true) as bool;
        ticket = (c['ticket'] ?? true) as bool;
        if (faq.isNotEmpty) {
          _faqList
            ..clear()
            ..addAll(faq.map((f) {
              final kws = ((f as Map)['keywords'] ?? []) as List;
              return {
                'keywords': kws.cast<String>().join(', '),
                'answer': (f['answer'] ?? '') as String,
              };
            }));
        }
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final faq = _faqList
          .map((f) => {
                'keywords': (f['keywords'] as String)
                    .split(RegExp(r'[,，、]'))
                    .map((s) => s.trim())
                    .where((s) => s.isNotEmpty)
                    .toList(),
                'answer': (f['answer'] as String).trim(),
              })
          .where((f) => (f['keywords'] as List).isNotEmpty && (f['answer'] as String).isNotEmpty)
          .toList();
      await AssistantsApi.update(slug, {
        'capabilities': {'secretary': caps, 'sales': sales, 'ticket': ticket},
        'faq': faq,
      });
      if (!mounted) return;
      showToast(context, '配置已保存，即刻生效');
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('助理配置 · @$slug', style: const TextStyle(fontSize: 15)),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? '…' : '💾 保存'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('能力开关', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      SwitchListTile(
                          dense: true, contentPadding: EdgeInsets.zero,
                          title: const Text('🗓️ 秘书（预约/提醒）', style: TextStyle(fontSize: 13)),
                          value: caps, onChanged: (v) => setState(() => caps = v)),
                      SwitchListTile(
                          dense: true, contentPadding: EdgeInsets.zero,
                          title: const Text('🤝 销售（推荐/报价/线索）', style: TextStyle(fontSize: 13)),
                          value: sales, onChanged: (v) => setState(() => sales = v)),
                      SwitchListTile(
                          dense: true, contentPadding: EdgeInsets.zero,
                          title: const Text('🎫 客服（工单/转人工）', style: TextStyle(fontSize: 13)),
                          value: ticket, onChanged: (v) => setState(() => ticket = v)),
                    ]),
                  ),
                ),
                const SizedBox(height: 6),
                Row(children: [
                  const Text('FAQ 知识库', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => setState(() => _faqList.add({'keywords': '', 'answer': ''})),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('添加', style: TextStyle(fontSize: 12)),
                  ),
                ]),
                ..._faqList.asMap().entries.map((e) {
                  final i = e.key;
                  final f = e.value;
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(children: [
                        TextField(
                          controller: TextEditingController(text: f['keywords']),
                          onChanged: (v) => f['keywords'] = v,
                          decoration: const InputDecoration(
                              labelText: '触发关键词（逗号分隔）', hintText: '例：退货, 退款'),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: TextEditingController(text: f['answer']),
                          onChanged: (v) => f['answer'] = v,
                          maxLines: 2,
                          decoration: const InputDecoration(labelText: '标准答案'),
                        ),
                        if (_faqList.length > 1)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => setState(() => _faqList.removeAt(i)),
                              child: const Text('删除本条', style: TextStyle(fontSize: 12, color: Color(0xFFB3382C))),
                            ),
                          ),
                      ]),
                    ),
                  );
                }),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.save_outlined, size: 18),
                    label: Text(_saving ? '保存中…' : '💾 保存配置（保存即生效）'),
                  ),
                ),
              ]),
            ),
    );
  }
}

typedef _FaqDraft = Map<String, String>;
