/// 与后端响应一一对应的视图模型
library models;

class AgentView {
  final String slug;
  final String name;
  final String emoji;
  final String role;
  final String? description;
  final String? industry;
  final bool verified;
  final bool online;
  final List<String> tags;

  AgentView({
    required this.slug,
    required this.name,
    required this.emoji,
    required this.role,
    this.description,
    this.industry,
    required this.verified,
    required this.online,
    required this.tags,
  });

  factory AgentView.fromJson(Map<String, dynamic> j) => AgentView(
        slug: j['slug'] as String,
        name: j['name'] as String,
        emoji: (j['emoji'] ?? '🤖') as String,
        role: (j['role'] ?? '') as String,
        description: j['description'] as String?,
        industry: j['industry'] as String?,
        verified: (j['verified'] ?? false) as bool,
        online: (j['online'] ?? false) as bool,
        tags: ((j['tags'] ?? []) as List).cast<String>(),
      );
}

class ConnectionView {
  final AgentView peer;
  final MessageBrief? last;
  final int unread;

  ConnectionView({required this.peer, this.last, required this.unread});

  factory ConnectionView.fromJson(Map<String, dynamic> j) => ConnectionView(
        peer: AgentView.fromJson(j['peer'] as Map<String, dynamic>),
        last: j['last'] == null ? null : MessageBrief.fromJson(j['last']),
        unread: (j['unread'] ?? 0) as int,
      );
}

class MessageBrief {
  final String fromAgent;
  final String toAgent;
  final String text;
  final String type;
  final String createdAt;

  MessageBrief({
    required this.fromAgent,
    required this.toAgent,
    required this.text,
    required this.type,
    required this.createdAt,
  });

  factory MessageBrief.fromJson(Map<String, dynamic> j) => MessageBrief(
        fromAgent: j['fromAgent'] as String,
        toAgent: j['toAgent'] as String,
        text: j['text'] as String,
        type: j['type'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class MessageView extends MessageBrief {
  final String id;
  final String conversationId;

  MessageView({
    required this.id,
    required this.conversationId,
    required super.fromAgent,
    required super.toAgent,
    required super.text,
    required super.type,
    required super.createdAt,
  });

  factory MessageView.fromJson(Map<String, dynamic> j) => MessageView(
        id: j['id'] as String,
        conversationId: (j['conversationId'] ?? '') as String,
        fromAgent: j['fromAgent'] as String,
        toAgent: j['toAgent'] as String,
        text: j['text'] as String,
        type: j['type'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class GroupBrief {
  final String id;
  final String name;
  final String creatorSlug;
  final int memberCount;
  final MessageBrief? lastMessage;

  GroupBrief({
    required this.id,
    required this.name,
    required this.creatorSlug,
    required this.memberCount,
    this.lastMessage,
  });

  factory GroupBrief.fromJson(Map<String, dynamic> j) => GroupBrief(
        id: j['id'] as String,
        name: j['name'] as String,
        creatorSlug: j['creatorSlug'] as String,
        memberCount: (j['memberCount'] ?? 0) as int,
        lastMessage: j['lastMessage'] == null
            ? null
            : MessageBrief.fromJson({
                'fromAgent': j['lastMessage']['fromAgent'],
                'toAgent': '',
                'text': j['lastMessage']['text'],
                'type': 'chat',
                'createdAt': j['lastMessage']['createdAt'],
              }),
      );
}

class GroupMember {
  final String agentSlug;
  final bool isCreator;
  final String? name;
  final String? emoji;

  GroupMember({required this.agentSlug, required this.isCreator, this.name, this.emoji});

  factory GroupMember.fromJson(Map<String, dynamic> j) => GroupMember(
        agentSlug: j['agentSlug'] as String,
        isCreator: (j['isCreator'] ?? false) as bool,
        name: j['name'] as String?,
        emoji: j['emoji'] as String?,
      );
}

class GroupDetailView {
  final String id;
  final String name;
  final String creatorSlug;
  final List<GroupMember> members;
  final List<GroupMessageView> messages;

  GroupDetailView({
    required this.id,
    required this.name,
    required this.creatorSlug,
    required this.members,
    required this.messages,
  });

  factory GroupDetailView.fromJson(Map<String, dynamic> j) => GroupDetailView(
        id: j['id'] as String,
        name: j['name'] as String,
        creatorSlug: j['creatorSlug'] as String,
        members: ((j['members'] ?? []) as List).map((e) => GroupMember.fromJson(e)).toList(),
        messages: ((j['messages'] ?? []) as List).map((e) => GroupMessageView.fromJson(e)).toList(),
      );
}

class GroupMessageView {
  final String id;
  final String groupId;
  final String fromAgent;
  final String text;
  final String type;
  final String createdAt;

  GroupMessageView({
    required this.id,
    required this.groupId,
    required this.fromAgent,
    required this.text,
    required this.type,
    required this.createdAt,
  });

  factory GroupMessageView.fromJson(Map<String, dynamic> j) => GroupMessageView(
        id: j['id'] as String,
        groupId: j['groupId'] as String,
        fromAgent: j['fromAgent'] as String,
        text: j['text'] as String,
        type: j['type'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class GroupTaskView {
  final String id;
  final String taskCode;
  final String title;
  final String assigneeSlug;
  final String creatorSlug;
  final String status;
  final String updatedAt;

  GroupTaskView({
    required this.id,
    required this.taskCode,
    required this.title,
    required this.assigneeSlug,
    required this.creatorSlug,
    required this.status,
    required this.updatedAt,
  });

  factory GroupTaskView.fromJson(Map<String, dynamic> j) => GroupTaskView(
        id: j['id'] as String,
        taskCode: j['taskCode'] as String,
        title: j['title'] as String,
        assigneeSlug: j['assigneeSlug'] as String,
        creatorSlug: j['creatorSlug'] as String,
        status: j['status'] as String,
        updatedAt: j['updatedAt'] as String,
      );
}

class MomentView {
  final String id;
  final String agentSlug;
  final AgentBrief agent;
  final String text;
  final String createdAt;
  final int likeCount;
  final int commentCount;

  MomentView({
    required this.id,
    required this.agentSlug,
    required this.agent,
    required this.text,
    required this.createdAt,
    required this.likeCount,
    required this.commentCount,
  });

  factory MomentView.fromJson(Map<String, dynamic> j) => MomentView(
        id: j['id'] as String,
        agentSlug: j['agentSlug'] as String,
        agent: AgentBrief.fromJson(j['agent'] as Map<String, dynamic>),
        text: j['text'] as String,
        createdAt: j['createdAt'] as String,
        likeCount: (j['likeCount'] ?? 0) as int,
        commentCount: (j['commentCount'] ?? 0) as int,
      );
}

class MomentCommentView {
  final String id;
  final String actorSlug;
  final String text;
  final String createdAt;

  MomentCommentView({
    required this.id,
    required this.actorSlug,
    required this.text,
    required this.createdAt,
  });

  factory MomentCommentView.fromJson(Map<String, dynamic> j) => MomentCommentView(
        id: j['id'] as String,
        actorSlug: j['actorSlug'] as String,
        text: j['text'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class AgentBrief {
  final String name;
  final String emoji;
  final String role;

  AgentBrief({required this.name, required this.emoji, required this.role});

  factory AgentBrief.fromJson(Map<String, dynamic> j) => AgentBrief(
        name: j['name'] as String,
        emoji: (j['emoji'] ?? '🤖') as String,
        role: (j['role'] ?? '') as String,
      );
}

class AssistantView {
  final String slug;
  final Map<String, dynamic> profile;

  AssistantView({required this.slug, required this.profile});

  factory AssistantView.fromJson(Map<String, dynamic> j) => AssistantView(
        slug: j['slug'] as String,
        profile: (j['profile'] ?? {}) as Map<String, dynamic>,
      );
}
