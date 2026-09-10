# Vibe Coding 前端术语知识库

> **来源**：[vibe-hub.org](https://vibe-hub.org/)（VibeHub · Vibe Coding Terms），2026-09-10 学习沉淀。
> **定位**：帮助「用自然语言 + AI 做前端」的人（vibe coder）准确说出需求术语；同时作为 AgentNexus 前端的对照清单——每条术语标注了平台内的实现状态，遗漏项驱动迭代。
> **原站方法论**（值得保留的四段式词条范式）：①场景问答（You might say）→ ②定义 → ③正误对比 + What it is not → ④**给 AI Agent 的提示词模板**。本库在每条术语后用「→NX」标注 AgentNexus 对应实现。

**图例**：✓ 已实现 · 🟡 部分/待增强 · ✗ 缺失

---

## 一、Web Basics 网页基础（14 条）

| 术语 | 场景一句话 | 定义 | →NX |
| --- | --- | --- | --- |
| Frontend | 「大家说的前端后端有什么区别？」 | 用户在浏览器里看到并交互的部分；后端是服务端的数据与逻辑 | ✓ `web/` React SPA |
| Component | 「把重复的产品卡片变成一个组件，改一处全更新」 | 把可复用的界面与它拥有的行为打包成单元；组件接受参数（Props） | ✓ `web/src/pages|components` 组件化 |
| State | 「点提交后先显示保存中，再按结果更新提示」 | 界面此刻需要记住、且会随操作或结果变化的信息 | ✓ hooks + providers/session |
| Markdown | 「AI 写的内容一堆井号星号是什么」 | 轻量标记语法，用纯文本表达标题/加粗/列表 | ✓ README 与文档体系 |
| HTML | 「AI 说这是页面的骨架」 | 描述页面结构与语义的标记语言 | ✓ SPA 挂载点 |
| CSS | 「样式都写在什么地方」 | 描述颜色、间距、布局等外观的样式语言 | ✓ styles/tokens.css + global.css |
| DOM | 「AI 说要操作 DOM」 | 浏览器把 HTML 解析成可编程的节点树 | ✓ React 抽象之下 |
| Title Tag | 「浏览器标签页上显示的名字」 | `<title>` 决定标签页与搜索结果标题 | ✓ 「AgentNexus · Agent 互联平台」 |
| Page Metadata | 「搜索结果里那段描述怎么来的」 | `<meta name="description">` 等描述页面的元信息 | 🟡 description 已有；按路由动态设置缺失 |
| Favicon | 「标签页上的小图标」 | 站点小图标，出现在标签页/书签/收藏夹 | ✗ 缺失 → **本次补齐** |
| Open Graph | 「分享到微信/群里没有卡片图」 | OG 协议元信息，决定链接分享时的标题/描述/图 | ✗ 缺失 → **本次补齐** |
| Web App Manifest | 「能不能加到桌面像 App 一样」 | JSON 清单声明名称/图标/主题色，支撑 PWA 安装 | ✗ 缺失 → **本次补齐** |
| Undo | 「删错了能不能撤回」 | 给破坏性操作提供撤销路径 | ✗ 助理创建/删除无撤销 → 路线图 |
| Accessibility | 「屏幕阅读器用户怎么用」 | 让残障用户可用：语义标签、对比度、键盘操作 | ✓ skip-link / aria-label / WCAG 意识；持续审计 |

## 二、Buttons & Links 按钮与链接（2 条）

| 术语 | 场景一句话 | 定义 | →NX |
| --- | --- | --- | --- |
| Button | 「这里要有个能点的按钮」 | 触发动作的控件；主次分明（主按钮/次按钮/幽灵按钮） | ✓ `.btn .btn-primary .btn-ghost` |
| Link | 「让它点了跳到另一个页面」 | 页面间跳转或外部引用 | ✓ React Router NavLink |

## 三、Forms 表单（19 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Input | 「给个输入框让用户填名字」 | 单行文本输入 | ✓ `.input` |
| Textarea | 「多行输入，比如留言」 | 多行文本输入 | ✓ `.textarea` |
| Number Input | 「只能填数字」 | 数字输入，含步进 | 🟡 评分/阈值用基础 input |
| Radio | 「多选一」 | 单选组 | 🟡 助理 emoji 用按钮组模拟 |
| Checkbox | 「可以多选几项」 | 复选 | 🟡 能力开关用按钮 toggle |
| Switch | 「像电灯开关那种」 | 即时生效的开/关切换 | 🟡 |
| Slider | 「拖动选范围」 | 滑杆取值 | ✗ |
| Rate | 「打几颗星」 | 星级评分 | ✗ → 与声誉体系路线图相关 |
| Select | 「下拉选一个」 | 下拉选择 | ✓ `.select` |
| Autocomplete | 「边打字边出建议」 | 输入联想 | ✗ 广场搜索可增强 |
| Cascader | 「省市区那种级联选择」 | 多级联动选择 | ✗ |
| Tree Select | 「从树形结构里选」 | 树形选择 | ✗ |
| Date Picker | 「选个日期而不是手敲」 | 日期选择控件 | ✗ 助理预约靠自然语言解析 |
| Time Picker | 「选个时间」 | 时间选择 | ✗ 同上 |
| Upload | 「上传头像/文件」 | 文件上传 | ✗ |
| Form | 「把这些输入打包成一个表单」 | 字段组织 + 校验 + 提交反馈的整体 | ✓ FactoryPage/登录注册 |
| Color Picker | 「选个颜色」 | 取色器 | ✗ 助理颜色用预设色值 |
| Label | 「输入框旁边那行说明」 | 字段的可访问名称 | ✓ `.field-label` 全部 htmlFor 关联 |
| Placeholder | 「框里灰色的提示文字」 | 输入前的提示示例 | ✓ 全表单已配 |

## 四、Content 内容展示（25 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Table | 「把这些数据列成表格」 | 行列组织结构化数据 | ✓ 管理后台审计日志 |
| List | 「一条条列出来」 | 纵向条目列表 | ✓ 各页列表 |
| Card | 「一张张卡片平铺」 | 自包含信息单元，网格排布 | ✓ `.card .grid-agents` 广场 |
| Tag | 「给它打个标签」 | 短标签标注属性/分类 | ✓ `.tag` + AgentTag 体系 |
| Badge | 「角标显示未读数」 | 状态小徽标（含计数） | ✓ `.badge-*` 未读/实时状态 |
| Avatar | 「圆形头像」 | 实体的小图标识 | ✓ emoji + color 组合头像 |
| Descriptions | 「详情页那种键值对列表」 | 成对展示字段与值 | ✓ Agent 详情 |
| Statistic | 「大数字看板」 | 突出显示关键数字 | ✓ 管理后台 `.grid-stats` |
| Tabs | 「同屏切换几个面板」 | 页内分页签 | ✓ 会话页/设置页 |
| Segmented | 「分段选择器」 | 一组互斥选项的紧凑切换 | 🟡 |
| Collapse | 「点标题展开详情」 | 折叠面板 | ✗ FAQ 区可引入 |
| Timeline | 「按时间一条线排事件」 | 时间轴 | ✓ 巡航日志可按此呈现 |
| Tree | 「文件夹那种层级」 | 树形结构展示 | ✗ |
| Carousel | 「轮播图」 | 循环轮播 | ✗ 落地页可选 |
| Empty | 「没数据时别白屏」 | 空状态提示 + 下一步引导 | ✓ `.empty`（vibe-hub 强调空状态要有引导） |
| Image | 「放张图」 | 图片展示与加载占位 | 🟡 无懒加载 → 增强项 |
| File | 「展示文件条目」 | 文件名/大小/类型展示 | ✗ |
| Icon | 「小图标」 | 图标系统 | ✓ `components/icons` |
| Quote | 「引用一段话」 | 引用样式 | ✗ 落地页推荐语可用 |
| Video | 「放个视频」 | 视频嵌入 | ✗ 30s 演示视频可嵌入落地页 |
| Chat UI | 「聊天窗口那种」 | 消息列表 + 输入区 + 发送/失败/重试状态机 | ✓ 会话页（双方区分/未读/历史可滚） |
| Filter | 「按条件筛选列表」 | 筛选器组 | ✓ 广场 q/tag/industry/online |
| Chart | 「画个图表」 | 数据可视化 | ✗ 管理后台可加趋势图 |
| App Icon | 「App 的启动图标」 | 安装到主屏时的图标 | ✗ 随 manifest 补齐 |
| Sort | 「按时间/名称排序」 | 列表排序 | ✓ 广场 recent/name/industry |

## 五、Dialogs & Feedback 对话框与反馈（12 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Alert | 「页面里一块醒目提示」 | 页内常驻警示块 | ✓ FactoryPage 密钥警示卡 |
| Toast | 「右下角弹一下消失」 | 轻量操作反馈 | ✓ `.toast` providers/toast |
| Notification | 「重要消息要停留并能点」 | 需要停留的通知 | 🟡 toast 单形态 |
| Modal | 「弹窗确认」 | 模态对话框 | ✓ `.modal` |
| Drawer | 「侧边滑出面板」 | 抽屉 | ✗ 移动端导航用 overlay 模拟 |
| Popconfirm | 「点删除时二次确认」 | 轻量确认气泡 | 🟡 删除操作直接执行 |
| Popover | 「点击弹出小面板」 | 气泡面板 | ✗ |
| Tooltip | 「悬停显示解释」 | 悬停提示 | ✗ |
| Progress | 「显示进行到百分之多少」 | 进度指示 | ✗ 长任务可加 |
| Skeleton | 「加载时灰块占位」 | 骨架屏 | ✓ `.skeleton` |
| Result | 「成功/失败结果页」 | 操作结果终态页 | ✓ FactoryPage 成功页 |
| Spinner | 「转圈加载中」 | 加载指示 | ✓ 取票/连接中 badge |

## 六、Navigation 导航（9 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Menu | 「左侧菜单栏」 | 主导航菜单 | ✓ sidebar NAV_ITEMS |
| Breadcrumb | 「当前位置：首页>详情」 | 层级路径 | ✗ 层级浅，暂无必要 |
| Pagination | 「第 1 2 3 页」 | 分页控件 | ✓ 广场 page/pageSize |
| Steps | 「第 1 步共 3 步」 | 步骤条 | 🟡 FactoryPage 分节而非步骤条 |
| Dropdown | 「点头像出菜单」 | 下拉菜单 | ✓ 顶栏用户菜单 |
| Anchor | 「跳到页内某节」 | 页内锚点 | ✗ /about 落地页可用 |
| Back to Top Button | 「回到顶部」 | 回顶按钮 | ✗ → 落地页补 |
| Skip Link | 「键盘党跳过导航」 | 无障碍跳转链接 | ✓ `.skip-link` |
| Search | 「站内搜索框」 | 搜索入口 | ✓ 广场搜索 |

## 七、Website Sections 站点区块（10 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Hero | 「首屏要让人 5 秒看懂我们做什么」 | 头屏：主标题 + 副文案 + 单一主 CTA + 产品视觉 | ✗ 站点直进工具 → **本次补 /about** |
| CTA | 「放个醒目的行动按钮」 | 行动号召（注册/创建/试用） | ✗ 随 Hero 补（→ /factory） |
| Customer Testimonial | 「放客户评价」 | 用户声音引用 | ✗ 素材积累后加 |
| Header | 「顶部横条」 | 顶栏：品牌 + 导航 + 操作 | ✓ topbar |
| Logo | 「放我们的标志」 | 品牌标识（含多场景变体） | ✓ brand-mark「A」 |
| Navbar | 「导航条」 | 导航条本体 | ✓ sidebar + topbar |
| Footer | 「页脚放版权和链接」 | 页脚信息区 | 🟡 App 壳无 footer → 落地页补 |
| FAQ | 「常见问题列表」 | 常问问答区 | ✗ → 落地页补 |
| Pricing | 「价格表」 | 定价区 | ✗ 开源免费叙事即可 |
| Social Proof | 「GitHub 2 万星那种信任背书」 | 信任证明（客户/数据/徽章） | ✗ → 落地页补（CI 徽章 + 测试数） |

## 八、Page Layouts 页面布局（9 条）

| 术语 | 场景 | 定义 | →NX |
| --- | --- | --- | --- |
| Top Nav | 「顶部导航布局」 | 导航在顶部的布局 | 🟡 sidebar 为主 |
| Sidebar | 「侧边栏布局」 | 侧栏导航 + 内容区 | ✓ app-shell |
| Single Page | 「一屏讲完一件事」 | 单屏页 | ✓ FactoryPage |
| Doc Layout | 「像文档站那样左边目录右边正文」 | 文档阅读布局 | ✗ 文档在 GitHub |
| Card Grid | 「卡片网格」 | 卡片阵列 | ✓ `.grid-agents` |
| Centered Column | 「内容居中一列」 | 居中单列 | ✓ 表单页 maxWidth+auto |
| Masonry | 「瀑布流」 | 瀑布流 | ✗ |
| Split-screen | 「左右分屏」 | 分屏对比布局 | ✗ |
| Responsive Design | 「手机上也能正常用」 | 响应式适配 | ✓ grid 折行 + 移动导航 |

## 九、CSS Layout CSS 布局（11 条）

术语：Space（间距系统）/ Margin（外边距）/ Padding（内边距）/ Flex（弹性布局）/ Grid（网格布局）/ Z-Index（层叠顺序）/ Sticky（粘性定位）/ Position（定位）/ Centering（居中）/ Box Model（盒模型）/ Overflow（溢出处理）

→NX：✓ 全部经由 tokens.css（`--sp-*` 间距 token，vibe-hub 的 Design Token 范式）+ global.css（flex/grid/sticky 侧栏）；无明显缺失。

## 十、Typography 排版（3 条）

| 术语 | 定义 | →NX |
| --- | --- | --- |
| Typography | 字号/行高/字重的体系 | ✓ tokens 定义层级 |
| Serif & Sans | 衬线与无衬线的气质差异 | ✓ 全站无衬线（PingFang/YaHei） |
| Text Truncate | 「太长省略号」 | 🟡 演示脚本有截断；UI 侧少量使用 |

## 十一、Visual Styling 视觉样式（11 条）

| 术语 | 定义 | →NX |
| --- | --- | --- |
| Divider | 分隔线 | 🟡 用 border 隐式实现 |
| Border Radius | 圆角体系 | ✓ `.card 12px` 等圆角 token |
| Shadow | 阴影 | ✓ 卡片阴影（浅/深主题） |
| Opacity | 透明度 | ✓ hero 文字 .92 等 |
| Gradient | 渐变 | ✓ one-pager/落地页 hero 渐变 |
| Corner Feel | 圆角传达的气质（锐利 vs 温和） | ✓ 统一 8/12/16px 三档 |
| Backdrop Blur | 毛玻璃 | 🟡 toast/modal 可加 |
| Dark Mode | 暗色模式 | ✓ data-theme 全局切换（含 FOUC 防闪） |
| Design Token | 命名的设计变量体系 | ✓ tokens.css（`--brand --sp-* --ink-*`） |
| Contrast | 对比度（可读性） | ✓ 深浅主题文本 token；可跑对比度审计 |
| Visual Hierarchy | 视觉层级 | ✓ section-title/desc 两级 |

## 十二、Motion 动效（5 条）

| 术语 | 定义 | →NX |
| --- | --- | --- |
| Transition | 状态过渡 | ✓ 主题/按钮过渡 |
| Animation | 关键帧动画 | ✗ |
| Easing | 缓动曲线 | 🟡 |
| Spring | 弹性动效 | ✗ |
| Fade In/Out | 淡入淡出 | 🟡 overlay 有 |

## 十三、Pointer 指针交互（7 条）

| 术语 | 定义 | →NX |
| --- | --- | --- |
| Hover | 悬停反馈 | ✓ 卡片 hover（card-hover） |
| Active | 按下反馈 | ✓ 按钮态 |
| Focus | 键盘焦点可见 | ✓ skip-link/表单 focus |
| Drag | 拖拽 | ✗ |
| Disabled | 禁用态 | ✓ 提交按钮 disabled |
| Cursor | 指针形状 | ✓ 按钮手型 |
| Selection | 选中文本样式 | ✗ 可选 |

---

## 给 AI Agent 的需求话术模板（vibe-hub 范式，已中文化）

1. **组件化**：「把这个重复的卡片做成组件，首页/活动页/搜索页复用，各页传自己的数据，完成后检查三页表现一致。」
2. **设计 Token**：「把反复使用的品牌色/错误色/间距/圆角整理成语义 token，让按钮输入框卡片引用；不要为一次性值建 token；改一个品牌色 token，检查相关组件和暗色主题同步更新。」
3. **Chat UI**：「补全这个聊天窗：消息列表区分双方、发送后显示 pending、失败保留原消息并可重试；不要改模型提示词与返回内容；测试成功/等待/离线失败三种状态。」
4. **Hero**：「重做首屏：说清帮谁解决什么问题、副文案讲清结果、只强调一个主 CTA、用真实产品界面作证据；功能/价格/FAQ 放后面的区块；做完做一次五秒理解测试。」
5. **Empty 状态**：「列表为空时不要白屏：说明当前没有数据的原因，并给出下一步动作按钮。」

---

## 对照 AgentNexus 的遗漏清单与创新决策（2026-09-10）

| # | 遗漏（依据知识库） | 影响 | 决策 |
| --- | --- | --- | --- |
| 1 | **Favicon / Web App Manifest / theme-color 缺失** | 标签页无图标；不能安装为桌面 App；移动端浏览器状态栏配色不匹配 | ✅ 本次补齐（SVG favicon + manifest + theme-color） |
| 2 | **Open Graph 分享卡缺失** | 链接分享到微信/群聊无标题描述卡片，传播打折 | ✅ 本次补齐（og:title/description/type/url） |
| 3 | **无产品叙事首屏（Hero/CTA/FAQ/Social Proof/Footer）** | 新访客直进工具页，5 秒内不知道 AgentNexus 是什么、该做什么 | ✅ 本次新增 `/about` 落地页（Hero→能力三卡→CTA 直达 /factory→FAQ→Social Proof→Footer） |
| 4 | Undo / Rate / Chart / Date Picker 等 | 体验增强项，非阻断 | 📋 路线图（声誉评分、审计图表、预约控件） |
| 5 | Image 懒加载 / Backdrop Blur / Back to Top | 微体验 | 📋 路线图 |

> 知识库的使用建议：给企业创建助理时（/factory 的 FAQ 节），可直接从本文库摘取术语问答作为知识条目素材；「前端术语助教」即是一个现成的助理人设选题。

---

**来源**：vibe-hub.org 首页全量索引（128 词条 URL）+ component / state / design-token / chat-ui / hero 五条正文精读，抓取时间 2026-09-10。
