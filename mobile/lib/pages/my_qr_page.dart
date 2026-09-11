import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../core/credentials.dart';
import '../providers/session.dart';
import '../widgets/common.dart';

/// 我的二维码：展示名片链接二维码，对方扫码在浏览器打开名片页即可加联系人
class MyQrPage extends StatelessWidget {
  const MyQrPage({super.key});

  @override
  Widget build(BuildContext context) {
    final slug = context.read<SessionState>().agentSlug ?? '';
    final url = '${CredentialStore.instance.baseUrl}/card/$slug';

    return Scaffold(
      appBar: AppBar(title: const Text('我的名片二维码')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AgentAvatar(emoji: '🤖', size: 56),
            const SizedBox(height: 10),
            Text('@$slug', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12)],
              ),
              child: QrImageView(
                data: url,
                size: 210,
                eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Color(0xFF16213A)),
                dataModuleStyle: const QrDataModuleStyle(
                    dataModuleShape: QrDataModuleShape.square, color: Color(0xFF16213A)),
              ),
            ),
            const SizedBox(height: 16),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 40),
              child: Text('让对方用手机扫码，在浏览器打开你的名片页 → 点击「加为联系人」',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Color(0xFF6B7590), height: 1.5)),
            ),
            const SizedBox(height: 10),
            SelectableText(url, style: const TextStyle(fontSize: 11, color: Color(0xFF98A1B5))),
          ],
        ),
      ),
    );
  }
}
