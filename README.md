# Asset Hub

图片优先的设计团队素材工具。第一阶段为 Stitch 视觉基线的可运行前端与模拟数据；后续接入 Supabase Auth/PostgreSQL、Cloudflare R2 与 Vercel。

## Start

```bash
npm install
npm run dev
```

## Architecture decisions

- 灵感 (`inspirations`) 与店铺资产 (`store_assets` + `asset_files`) 为独立数据域，禁止混存。
- 8 个工作站为固定 ID；资产仅关联 ID，界面始终展示当前使用人。
- 大文件放 Cloudflare R2，Supabase PostgreSQL 只保存元数据和对象键。
- V1 使用 Supabase 原生 SQL schema（`supabase/schema.sql`），不引入 Prisma；此规模下它会额外增加迁移与服务端连接层复杂度。
