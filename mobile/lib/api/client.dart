import 'package:dio/dio.dart';
import '../core/credentials.dart';
import '../core/signing.dart';

/// API 响应信封
class ApiError implements Exception {
  final String message;
  final String? code;
  ApiError(this.message, {this.code});
  @override
  String toString() => message;
}

/// 统一 HTTP 客户端：
///   - 响应信封 {ok,data} / {ok:false,error:{message,code}}
///   - Agent 请求级 HMAC 签名（body 字符串先签名后发送，保证字节一致）
///   - 主人令牌走 X-Owner-Token 头（网关会注入 Authorization，绝不用它）
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  late Dio _dio;
  bool _ready = false;

  String get baseUrl => CredentialStore.instance.baseUrl;

  Future<void> ensure() async {
    if (_ready) return;
    await CredentialStore.instance.ensure();
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
      // 使用 String body 时不让 dio 重新序列化
      responseType: ResponseType.json,
    ));
    _ready = true;
  }

  /// baseUrl 变更后调用
  void resetBaseUrl() {
    _ready = false;
    ensure();
  }

  Future<Map<String, dynamic>> _unwrap(Response resp) async {
    final j = resp.data;
    if (j is! Map) throw ApiError('响应格式异常');
    final m = Map<String, dynamic>.from(j);
    if (m['ok'] != true) {
      final err = (m['error'] ?? {}) as Map;
      throw ApiError((err['message'] ?? '请求失败').toString(),
          code: err['code']?.toString());
    }
    return Map<String, dynamic>.from((m['data'] ?? {}) as Map);
  }

  String _absolute(String path) {
    if (path.startsWith('http')) return path;
    return '$baseUrl$path';
  }

  /// 匿名 GET
  Future<Map<String, dynamic>> get(String path,
      {Map<String, dynamic>? query}) async {
    await ensure();
    final resp = await _dio.get(_absolute(path), queryParameters: query,
        options: Options(responseType: ResponseType.json));
    return _unwrap(resp);
  }

  /// 匿名 POST（jsonEncode 保证与签名一致的原始字节）
  Future<Map<String, dynamic>> post(String path, Object? body) async {
    await ensure();
    final raw = AgentSignature.encodeBody(body);
    final resp = await _dio.post(_absolute(path),
        data: raw,
        options: Options(headers: {'Content-Type': 'application/json'},
            responseType: ResponseType.json));
    return _unwrap(resp);
  }

  /// Agent 签名请求（GET 不带 body；POST/PATCH 签名 body）
  Future<Map<String, dynamic>> agentRequest(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) async {
    await ensure();
    final slug = CredentialStore.instance.agentSlug;
    final secret = CredentialStore.instance.agentSecret;
    if (slug == null || secret == null) {
      throw ApiError('未绑定 Agent 凭据', code: 'NO_CREDENTIAL');
    }
    final raw = AgentSignature.encodeBody(body);
    final headers = AgentSignature.headers(slug: slug, secret: secret, rawBody: raw);
    headers['Content-Type'] = 'application/json';
    final resp = await _dio.request(
      _absolute(path),
      data: body == null ? null : raw,
      queryParameters: query,
      options: Options(method: method, headers: headers, responseType: ResponseType.json),
    );
    return _unwrap(resp);
  }

  /// 主人令牌请求（X-Owner-Token —— 网关会注入 Authorization，禁用它）
  Future<Map<String, dynamic>> ownerRequest(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) async {
    await ensure();
    final token = CredentialStore.instance.ownerToken;
    if (token == null) throw ApiError('未登录主人账号', code: 'NO_OWNER');
    final headers = {'X-Owner-Token': token, 'Content-Type': 'application/json'};
    final resp = await _dio.request(
      _absolute(path),
      data: body,
      queryParameters: query,
      options: Options(method: method, headers: headers, responseType: ResponseType.json),
    );
    return _unwrap(resp);
  }
}
