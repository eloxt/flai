# Flai 前后端代码审查

审查日期：2026-09-17。审查对象为当前工作区，覆盖 API 定义、鉴权和业务控制器、DAO 查询边界、三个 LLM 适配器、MCP/S3、前端路由与状态、聊天/翻译/分享/管理界面，以及构建和数据库初始化结构。通用 UI 组件主要通过结构检查和 TypeScript 检查验证。本次没有修改业务代码。

发现 **30 项需修复问题：13 项 P1、17 项 P2**。P1 表示应优先修复的权限、隐私或服务可用性问题；P2 表示明确的功能、状态一致性或可靠性问题。下面区分静态代码证据和隔离复现，未把未经验证的线上影响描述成已发生事件。

**验证结果**

| 检查 | 结果 |
| --- | --- |
| `go test ./...` | 通过；仓库现有测试集中在 Gemini SSE 过滤器，业务控制器没有测试 |
| `go vet ./...` | 通过 |
| `go test -race ./...` | 通过；现有测试未执行缓存热更新和 HTTP 断连并发路径，不能据此排除下面的数据竞争 |
| `pnpm build` | 通过，有 sourcemap 和大 chunk 警告 |
| 项目本地 `pnpm exec tsc` | 无法执行，未安装 TypeScript 编译器 |
| 临时 TypeScript 5.9.3：`tsc --noEmit -p tsconfig.app.json` | 失败，10 处错误，见 R24 |
| Go overlay 隔离探针 | 已复现未激活账户令牌通过实际鉴权中间件、refresh token 被当作访问令牌、Chat Completions 丢附件、空 completion panic、Gemini 空标题返回 `(nil,nil)` |
| React + JSDOM 隔离探针 | 已复现 A 会话流写入 B 会话、流式 JSON 鉴权错误被吞掉、退出登录后仍残留草稿和附件 |

所有探针使用临时文件、本地模拟响应和虚构令牌，没有调用真实 LLM、S3 或业务数据库。没有进行线上渗透、真实多用户数据库联调或依赖 CVE 全量扫描。数据库相关结论依据仓库查询和 `init.sql`；实际部署若有额外数据库约束、网络出口策略，应一并核对。

**P1：优先处理**

1. **R01 — 未激活账户能使用 API，停用/删除/降权后旧令牌仍保留权限。**
   位置：[注册签发令牌](/Users/eloxt/Developer/eloxt/flai/internal/controller/auth/auth_v1_register.go:48)、[鉴权只信任令牌中的账户信息](/Users/eloxt/Developer/eloxt/flai/internal/middleware/auth.go:50)。注册创建的用户默认 `IsActive=0`，却立即返回 token；前端跳转等待激活页不能阻止直接使用这个 token。中间件不读取当前账户状态，因此已停用/删除账户仍可访问，已降权管理员仍可走管理接口，直到旧令牌过期。**已通过本地实际中间件复现：未激活账户的 token 返回 HTTP 200 并进入受保护处理器。** 应在未激活时不发可用令牌，并校验当前账户状态和角色，配合令牌版本或撤销机制处理权限变更。

2. **R02 — Refresh token 可以直接访问所有受保护接口。**
   位置：[刷新令牌](/Users/eloxt/Developer/eloxt/flai/utility/jwt.go:76)、[统一验证器](/Users/eloxt/Developer/eloxt/flai/utility/jwt.go:93)。两种令牌采用相同签名密钥、相同 claims 结构，没有用途标记；`RequireAuth` 使用同一个验证器。持有 refresh token 即可绕过较短的 access token 生命周期。**已通过实际中间件复现。** 应区分令牌用途，并由 API 中间件只接受 access token。

3. **R03 — 删除会话可越权删除其他用户的全部消息。**
   位置：[删除会话后的消息删除](/Users/eloxt/Developer/eloxt/flai/internal/controller/conversation/conversation_v1_delete.go:21)。第一条删除包含 `user_id`，但没有检查是否确实命中该用户的会话；随后无条件按请求中的 `conversation_id` 删除消息。A 对已知的 B 会话 ID 发删除请求，第一步影响零行，第二步仍会删除 B 的消息。应先确认会话归属，再在同一事务中执行授权范围内的删除。

4. **R04 — 删除消息时可把其他用户的消息搬入自己的会话。**
   位置：[children 更新](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_delete.go:48)。`children` 完全来自请求，最终 `UPDATE` 只按这些 ID 匹配，却将 `conversation_id` 改成当前用户的会话。只要知道目标消息 ID，就能将目标消息移入自己的会话并通过详情接口读取；甚至没有要求前面的待删消息实际存在。应从数据库查询真实子节点，并把原会话 ID 纳入更新条件，不接受客户端决定子节点归属。

5. **R05 — 聊天历史与附件没有校验归属。**
   位置：[历史查询](/Users/eloxt/Developer/eloxt/flai/internal/dao/message.go:31)、[附件查询](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_create.go:141)。入口只验证当前会话属于调用者；`message_path` 和 `files` 中的 ID 随后被全局查询。已知其他用户的消息 ID 可被作为模型上下文，已知附件 ID 可被嵌入自己的消息，返回对应文件元数据和公开 URL。应把历史限定在已授权会话、把附件限定在当前用户，并验证完整路径和全部 ID，而不是只检查返回数量。

6. **R06 — 文件批量删除丢失用户范围。**
   位置：[最终文件 DELETE](/Users/eloxt/Developer/eloxt/flai/internal/controller/file/file_v1_delete_file.go:46)。前置查询有 `user_id`，但只要求查到至少一个自己的文件；最终删除使用原始 `deleteIds`，没有用户条件。提交“自己的文件 ID + 其他用户文件 ID”即可同时删除后者的数据库记录。应删除实际授权查询得到的 ID，并在写入语句中保留用户约束。

7. **R07 — 任意登录用户可删除他人的分享。**
   位置：[分享删除](/Users/eloxt/Developer/eloxt/flai/internal/controller/share/share_v1_delete.go:14)、[分享查找](/Users/eloxt/Developer/eloxt/flai/internal/controller/share/share_v1_check.go:14)。删除仅匹配分享 ID，没有检查 `user_id`，公开分享 URL 的接收者注册登录后就能删除原作者的分享。`check` 也可通过其他用户会话 ID 查询分享 ID。应给两个接口都增加所有者校验；公开读取应只留在 `/public`。

8. **R08 — 分享有效期没有在后端生效。**
   位置：[公开分享详情](/Users/eloxt/Developer/eloxt/flai/internal/controller/public/public_v1_detail.go:20)。查询和返回内容前都不检查 `expires_at`。过期仅在前端被显示为“已过期”，匿名访问原 URL 仍能获得全部分享内容。应在返回任何内容前拒绝过期分享，并明确区分不存在与不过期记录。

9. **R09 — 只修改分享有效期，会意外公开整个会话。**
   位置：[分享更新的全量分支](/Users/eloxt/Developer/eloxt/flai/internal/controller/share/share_v1_update.go:63)、[设置页仅发送有效期](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/settings/share-settings.tsx:121)。用户最初按某条消息路径分享后，在设置中修改有效期没有提交 `message_path`；后端把缺省路径解释为“读取会话所有消息”，并覆盖原快照。这样会把其他分支和分享后追加的私人内容加入同一公开链接。应将有效期修改与内容刷新分开，缺省路径时保留原有分享范围。

10. **R10 — 普通用户可令后端连接任意地址，形成 SSRF 入口。**
    位置：[MCP 建立连接](/Users/eloxt/Developer/eloxt/flai/internal/logic/mcp/mcp.go:72)、[用户提交 endpoint](/Users/eloxt/Developer/eloxt/flai/internal/controller/mcp/mcp_v1_create.go:50)。用户可保存任意 endpoint 并通过刷新工具触发服务器 HTTP 请求；代码没有限制私网、loopback、链路本地地址、DNS 解析结果或重定向目标。部署在可访问内网的环境时，普通账户能够探测和触发内网 HTTP 服务。应依据业务需求明确允许的 MCP 地址范围，在实际连接和重定向时校验，并配合网络出口限制；本次未向真实内网发请求。

11. **R11 — 搜索高亮被直接作为 HTML 插入，有存储型 XSS 风险。**
    位置：[搜索结果 HTML 注入点](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/sidebar.tsx:516)、[后端高亮来源](/Users/eloxt/Developer/eloxt/flai/internal/controller/conversation/conversation_v1_search.go:25)。高亮内容来自用户/模型消息，前后端没有 HTML 清理便交给 `dangerouslySetInnerHTML`。消息包含可执行 HTML 时，搜索命中会把非可信内容送进 DOM，风险包括读取同源 localStorage 中的令牌。PostgreSQL 明确说明 `ts_headline` 输出不能作为 HTML 安全边界，应清理输出；见 [官方 XSS 说明](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-HEADLINE)。建议把匹配片段作为文本节点渲染，或只允许高亮所需的有限标签。本项依据数据流和官方文档，未在真实数据库上执行载荷。

12. **R12 — Provider 热更新并发读写普通 map，可能导致进程崩溃。**
    位置：[发布空 map 后逐项写入](/Users/eloxt/Developer/eloxt/flai/internal/logic/provider_cache.go:67)、[聊天并发读取](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_create.go:208)。管理员更新 Provider 会触发缓存刷新；请求协程同时读取 `ProviderMap` 和内部 `ModelIdMap`，没有锁或原子快照。除更新窗口内的错误“Invalid provider/model”外，还存在 Go 的 concurrent map read/write fatal。应先在局部完整构建不可变快照，再通过统一同步机制替换；读端同样必须遵守该机制。

13. **R13 — 上游空结果可在后台 goroutine 内触发未恢复 panic。**
    位置：[直接访问第一个 choice](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai_chat.go:128)、[Gemini 空标题](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/gemini.go:829)、[标题解引用](/Users/eloxt/Developer/eloxt/flai/internal/controller/conversation/conversation_v1_generate_title.go:64)。Chat Completions 流只有 `[DONE]`、没有 choice 时，会越界 panic；Gemini 无候选结果时返回 `(nil,nil)`，调用方继续访问 `title.Title`。两处都运行在自行创建且没有恢复边界的 goroutine 中，可终止整个 Go 进程。**已用本地空流复现越界，并验证空标题的 nil 返回。** 应显式拒绝空结果，返回可处理错误，并给后台任务建立错误处理边界。

**P2：功能与可靠性**

14. **R14 — 断连处理会并发清空框架 ResponseWriter。**
    位置：[请求协程清空 writer](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_create.go:91)、[生成协程访问/清空 writer](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/client.go:121)。客户端断开后，请求协程和生成协程无同步地修改同一个 `response.BufferWriter`；框架中间件和请求收尾仍会访问它。空值检查与后续解引用之间也存在竞态，部分访问发生在 `recover` 注册之前。应让 HTTP 写入由一个协程负责，后台生成通过消息通道或独立订阅关系输出；断连关闭订阅，不修改框架内部 writer 指针。

15. **R15 — 流式错误契约不完整，失败被当作正常结束。**
    位置：[stream 只检查 HTTP 状态](/Users/eloxt/Developer/eloxt/flai/frontend/app/lib/api.ts:122)、[EOF 丢弃剩余 buffer](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/chat/use-chat.ts:437)、[提前设置 SSE 响应](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_create.go:63)。鉴权中间件返回 HTTP 200 的 JSON 错误，而 `api.stream` 不解析它；GoFrame JSON 没有末尾换行，聊天解析器到 EOF 直接退出，翻译解析器更是忽略所有非 SSE 行。另外，设置 SSE Content-Type 后返回普通 Go error，当前 GoFrame 响应中间件会跳过统一错误输出。**已复现过期令牌 JSON 被吞掉、账户仍处登录态、页面留下 pending 空消息。** 应识别 JSON 错误和 401，约定 SSE error/done 事件，检查流是否正常结束，并在失败后回滚或标记占位消息。

16. **R16 — 切换会话后旧请求仍写入新会话状态。**
    位置：[初始化 effect 无清理](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/chat/use-chat.ts:744)、[无会话校验的最终合并](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/chat/use-chat.ts:609)。A 生成期间切到 B，组件/Hook 被复用，既没有取消旧订阅也没有隔离 refs；A 完成后执行 `setPath(prev => [...prev, finalMsg])`，把 A 回复加入 B。迟到的详情请求也可覆盖新会话。**React 隔离探针已复现 B 的消息后出现 A 回复。** 应用会话 ID 隔离状态和请求生命周期，拒绝过时回调；后台继续生成与前端取消订阅可以同时成立。

17. **R17 — 流式输出时按 Enter 或点击历史重试可启动重叠生成。**
    位置：[Enter 无生成状态保护](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/chat-input.tsx:134)、[sendMessage 无并发保护](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/chat/use-chat.ts:481)、[历史消息固定传 false](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/chat/Chat.tsx:227)。输入框仅在 `isLoading` 时禁用，流式期间键盘仍调用 `onSend`；历史消息操作也能再次启动生成。多个请求共用 streaming ref 和 abort ref，较早请求的 finally 会合并/清掉较晚请求的消息，且后一轮可能携带尚未落库的消息 ID。应在发送入口同步阻止重入，或完整隔离多条并行生成的状态。

18. **R18 — 新增/删除 Provider 不刷新生成缓存。**
    位置：[新增后直接返回](/Users/eloxt/Developer/eloxt/flai/internal/controller/admin/admin_v1_provider_create.go:41)、[删除后直接返回](/Users/eloxt/Developer/eloxt/flai/internal/controller/admin/admin_v1_provider_delete.go:12)。前端列表从数据库读取，但生成使用 `ProviderMap`，只有 update 路径刷新缓存。新增 Provider 可见却无法使用；删除后持有原 ID 的客户端仍可调用旧 Provider 和密钥，直到下一次更新或重启。应在所有变更路径统一刷新/失效缓存，采用 R12 的安全发布方式。

19. **R19 — Chat Completions 适配器完全丢弃附件。**
    位置：[buildMessages](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai_chat.go:303)。函数接受 `files`，但只构造纯文本消息；历史消息里的 files/images 也没有加入请求。用户在支持图片的模型上上传图片后，UI 看似成功，模型实际只收到文字。**隔离探针验证请求 JSON 不含提供的 image URL。** 应构造适配器支持的多模态 content parts，并对无法支持的文件类型明确拒绝。

20. **R20 — Gemini 纯图片结果不会持久化。**
    位置：[saveAndClose 的文本条件](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/gemini.go:551)。当模型只返回 InlineData 图片、没有文本时，图片虽上传并推流，但 `contentType`/文本长度条件不满足，`currentImages` 没有进入 `contentList`。刷新页面后生成图片消失。应按“文本或图片存在”保存内容，并覆盖纯图片和混合输出场景。

21. **R21 — LLM 工具调用创建的 MCP session 从未关闭。**
    位置：[OpenAI MCP 缓存](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai.go:85)、[Chat Completions MCP 缓存](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai_chat.go:46)、[Gemini MCP 缓存](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/gemini.go:178)。三个适配器都按请求创建客户端缓存，却没有逐个 `Close`。聊天生成使用脱离原请求的 context，且成功结束未调用其 cancel，MCP session 的后台连接/读取任务可能持续存活，重复使用工具会积累资源。应在请求完成和异常退出时关闭缓存中的客户端，并释放生成 context。

22. **R22 — 取消生成只校验一个无关会话，未校验目标任务归属。**
    位置：[CancelGeneration 调用](/Users/eloxt/Developer/eloxt/flai/internal/controller/message/message_v1_cancel.go:27)、[仅以消息 ID 建索引](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/generation.go:10)。攻击者提供自己的 conversation_id，即可对任意已知的运行中 assistant_message_id 调用全局取消；创建任务时复用该 ID 也会取消旧任务。应在注册记录中绑定用户、会话、消息 ID，并以这个绑定校验取消和替换。复现前提是知道目标运行中消息 ID。

23. **R23 — 退出登录未清空用户业务状态，切换账号可残留私人内容。**
    位置：[logout](/Users/eloxt/Developer/eloxt/flai/frontend/app/store/auth-store.ts:27)、[全局草稿/附件](/Users/eloxt/Developer/eloxt/flai/frontend/app/store/input-store.ts:67)。退出仅清空 user/tokens，草稿、附件、会话列表和当前消息路径留在其他 store。A 退出后 B 在同一页面登录，可看到 A 的草稿和待发送附件；网络失败时会话列表也可能继续残留。**隔离探针已确认 logout 后草稿、附件 URL 和会话仍存在。** 应在退出和用户身份改变时统一重置用户范围状态，并防止旧请求写回。

24. **R24 — 类型检查未纳入构建，已有 10 处类型错误。**
    位置：[构建脚本](/Users/eloxt/Developer/eloxt/flai/frontend/package.json:6)、[失效的类型导入](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/share.tsx:17)、[旧版 resizable API](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/ui/resizable.tsx:10)。临时 tsc 检查发现：resizable 的 `PanelGroup`/`PanelResizeHandle` 共 5 处错误；sidebar-layout CSS 自定义属性 1 处；share 页面失效导入 1 处、随之产生的 implicit any 2 处、MessageContent 缺少 role 1 处。Vite 转译/打包不会因此失败。应补充 TypeScript 开发依赖和类型检查脚本，修正这些错误并将检查加入构建或 CI。resizable 当前未被业务页面引用，不能把这 5 处错误等同于当前页面已崩溃。

25. **R25 — 刷新后取消收藏，会话从侧栏消失。**
    位置：[toggleFavourite](/Users/eloxt/Developer/eloxt/flai/frontend/app/store/conversation-store.ts:194)。后端普通列表只返回 `Favourite=0`；刷新后收藏会话只存在于 `favouriteConversations`。取消收藏时只从收藏数组移除，并 map 普通数组；没有将该会话加入普通数组，所以它从两边同时消失，需重新加载恢复。应将被取消收藏的记录移入普通列表并维护分页状态。

26. **R26 — 标题生成失败后永久停留在 loading，占用会话操作入口。**
    位置：[generateTitle 错误分支](/Users/eloxt/Developer/eloxt/flai/frontend/app/store/conversation-store.ts:146)、[侧栏按 generating 隐藏操作](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/sidebar.tsx:191)。请求开始设 `generating=true`，只有成功路径设回 false；失败只 toast。网络失败或缺少标题模型配置后，当前会话一直显示 skeleton，重试生成和删除菜单也不显示。应在失败/finally 恢复状态，保留可用标题和重试入口。

27. **R27 — “minimal” 推理选项前后端拼写不一致。**
    位置：[Gemini switch](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/gemini.go:183)、[OpenAI switch](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai.go:109)、[前端选项](/Users/eloxt/Developer/eloxt/flai/frontend/app/components/chat-input.tsx:268)。前端发送 `minimal`，后端两个 switch 都写成 `minial`，导致选中后实际没有设置对应级别。应统一协议枚举并校验未知值；这里不需要增加额外抽象。

28. **R28 — 更新分享不按指定路径排序。**
    位置：[更新分享消息查询](/Users/eloxt/Developer/eloxt/flai/internal/controller/share/share_v1_update.go:63)、[分享页直接按数组渲染](/Users/eloxt/Developer/eloxt/flai/frontend/app/page/share.tsx:145)。create 路径会根据 `message_path` 重排，update 只 `WHERE IN` 后直接持久化。SQL 不保证 IN 列表顺序，存在分支、重试和不同执行计划时，刷新分享会出现消息顺序错乱。应像 create 一样按验证后的路径重排，或为全量查询显式定义顺序。

29. **R29 — 数据库没有邮箱唯一约束，账户邮箱可重复。**
    位置：[user 表定义](/Users/eloxt/Developer/eloxt/flai/init.sql:99)、[管理员更新邮箱](/Users/eloxt/Developer/eloxt/flai/internal/controller/admin/admin_v1_user_update.go:18)。按仓库 schema 部署时，邮箱只有 NOT NULL；注册的“先查后插”不能阻止并发重复，管理员更新也不检查目标邮箱。登录再按邮箱取单个用户，会出现同一邮箱对应多个账户的歧义。应先明确大小写/软删除规则，再建立数据库唯一约束，并将冲突返回业务错误。本项以实际数据库未另加约束为前提。

30. **R30 — 助手消息保存失败仍向用户宣告生成成功。**
    位置：[SaveAssistantMessage 吞掉 Insert 错误](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/client.go:203)、[随后发送 DONE](/Users/eloxt/Developer/eloxt/flai/internal/logic/llm/openai.go:386)。保存函数没有错误返回，数据库断开、写入失败或 assistant_message_id 冲突时只写日志，调用方仍发 `[DONE]`。用户看到完整回答且收到完成通知，刷新后回答消失，下一条消息还可能引用不存在的父消息。应把持久化结果传给调用方，明确报告保存失败并提供可重试路径，不能将完成生成等同于保存成功。

**修复与回归顺序**

先补 R01–R09、R22 的服务端权限与分享边界，再处理 R10–R14 的服务稳定性和不可信输入，之后修复 R15–R21、R23–R30 的状态和功能问题。涉及数据库写入的权限检查应保留在最终 SQL 条件中，多步关联操作使用事务。

回归至少覆盖：A/B 两用户交叉 ID；未激活、停用、降权及 refresh token；过期分享和仅修改有效期；流式过程中切会话、Enter、重试、停止、401 和上游空结果；图片输入及纯图片输出；Provider 新增/删除/并发更新；收藏恢复及保存失败。现有测试不足以替代这些验证。

**已排除的误报**

- 前端 `messagePath`/`mcpTools` 与 Go JSON tag 使用不同命名，但 GoFrame 的实际转换可识别，隔离探针验证能绑定，不列为请求字段丢失。
- `gtime.Time` 的 nil 接收者有相应处理，不能只因可空时间字段调用 `.String()` 就断言 panic。
- `go test -race` 的通过只说明本次执行到的路径未检测出竞争，不代表未覆盖的热更新和断连路径安全。

隔离复现代码与命令输出摘要均来自本机临时目录；它们是审查探针，不是已加入仓库的回归测试。建议修复时将对应断言转为正式测试，并增加数据库隔离环境。
