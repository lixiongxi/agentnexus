import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/session.dart';
import '../widgets/common.dart';
import 'login_page.dart';
import 'factory_page.dart';
import 'my_qr_page.dart';
import 'settings_page.dart';

/// 我的：凭据状态 / 助理配置 / 登录 / 设置
class MinePage extends StatefulWidget {
  const MinePage({super.key});

  @override
  State<MinePage> createState() => _MinePageState();
}

class _MinePageState extends State<MinePage> {
  Future<void> _unbind() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('解绑 Agent'),
        content: const Text('解绑后需重新输入 slug 与密钥才能使用消息/群聊等功能。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('解绑')),
        ],
      ),
    );
    if (ok == true && mounted) {
      await context.read<SessionState>().unbindAgent();
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退出主人账号'),
        content: const Text('仅清除主人登录态，Agent 凭据保留。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('退出')),
        ],
      ),
    );
    if (ok == true && mounted) {
      await context.read<SessionState>().setOwner(null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionState>();
    return Scaffold(
      appBar: AppBar(title: const Text('我的', style: TextStyle(fontWeight: FontWeight.bold))),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // Agent 身份卡
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                AgentAvatar(emoji: '🤖', size: 50),
                const SizedBox(width: 13),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('@${session.agentSlug ?? '-'}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 3),
                  Text('实时通道：${session.wsStatus == 'online' ? '🟢 在线' : '⚪ 离线'}',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF98A1B5))),
                ])),
                TextButton(onPressed: _unbind, child: const Text('解绑', style: TextStyle(fontSize: 12))),
              ]),
            ),
          ),
          const SizedBox(height: 4),
          // 功能入口
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.qr_code),
                title: const Text('我的名片二维码', style: TextStyle(fontSize: 14)),
                subtitle: const Text('让对方扫码加你为联系人', style: TextStyle(fontSize: 11)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const MyQrPage())),
              ),
              const Divider(height: 1, indent: 16),
              ListTile(
                leading: const Icon(Icons.psychology_outlined),
                title: const Text('助理能力配置', style: TextStyle(fontSize: 14)),
                subtitle: const Text('为该 Agent 配置客服/销售/秘书大脑', style: TextStyle(fontSize: 11)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const FactoryPage())).then((_) {
                  if (mounted) setState(() {});
                }),
              ),
              const Divider(height: 1, indent: 16),
              ListTile(
                leading: const Icon(Icons.login),
                title: Text(
                  session.hasOwner ? '已登录：${session.owner!.name}' : '登录主人账号',
                  style: const TextStyle(fontSize: 14),
                ),
                subtitle: Text(
                  session.hasOwner ? '可查看名下 Agent 与管理配置' : '可选，用于主人侧管理',
                  style: const TextStyle(fontSize: 11),
                ),
                trailing: session.hasOwner
                    ? TextButton(onPressed: _logout, child: const Text('退出', style: TextStyle(fontSize: 12)))
                    : const Icon(Icons.chevron_right, size: 18),
                onTap: session.hasOwner ? null : () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const LoginPage())).then((_) => setState(() {})),
              ),
            ]),
          ),
          const SizedBox(height: 4),
          // 设置
          Card(
            child: ListTile(
              leading: const Icon(Icons.dns_outlined),
              title: const Text('服务地址', style: TextStyle(fontSize: 14)),
              subtitle: const Text('指向 AgentNexus 平台 API', style: TextStyle(fontSize: 11)),
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const SettingsPage())),
            ),
          ),
          const SizedBox(height: 12),
          const Center(child: Text('AgentNexus v2.0 · 企业 Agent 协作平台 · MIT',
              style: TextStyle(fontSize: 10, color: Color(0xFF98A1B5)))),
        ],
      ),
    );
  }
}
