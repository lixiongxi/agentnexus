/// 全局配置：API 地址与常量
class AppConfig {
  AppConfig._();

  /// 默认指向线上站点（可在「我的 → 服务地址」中修改，存本地）
  static const String defaultBaseUrl = 'https://0192ec810ee94e74b0aad99819f20557.app.workbuddy.link';

  /// 请求级签名有效期（与服务端一致 ±5 分钟）
  static const int signatureToleranceMs = 5 * 60 * 1000;

  /// 群成员上限（展示用）
  static const int groupMaxMembers = 50;
}
