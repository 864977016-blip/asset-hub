# V1 收口 Phase 0 审计（2026-09-22）

- 路由：/、/library、/shared、/stores、/stores/[id]、/workstations、/workstations/[id]、/tags、/login；两条 authenticated 图片代理。
- 表：profiles、stores、inspirations、store_assets、shared_assets、asset_files、tags、activities、workstations 及 tag/store/workstation 关系表。
- tags 当前混用：inspiration_tags、store_asset_tags 引用 public.tags；shared_asset_tags 为历史数据且已无用户界面。保留 tags 作为素材库池，建立 store_tags 并迁移原店铺标签引用；Prompt 使用独立 prompt_tags。
- Store ↔ Shared：shared_asset_stores 复合主键保证唯一关联，店铺 data layer 已聚合两种资产。类别数据库 scene 保留兼容，只把展示名改为副图。
- 文件：asset_files exactly_one_parent(store_asset_id,shared_asset_id,store_id)；preview/cover FK 引用文件。转移必须先切换文件父对象再删源资产，使用 security invoker PostgreSQL RPC 原子事务。手册增加 note 父对象及图片关联。
- RLS：资产所有者/admin 可修改；文件管理跟随业务所有者；素材和关联 authenticated 可读；stores 写入 admin；tags 写入当前仅 admin。
- 搜索：已登录 server action，五类最多各 6 条、300ms；拓展手册与 Prompt，使用相同 user client。
- role：profiles.role + public.is_admin()；目前部分资产编辑 UI 未隐藏无权限按钮，需统一 current-user context。
- 已实现：R2/Sharp、媒体代理、三类详情编辑、工作站、全局上传、瀑布流、关联共享素材聚合、activity best effort。
- UI 变更：导航收口、共享池卡片、分类、局部上传上下文、横向标签及整理、移动/删除确认、手册/Prompt、状态收口。
- 必要 migration：store_tags/标签操作；手册及 Prompt 表/RLS/事务函数；文件生命周期及移动/删除事务。不可修改 .env.local、不执行远程 DDL。
- 新 actions/queries：标签池创建/批量整理，资产移动/删除/解除关联，手册产品/事项/顺序/参考图片，Prompt CRUD/favorite，权限感知搜索。
- 文件清理：数据库仅在文件无任何业务引用时移除元数据并写入清理队列；服务端按队列清理 R2。失败保留队列可重试，不误删其他业务引用。
- 验证：增加隔离 PostgreSQL 测试（若可用），模拟至少两位 member + admin 验证 private Prompt 不被 admin/favorite/direct ID 搜索绕过；远程只读；最后 build。
