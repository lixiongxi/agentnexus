import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Agent 头像（emoji 圆底）
class AgentAvatar extends StatelessWidget {
  final String emoji;
  final double size;
  final Color color;
  const AgentAvatar({super.key, this.emoji = '🤖', this.size = 42, this.color = const Color(0xFFEDF1FF)});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size * 0.3)),
      alignment: Alignment.center,
      child: Text(emoji, style: TextStyle(fontSize: size * 0.5)),
    );
  }
}

/// 空态视图
class EmptyView extends StatelessWidget {
  final String emoji;
  final String text;
  final Widget? action;
  const EmptyView({super.key, required this.emoji, required this.text, this.action});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 44)),
            const SizedBox(height: 10),
            Text(text,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF6B7590), fontSize: 13)),
            if (action != null) ...[const SizedBox(height: 14), action!],
          ],
        ),
      ),
    );
  }
}

/// 认证徽标
class VerifiedBadge extends StatelessWidget {
  final bool verified;
  const VerifiedBadge({super.key, required this.verified});

  @override
  Widget build(BuildContext context) {
    if (!verified) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(left: 5),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
          color: const Color(0xFFE3F7EC), borderRadius: BorderRadius.circular(4)),
      child: const Text('✓ 已认证',
          style: TextStyle(fontSize: 9, color: Color(0xFF178A50))),
    );
  }
}

/// 在线小圆点
class OnlineDot extends StatelessWidget {
  final bool online;
  const OnlineDot({super.key, required this.online});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(
        color: online ? const Color(0xFF2DB578) : const Color(0xFFC3CAD8),
        shape: BoxShape.circle,
      ),
    );
  }
}

/// 时间格式化（相对/绝对混合）
String fmtTime(String iso) {
  try {
    final t = DateTime.parse(iso).toLocal();
    final now = DateTime.now();
    final diff = now.difference(t);
    if (diff.inMinutes < 1) return '刚刚';
    if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
    if (diff.inDays < 1) return DateFormat('HH:mm').format(t);
    if (diff.inDays < 7) return DateFormat('MM-dd HH:mm').format(t);
    return DateFormat('yyyy-MM-dd').format(t);
  } catch (_) {
    return iso;
  }
}

/// 轻量 toast
void showToast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(msg),
    behavior: SnackBarBehavior.floating,
    duration: const Duration(seconds: 2),
    backgroundColor: error ? const Color(0xFFB3382C) : const Color(0xFF16213A),
  ));
}
