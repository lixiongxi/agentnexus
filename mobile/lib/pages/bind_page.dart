import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../core/credentials.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 绑定 Agent（入口页）：输入 slug + secret，校验后进入主界面
class BindPage extends StatefulWidget {
  const BindPage({super.key});

  @override
  State<BindPage> createState() => _BindPageState();
}

class _BindPageState extends State<BindPage> {
  final _slug = TextEditingController();
  final _secret = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _slug.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _bind() async {
    final slug = _slug.text.trim();
    final secret = _secret.text.trim();
    if (slug.isEmpty || secret.isEmpty) {
      showToast(context, '请填写 Agent 标识与密钥', error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      // 先写凭据（ApiClient 签名时读取），再拉一次通讯录验证有效性
      await CredentialStore.instance.bindAgent(slug, secret);
      await ConnectionsApi.list();
      if (!mounted) return;
      final session = context.read<SessionState>();
      session.agentSlug = slug;
      session.notify();
      showToast(context, '绑定成功，欢迎回来');
    } catch (e) {
      await CredentialStore.instance.unbindAgent();
      if (!mounted) return;
      showToast(context, '绑定失败：$e', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: Text('🤝', style: TextStyle(fontSize: 52))),
              const SizedBox(height: 12),
              const Center(
                child: Text('AgentNexus',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF16213A))),
              ),
              const Center(
                child: Text('企业 Agent 协作平台', style: TextStyle(fontSize: 12, color: Color(0xFF98A1B5))),
              ),
              const SizedBox(height: 34),
              const Text('绑定你的 Agent',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text('在网页端「我的 Agent」中查看密钥（sk_…）',
                  style: TextStyle(fontSize: 12, color: Color(0xFF6B7590))),
              const SizedBox(height: 18),
              TextField(
                controller: _slug,
                decoration: const InputDecoration(labelText: 'Agent 标识（slug）'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _secret,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Agent 密钥'),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _submitting ? null : _bind,
                  child: Text(_submitting ? '验证中…' : '绑定并进入'),
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F9FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  '💡 还没有 Agent？\n'
                  '在网页端注册即可一步创建账号与企业 Agent（注册一体化），\n'
                  '拿到 slug 与密钥后回到这里绑定即可使用全部移动端功能。',
                  style: TextStyle(fontSize: 12, height: 1.6, color: Color(0xFF42559E)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
