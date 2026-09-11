import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/endpoints.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 登录 / 一体化注册
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _register = false;
  bool _submitting = false;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _org = TextEditingController();
  final _agentName = TextEditingController();
  final _agentRole = TextEditingController();

  @override
  void dispose() {
    for (final c in [_email, _password, _name, _org, _agentName, _agentRole]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final email = _email.text.trim();
    final password = _password.text;
    if (!email.contains('@') || password.length < 8) {
      showToast(context, '请检查邮箱格式与口令（≥8 位）', error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      final session = context.read<SessionState>();
      if (_register) {
        if (_name.text.trim().isEmpty || _org.text.trim().isEmpty ||
            _agentName.text.trim().isEmpty || _agentRole.text.trim().isEmpty) {
          showToast(context, '请补齐带 * 的必填项', error: true);
          setState(() => _submitting = false);
          return;
        }
        final r = await AuthApi.registerWithAgent(
          name: _name.text.trim(), org: _org.text.trim(),
          email: email, password: password,
          agentName: _agentName.text.trim(), agentRole: _agentRole.text.trim(),
        );
        await session.bindAgent(r.agentSlug, r.secret);
        await session.setOwner(r.owner);
        if (!mounted) return;
        showToast(context, '注册成功，已自动绑定 Agent');
        Navigator.pop(context);
      } else {
        final owner = await AuthApi.login(email, password);
        await session.setOwner(owner);
        if (!mounted) return;
        showToast(context, '欢迎回来，${owner.name}');
        Navigator.pop(context);
      }
    } catch (e) {
      if (!mounted) return;
      showToast(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('主人账号')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('登录')),
              ButtonSegment(value: true, label: Text('注册一体化')),
            ],
            selected: {_register},
            onSelectionChanged: (s) => setState(() => _register = s.first),
          ),
          const SizedBox(height: 16),
          if (_register) ...[
            TextField(controller: _name, decoration: const InputDecoration(labelText: '姓名 *')),
            const SizedBox(height: 10),
            TextField(controller: _org, decoration: const InputDecoration(labelText: '组织 / 公司 *')),
            const SizedBox(height: 10),
          ],
          TextField(controller: _email, keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: '邮箱 *')),
          const SizedBox(height: 10),
          TextField(controller: _password, obscureText: true,
              decoration: const InputDecoration(labelText: '口令 *（至少 8 位）')),
          if (_register) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                  color: const Color(0xFFF5F9FF), borderRadius: BorderRadius.circular(10)),
              child: const Text('🤖 同时创建你的第一个 Agent',
                  style: TextStyle(fontSize: 12, color: Color(0xFF42559E))),
            ),
            const SizedBox(height: 10),
            TextField(controller: _agentName,
                decoration: const InputDecoration(labelText: 'Agent 名称 *')),
            const SizedBox(height: 10),
            TextField(controller: _agentRole,
                decoration: const InputDecoration(labelText: '一句话定位 *')),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _submitting ? null : _submit,
                child: Text(_submitting ? '提交中…' : (_register ? '注册并创建 Agent' : '登录'))),
          ),
          const SizedBox(height: 8),
          const Center(
            child: Text('注册一体化：一次得到账号 + Agent + 密钥，移动端自动绑定',
                style: TextStyle(fontSize: 10, color: Color(0xFF98A1B5))),
          ),
        ]),
      ),
    );
  }
}
