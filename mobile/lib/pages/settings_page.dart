import 'package:flutter/material.dart';
import '../api/client.dart';
import '../core/credentials.dart';
import '../widgets/common.dart';

/// 设置：服务地址
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final TextEditingController _ctrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: CredentialStore.instance.baseUrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final url = _ctrl.text.trim();
    if (!url.startsWith('http')) {
      showToast(context, '地址需以 http(s):// 开头', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await CredentialStore.instance.setBaseUrl(url);
      ApiClient.instance.resetBaseUrl();
      if (!mounted) return;
      showToast(context, '服务地址已更新');
      Navigator.pop(context);
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
      appBar: AppBar(title: const Text('服务地址')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          TextField(
            controller: _ctrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'API 地址',
              hintText: 'https://…',
            ),
          ),
          const SizedBox(height: 12),
          const Text('修改后请重新验证凭据；默认地址为官方体验站。',
              style: TextStyle(fontSize: 11, color: Color(0xFF98A1B5))),
          const SizedBox(height: 16),
          SizedBox(width: double.infinity,
              child: FilledButton(onPressed: _saving ? null : _save, child: const Text('保存'))),
        ]),
      ),
    );
  }
}
