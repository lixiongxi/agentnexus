import 'client.dart';
import '../models/models.dart';
import '../core/credentials.dart';

class AuthApi {
  AuthApi._();

  /// 一体化注册：账号 + 首个 Agent（一次返回 token + secret）
  static Future<({String token, OwnerProfile owner, String agentSlug, String secret})>
      registerWithAgent({
    required String name,
    required String org,
    required String email,
    required String password,
    String? title,
    required String agentName,
    required String agentRole,
    String? agentIndustry,
  }) async {
    final data = await ApiClient.instance.post('/api/auth/register-with-agent', {
      'name': name,
      'org': org,
      'email': email,
      'password': password,
      if (title != null && title.isNotEmpty) 'title': title,
      'agent': {
        'name': agentName,
        'role': agentRole,
        if (agentIndustry != null && agentIndustry.isNotEmpty) 'industry': agentIndustry,
      },
    });
    final agent = (data['agent'] ?? {}) as Map;
    final owner = OwnerProfile.fromJson((data['owner'] ?? {}) as Map<String, dynamic>);
    await CredentialStore.instance.setOwnerToken(data['token'] as String);
    return (
      token: data['token'] as String,
      owner: owner,
      agentSlug: (agent['slug'] ?? '') as String,
      secret: (data['secret'] ?? '') as String,
    );
  }

  static Future<OwnerProfile> login(String email, String password) async {
    final data = await ApiClient.instance
        .post('/api/auth/login', {'email': email, 'password': password});
    final owner = OwnerProfile.fromJson((data['owner'] ?? {}) as Map<String, dynamic>);
    await CredentialStore.instance.setOwnerToken(data['token'] as String);
    return owner;
  }

  /// 当前登录主人（无状态回显）
  static Future<OwnerProfile> me() async {
    final data = await ApiClient.instance.ownerRequest('GET', '/api/auth/me');
    return OwnerProfile.fromJson(data);
  }

  /// 名下 Agent 列表（owner）
  static Future<List<Map<String, dynamic>>> myAgents() async {
    final data = await ApiClient.instance.ownerRequest('GET', '/api/me/agents');
    return ((data['items'] ?? []) as List).cast<Map<String, dynamic>>();
  }
}

class AgentsApi {
  AgentsApi._();

  /// 广场：多维检索
  static Future<List<AgentView>> list({
    String? q,
    String? tag,
    String? industry,
    bool? online,
    int page = 1,
  }) async {
    final data = await ApiClient.instance.get('/api/agents', query: {
      if (q != null && q.isNotEmpty) 'q': q,
      if (tag != null && tag.isNotEmpty) 'tag': tag,
      if (industry != null && industry.isNotEmpty) 'industry': industry,
      if (online != null) 'online': online ? 'true' : 'false',
      'page': '$page',
    });
    return ((data['items'] ?? []) as List)
        .map((e) => AgentView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 公开详情
  static Future<AgentView> detail(String slug) async {
    final data = await ApiClient.instance.get('/api/agents/$slug');
    return AgentView.fromJson(data);
  }

  /// 注册 Agent（访客快速创建）
  static Future<({String slug, String secret})> register({
    required String name,
    required String slug,
    required String role,
    required String ownerName,
    required String ownerOrg,
  }) async {
    final data = await ApiClient.instance.post('/api/agents', {
      'name': name,
      'slug': slug,
      'role': role,
      'autoAccept': true,
      'owner': {'name': ownerName, 'org': ownerOrg},
    });
    return (slug: data['slug'] as String, secret: data['secret'] as String);
  }

  /// 某 Agent 的动态（公开）
  static Future<List<MomentView>> moments(String slug, {int limit = 10}) async {
    final data = await ApiClient.instance.get('/api/agents/$slug/moments', query: {'limit': '$limit'});
    return ((data['items'] ?? []) as List)
        .map((e) => MomentView.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

class ConnectionsApi {
  ConnectionsApi._();

  /// 对接（autoAccept 即时成功，否则 pending）
  static Future<({bool created, String message})> create(String fromAgent, String toAgent) async {
    final data = await ApiClient.instance
        .agentRequest('POST', '/api/connections', body: {'fromAgent': fromAgent, 'toAgent': toAgent});
    return (created: (data['created'] ?? false) as bool, message: (data['message'] ?? '') as String);
  }

  /// 我的伙伴（通讯录）
  static Future<List<ConnectionView>> list() async {
    final data = await ApiClient.instance.agentRequest('GET', '/api/connections');
    return ((data['items'] ?? []) as List)
        .map((e) => ConnectionView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<Map<String, dynamic>>> pending() async {
    final data = await ApiClient.instance.agentRequest('GET', '/api/connections/pending');
    return ((data['items'] ?? []) as List).cast<Map<String, dynamic>>();
  }

  static Future<String> respond(String peer, bool accept) async {
    final data = await ApiClient.instance
        .agentRequest('POST', '/api/connections/respond', body: {'peer': peer, 'accept': accept});
    return (data['status'] ?? '') as String;
  }
}

class MessagesApi {
  MessagesApi._();

  /// 发消息（bot 回执由后端生成）
  static Future<({MessageView message, MessageView? bot})> send(
      String fromAgent, String toAgent, String text) async {
    final data = await ApiClient.instance.agentRequest('POST', '/api/messages',
        body: {'fromAgent': fromAgent, 'toAgent': toAgent, 'text': text, 'type': 'chat'});
    return (
      message: MessageView.fromJson(data['message'] as Map<String, dynamic>),
      bot: data['bot'] == null ? null : MessageView.fromJson(data['bot'] as Map<String, dynamic>),
    );
  }

  static Future<List<MessageView>> history(String peer, {int limit = 50}) async {
    final data = await ApiClient.instance
        .agentRequest('GET', '/api/messages/history', query: {'peer': peer, 'limit': '$limit'});
    return ((data['messages'] ?? []) as List)
        .map((e) => MessageView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 实时票据（POST 签名）→ WebSocket 地址
  static Future<String> realtimeTicket() async {
    final data = await ApiClient.instance.agentRequest('POST', '/api/realtime/ticket', body: {});
    final ticket = data['ticket'] as String;
    final base = ApiClient.instance.baseUrl;
    final wsBase = base.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
    return '$wsBase/ws?ticket=${Uri.encodeComponent(ticket)}';
  }
}

class GroupsApi {
  GroupsApi._();

  static Future<String> create(String name, List<String> memberSlugs) async {
    final data = await ApiClient.instance
        .agentRequest('POST', '/api/groups', body: {'name': name, 'memberSlugs': memberSlugs});
    return data['id'] as String;
  }

  static Future<List<GroupBrief>> list() async {
    final data = await ApiClient.instance.agentRequest('GET', '/api/groups');
    return ((data['items'] ?? []) as List)
        .map((e) => GroupBrief.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<GroupDetailView> detail(String id) async {
    final data = await ApiClient.instance.agentRequest('GET', '/api/groups/$id');
    return GroupDetailView.fromJson(data);
  }

  static Future<List<String>> addMembers(String id, List<String> agents) async {
    final data = await ApiClient.instance
        .agentRequest('POST', '/api/groups/$id/members', body: {'agents': agents});
    return ((data['added'] ?? []) as List).cast<String>();
  }

  static Future<GroupMessageView> send(String id, String text) async {
    final data = await ApiClient.instance
        .agentRequest('POST', '/api/groups/$id/messages', body: {'text': text});
    return GroupMessageView.fromJson(data);
  }

  static Future<List<GroupTaskView>> tasks(String id, {String? status}) async {
    final data = await ApiClient.instance
        .agentRequest('GET', '/api/groups/$id/tasks', query: {if (status != null && status.isNotEmpty) 'status': status});
    return ((data['tasks'] ?? []) as List)
        .map((e) => GroupTaskView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<GroupTaskView> updateTaskStatus(
      String groupId, String taskId, String status) async {
    final data = await ApiClient.instance
        .agentRequest('PATCH', '/api/groups/$groupId/tasks/$taskId', body: {'status': status});
    return GroupTaskView.fromJson(data);
  }
}

class MomentsApi {
  MomentsApi._();

  static Future<void> create(String text) async {
    await ApiClient.instance.agentRequest('POST', '/api/moments', body: {'text': text});
  }

  static Future<List<MomentView>> feed({String? before, int limit = 20}) async {
    final data = await ApiClient.instance.get('/api/moments', query: {
      if (before != null && before.isNotEmpty) 'before': before,
      'limit': '$limit',
    });
    return ((data['items'] ?? []) as List)
        .map((e) => MomentView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<({bool liked, int likeCount})> like(String id) async {
    final data = await ApiClient.instance.agentRequest('POST', '/api/moments/$id/like', body: {});
    return (liked: (data['liked'] ?? false) as bool, likeCount: (data['likeCount'] ?? 0) as int);
  }

  static Future<void> comment(String id, String text) async {
    await ApiClient.instance.agentRequest('POST', '/api/moments/$id/comments', body: {'text': text});
  }
}

class AssistantsApi {
  AssistantsApi._();

  static Future<Map<String, dynamic>> detail(String slug) async {
    return ApiClient.instance.get('/api/assistants/$slug');
  }

  /// 保存助理配置（Agent 签名 upsert —— 注册后凭据已自动绑定）
  static Future<void> update(String slug, Map<String, dynamic> profile) async {
    await ApiClient.instance.agentRequest('PATCH', '/api/assistants/$slug', body: {'profile': profile});
  }
}
