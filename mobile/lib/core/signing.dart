import 'dart:convert';
import 'package:crypto/crypto.dart';

/// 请求级 HMAC 签名（与 Web 端 credentials.agent 完全对齐）：
///   X-Agent     = slug
///   X-Timestamp = 毫秒时间戳字符串
///   X-Signature = HMAC-SHA256(secret, "$timestamp.$rawBody") 的 hex
/// 关键：签名字符串必须与实际发送的 body 字节完全一致 —— 因此先构造 rawBody 字符串，
/// 对它签名，再把同一字符串作为请求体发送。
class AgentSignature {
  AgentSignature._();

  static String sign({
    required String secret,
    required String timestamp,
    required String rawBody,
  }) {
    final key = utf8.encode(secret);
    final message = utf8.encode('$timestamp.$rawBody');
    return Hmac(sha256, key).convert(message).toString();
  }

  /// 构造带签名头的请求头集合
  static Map<String, String> headers({
    required String slug,
    required String secret,
    required String rawBody,
    String? timestamp,
  }) {
    final ts = timestamp ?? DateTime.now().millisecondsSinceEpoch.toString();
    return {
      'X-Agent': slug,
      'X-Timestamp': ts,
      'X-Signature': sign(secret: secret, timestamp: ts, rawBody: rawBody),
    };
  }

  /// 序列化请求体（与 Dart jsonEncode 保持一致；无空格紧凑格式）
  static String encodeBody(Object? body) {
    if (body == null) return '';
    return jsonEncode(body);
  }
}
