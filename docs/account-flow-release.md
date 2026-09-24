# 账号流程：邀请码注册、多管理员与成员生命周期

本文件替代上一轮“管理员逐个在 Dashboard 创建账号”的日常方案。邮件链接忘记密码、作图规范层级优化保持不变。没有执行远程 SQL、push、部署或修改 Vercel 环境变量。

## 待执行 migration（顺序固定）

1. supabase/migrations/20260923_profile_role_guard.sql
   - 保留上一轮文件，不修改。将现有角色保护函数改为 SECURITY INVOKER，避免 SECURITY DEFINER 下 current_user=postgres 使普通成员自升权。
2. supabase/migrations/20260924_team_invitations.sql
   - 新增邀请码哈希表、管理员生成/查看成员/改角色 RPC。
   - 安装 Auth User 创建前的邀请码校验触发器，创建后 profile 明确写入 member。
   - 新增受保护的管理员数量记录及触发器，保证最后一个 Admin 不会被降级、删除或通过清空 profiles 移除。
   - 添加匿名可读的“注册功能已安装”布尔检查，不泄露任何邀请码或用户数据。

3. supabase/migrations/20260925_member_lifecycle.sql
   - 新增 profiles.is_disabled，既有成员默认正常。
   - 在全部现有业务表叠加 restrictive 活跃成员策略，原有 owner/Admin/private 规则不放宽。
   - 管理员计数只包含正常 Admin；新增停用/重新启用、待交接数量和事务性交接 RPC。

三份均尚未执行；前两份保持原内容，本轮只新增第三份。不要重跑或改动已部署的 20260923_v1_closeout.sql。新 migration 是一次性脚本，整体事务提交；初始化会检查现有至少有一名 Admin，没有 Admin 时事务失败，不会人为指定某个用户。应在没有注册/成员管理进行时按顺序应用。既有业务数据不重写，现有素材/Prompt/店铺 RLS 不放宽。

**务必先应用全部三份 SQL，再开放 signup 和发布本轮应用代码；不能先开启公共 signup 而省略数据库校验。** 新代码在账号状态函数/字段缺失时拒绝进入应用，不会忽略安全检查。注册页在邀请码 migration 未安装时不会展示注册表单，但真正不可绕过的边界是数据库触发器。

## 日常操作

管理员从左下角账号区域的“成员管理 / 邀请码”进入 /members。普通成员看不到该入口，直接进入也会被拒绝，RPC 和数据库同样校验身份。

管理员生成形如 HM-加24位十六进制字符的邀请码。随机熵为96位，比短6位码更难猜测。完整码只在生成时返回一次，管理员复制保存；数据库只存 SHA-256 哈希和不可用于注册的尾码标识。刷新后不能从哈希找回原码，可生成新码。页面列出仍有效的邀请码标识、生成时间和到期时间，时间显示为北京时间。

邀请码由数据库时钟决定期限，固定24小时，不限使用人数、无次数计数，多码可同时有效。过期由每次注册时检查判定，不依赖定时任务或用户电脑时间。普通 Member 没有生成、读取或修改邀请码的权限。

新成员在 /register 只填写用户名、邮箱、密码、邀请码。用户名存 profiles.display_name，邮箱/密码继续由 Supabase Auth 管理。应用不存密码，不使用 service role。

注册元数据可以携带邀请码，但 auth.users BEFORE INSERT 触发器在每个创建路径检查它；失败会回滚 Auth User，不留下可登录的新用户或 profile。校验后从持久化 user metadata 移除邀请码和伪造 role；同时清理 Auth 会另行复制到 auth.identities.identity_data 的邀请码，以及后续 user metadata 更新中的邀请码。创建 profile 固定 member，邀请码永不授予 Admin。直接调用 Supabase signUp 也经过该触发器。

数据库校验对所有新 Auth User 创建路径生效，因此以后不要再把不带邀请码的 Dashboard Create User / Invite User 当日常开户方式；已有账号登录、恢复密码不经过新用户创建触发器，不受影响。其他提供商首次开户若没有邀请码也被拒绝。

## 角色与最后一个 Admin

现有 profiles RLS 和 SECURITY INVOKER 角色保护函数保留，成员无法修改任何人的 role。Server Action 先校验 Admin，RPC 再校验，直接表写入仍受 RLS/触发器限制。

角色变动由触发器原子更新一条数据库管理员计数记录，并以 CHECK(admin_count>=1) 保护。不同用户的并发降级也会争用同一条记录，无法同时减到0；事务失败将角色和计数一起回滚。批量修改、profile删除、Auth User级联删除也覆盖，禁止清空 profiles。普通客户端不能读取/修改计数记录，内部函数不允许直接调用。

多个 Admin 可相互交接：提升 Member、降级其他 Admin；只剩最后一名时不能降级。Member list 的邮箱来自限定 Admin 的 SECURITY DEFINER RPC，只返回 id、用户名、邮箱、角色，没有授予客户端直接访问 auth.users 的权限。Private Prompt 的 Admin 禁读边界保持原样。

## Supabase Dashboard 配置（需要管理员手动完成）

- Authentication → Sign In / Providers：**完成 migration 后开启 Allow new users to sign up**。此时 Auth endpoint 可访问，但数据库邀请码校验禁止无邀请码开户。保留 Email/Password 登录。
- Email provider：建议生产环境开启 Confirm email，验证邮箱归属。代码支持开启时等待确认邮件，也兼容关闭时 Supabase 直接建立会话；两种情况都必须有效邀请码且只能成为 Member。
- Authentication → URL Configuration：
  - Site URL 设置为正式生产 origin，例如 https://你的正式域名。
  - 注册回调：https://你的正式域名/auth/confirm
  - 忘记密码回调：https://你的正式域名/auth/recovery
  - 本地开发分别添加 http://localhost:3000/auth/confirm 和 http://localhost:3000/auth/recovery。
  - 如使用127.0.0.1，再添加相应两个完整地址；预览域名按需单独添加，不开放任意外部域名。
- Authentication → Email Templates：Confirm signup 和 Reset Password 保留默认 {{ .ConfirmationURL }}，不要只跳转 Site URL 或直接跳转表单页。
- Authentication → Email / SMTP Settings：确认 Custom SMTP 可投递给普通业务成员并配置合理限额。Supabase 默认测试邮件服务不能当作生产邮件服务。

无需新增或修改 Vercel 环境变量；redirectTo 使用当前浏览器 origin + 固定回调路径。正式域名尚未提供，上述占位地址需替换。PKCE邮件链接需在申请时的同一浏览器配置中打开。

## 忘记密码保持不变

/login → /forgot-password → Supabase邮件 → /auth/recovery兑换code → /reset-password → updateUser → 返回登录。既有的过期提示、两次密码校验、友好错误和会话保护不改。注册确认使用独立 /auth/confirm，不会把注册用户误送到重置密码页。

## 验证范围

完整测试包含真实隔离 PostgreSQL 的邀请码/Auth创建触发器/角色保护，以及 Auth API mock 的注册、登录、恢复、回调和UI测试。没有发送真实邮件或操作远程账号；上线前仍需人工验证 SMTP、确认邮件、同浏览器回调、真实管理员交接。并发安全依据数据库同一行原子 UPDATE + CHECK，而非浏览器计数；隔离测试覆盖批量降级回滚和最后管理员限制，不宣称完成远程并发压测。

参考：Supabase 官方 [User Management](https://supabase.com/docs/guides/auth/managing-user-data)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

## 成员生命周期

- Admin / Member 均可在左下角点击“退出登录”。调用正式 Supabase signOut，等待成功才跳转 /login；失败保留按钮并提示重试。
- /members 显示正常/已停用。停用仅修改 profile 状态，不删除 Auth User，不要求接收人。Admin 可简单重新启用，角色沿用原角色。已停用 Admin 不计入有效管理员数量。
- 停用后的 Private Prompt 留在原表、原作者名下，无需搬到新表。“待交接”是已停用作者的 private 记录数量；Admin 只能看数量，原有读取策略仍禁止管理员查看他人的 private 正文。
- 后续交接锁定原成员、接收人及执行者的 profile，再检查执行者是正常 Admin、原成员已停用、接收人正常。单条事务更新全部 private 的 created_by，只返回条数；任何异常使全部更新回滚。保留 prompt ID、内容、标签，收藏记录不改动，团队 Prompt 不转作者。
- 重新启用前未交接的数据重新按原作者权限可见；已经交接的数据不会倒转回去。
- 团队素材、历史作者和工作站位置关系均不修改。工作站“当前使用人”继续由现有编辑功能手动维护。
- 最后一个有效管理员由共享计数行的原子 UPDATE + CHECK(admin_count>=1) 保护，包含角色、停用/启用、删除和批量变化；UI 的按钮禁用只是提示。

## 旧 Session 与实现边界

is_active_member() 每次从数据库读取账号状态，RLS 不相信 JWT metadata 中的角色/状态。业务表的 restrictive policy 与旧策略取 AND，停用后的旧 JWT 同样无法读写；Admin RPC 也要求当前有效 Admin。统一 Server Action session 校验、中间件、登录后检查及图片请求入口共同拒绝停用账号。图片响应改用 private, no-store，R2 内容、上传及清理逻辑不变。

这不是远程撤销全部设备的 JWT。Supabase Auth 仍可能接受停用账号的密码并签发令牌，但它不能通过应用入口或数据库业务权限检查。重置密码也不会重新启用账号。已发送到浏览器的内容、已经下载的图片及停用提交前已开始的数据库快照不能追回；之前版本缓存过的图片也不能远程删除。重新启用后原本仍有效的会话可以再次访问。

Supabase 的 [signOut 文档](https://supabase.com/docs/guides/auth/signout) 也说明，撤销会话的 access token 在到期前仍可能有效；账号停用的立即业务封禁依靠数据库状态，而非宣称令牌已销毁。

## 上线前人工验收

本轮不执行 SQL、不改 Dashboard/Vercel、不 push、不部署。Dashboard 的 signup 仍维持你此前说明的关闭状态。账号停用本身不需要额外 Dashboard 设置；前三份 migration 和上文 Email/URL/SMTP 设置仍需你按计划完成。

准备两个正常 Admin、普通 Member 和接收人，用不同浏览器登录：验证退出后重新访问受保护页、停用后旧会话请求被拒、重新登录受阻、最后有效 Admin 不可降级/停用、重新启用、Private Prompt 延后交接与接收人可见、原作者不可见、团队数据和收藏不转移。继续验证真实邀请注册及邮件确认/密码恢复、移动宽度 Sidebar 和成员列表/交接 Modal。未进行远程数据库并发压测或真实 SMTP 验证；自动测试中的 Auth API 使用 mock，数据库使用隔离 PGlite。

## 本轮文件清单与本地结果

新增：
- components/sign-out-button.tsx
- supabase/migrations/20260925_member_lifecycle.sql

在上一轮基础上修改：
- app/actions.ts
- app/search-actions.ts
- app/member-actions.ts
- app/members/page.tsx
- app/login/page.tsx
- app/login/login-form.tsx
- app/api/media/[fileId]/route.ts
- app/api/inspirations/[id]/image/route.ts
- components/sidebar-nav.tsx
- components/member-management.tsx
- lib/action-utils.ts
- lib/team-members.ts
- middleware.ts
- tests/auth-flow.test.cjs
- tests/home.test.cjs
- tests/shared-workstation.test.cjs
- tests/v1-closeout.test.cjs
- tests/v1-database.test.cjs
- docs/account-flow-release.md

保留上一轮作图规范 UI、注册和邮件恢复文件；未修改前两份待执行 migration 或已部署 migration。

最终结果：pnpm test **69/69 通过**，其中隔离数据库测试18项；node node_modules/typescript/bin/tsc --noEmit 通过；pnpm run build 通过。git diff --check 无错误。未做真实线上浏览器验收。
