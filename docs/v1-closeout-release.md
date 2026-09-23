# V1 收口：部署与验收

## 当前状态

代码基于现有项目继续开发；未修改 `.env.local`，未执行远程 migration，未修改 R2 配置或媒体代理。
新增数据库能力必须先在 Supabase 执行下面的 migration。

## 唯一新增 migration

`supabase/migrations/20260923_v1_closeout.sql`

将模型和事务函数放在一个 BEGIN / COMMIT 中，避免拆分部署期间出现“文件父键已变更、清理触发器尚未安装”的窗口。
在现有 20260919/20260921 migrations 已应用的数据库上执行一次。不是重复执行脚本：已成功执行后不要再次执行。SQL 内有 schema cache reload 通知。

它完成：

1. 保留 public.tags 为素材库标签；将现有店铺实际使用过的标签复制到 store_tags（保持 ID），把 store_asset_tags 的外键切到 store_tags。原素材库标签、图片和店铺关系不删除。新的三套标签独立；历史大小写重复标签不自动合并，以免更改历史关联。
2. 新建 handbook_products / handbook_notes / handbook_note_images，固定通用规范；复用 asset_files 与 /api/media。
3. 新建 prompts / prompt_tags / prompt_tag_relations / prompt_favorites；安装 RLS 和 creator 保护触发器。
4. 为 asset_files 增加 handbook_note_id，业务父键删除改为 SET NULL，父对象约束允许临时无父对象。事务结束时回收无父对象且无任何引用的文件元数据；仍有引用的文件保留。
5. 建立 r2_cleanup_queue 和内部清理触发器。完成清理的 key 仍作为 tombstone 保留，避免旧 key 被重新关联到即将删除的对象。
6. 安装双向移动、范围删除、标签批量整理、手册排序/保存、Prompt 保存和搜索 RPC。

此 migration 包含必要的 ALTER TABLE / DROP CONSTRAINT / 外键替换，以及一次复制店铺标签的 INSERT。不会在升级时删除现有资产、图片、Prompt 或 R2 object。业务删除只会在用户之后执行相应操作时发生。DDL 会取得必要表锁，建议在没有上传/编辑进行时应用。

## 权限与一致性

- 应用始终使用当前登录用户的 Supabase client；没有 service role。
- 用户调用的业务 RPC 使用 SECURITY INVOKER，受 RLS 约束。文件 GC / tombstone 仅由内部触发器调用，禁止 authenticated 直接执行；标签使用数 RPC 只允许 admin，返回关联总数，不返回私有 Prompt ID/正文。
- 普通成员可创建三种标签；仅 admin 可以整理、重命名、删除标签。
- 作图规范只允许 admin 修改。通用规范由不可改系统标志及触发器保护。
- 私有 Prompt 的 SELECT 条件只有 created_by=auth.uid()；没有 admin 例外。Favorites 和 tag relations 再次通过 prompts RLS；全局搜索也是 invoker。
- 移动锁住原资产，转移现有文件的父键、重建目标关系，再删除原记录；同一事务提交。文件 ID 与 R2 key 不变；业务 ID 跨两张表保持稳定，用于丢失 RPC 响应时核对是否已提交。真正数据库失败完整回滚；无法确认网络结果时不会错误承诺“原素材未改变”。
- shared 删除“仅从当前店铺移除”只删一条 relation。永久删除两次确认；引用仍存在时保留文件。注意事项/产品删除同理。
- R2 删除不在 PostgreSQL 事务内：先提交安全清理队列，再由服务端清理。失败不回滚已经完成的业务删除，下次删除/手册保存会重试当前用户可见队列，admin 可重试全部可见项。没有新增定时后台 worker。

## 升级前兼容

迁移尚未执行时，已有店铺标签/素材查询使用旧 FK 兼容读取；新标签管理和移动/删除操作不展示。手册/Prompt 显示尚未启用。迁移执行并刷新页面后切换到新模型。避免长期只部署代码不执行 migration。

## 自动验证

- `pnpm test`：全部回归测试（35 项）。
- `pnpm run test:db`：8 项隔离 PostgreSQL（PGlite）测试，包含两个 member 与 admin 的 RLS、原子移动回滚、引用文件保留、清理队列、标签作用域、手册权限。
- PGlite 是开发测试依赖，不用于生产应用。
- 真实 Supabase 的 stores / inspirations / store_assets / shared_assets / workstations / tags / asset_files 及旧关联只读请求通过。请求使用公开客户端权限，没有登录会话；验证的是 schema/query 兼容性，不代表完成了真实登录用户验收。
- 新表只读探测返回 PGRST205，确认远程 migration 尚未执行。

## 人工验收清单（应用 migration 后）

1. 普通成员和 admin 分别登录，检查 Sidebar、Header、/tags 兼容跳转、创作手册隐藏全局 +。
2. /stores 的共享池卡片、店铺全部/主图/副图/A+/共享素材/其他；检查上传默认分类和共享默认关联店铺。
3. 双向移动前后检查同一图片、文件 ID、工作站、标签和三处店铺数量。
4. 共享素材关联两个店铺，仅从一个店铺移除后另一店铺与总池仍存在；再检查永久删除的二次确认。
5. 三套标签创建、大小写重复、上传后自动选中、整理取消、批量提交及删除关联数提示。
6. 作图规范产品 CRUD/排序、通用规范保护、正文多图、图片移除、Lightbox、正文搜索完整上下文。
7. 用两个成员账户和 admin 验证 private Prompt 不可读取/搜索/收藏/直接访问；Team→Private 后其他用户收藏不再显示。
8. Prompt 我的/收藏/标签 AND/搜索交集、完整复制、失败保持输入。
9. 全局搜索的三类素材详情、三种标签链接、店铺、规范定位、Prompt 详情。
10. 1920 / 1440 / 较窄窗口的标签滚动、图片比例、长文字与 Modal。

浏览器自动化未能启动：工具报告 `windows sandbox failed: permission path cannot be represented losslessly`。因此实际浏览器点击、R2 真上传/真删除和远程新 RLS 在 migration 后仍需人工验收，不能以 build 或隔离测试替代。
