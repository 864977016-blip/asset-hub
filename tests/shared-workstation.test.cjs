const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToString } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file);
    const context = { exports: {}, URL, File, FormData, require(name) {if(name==="server-only")return {};if(["@/app/asset-operations","@/app/handbook-actions"].includes(name))return new Proxy({},{get:()=>async()=>{}});
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith('@/') || name.startsWith('./')) {
        const target = name.startsWith('@/') ? path.resolve(root, name.slice(2)) : path.resolve(path.dirname(file), name);
        return load(target + (fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'));
      }
      return require(name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context, { filename: file });
    cache.set(file, context.exports);
    return context.exports;
  }
  return load;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('shared store filters and workstation filters have different semantics', () => {
  const f = loader()('lib/shared-workstation-filters.ts');
  const a = { id: 'a', kind: 'store', store: { id: 'shop-a', name: 'A' } };
  const b = { id: 'b', kind: 'store', store: { id: 'archived', name: '历史店铺', archivedAt: '2026' } };
  const shared = { id: 's', kind: 'shared', stores: [{ id: 'shop-a', name: 'A' }] };
  const general = { id: 'g', kind: 'shared', stores: null };
  assert.deepEqual(plain(f.filterSharedByStore([shared, general], 'shop-a')).map(x => x.id), ['s']);
  assert.deepEqual(plain(f.filterSharedByStore([shared, general], 'general')).map(x => x.id), ['g']);
  assert.deepEqual(plain(f.filterWorkstationByStore([a, b, shared], 'shop-a')).map(x => x.id), ['a']);
  assert.deepEqual(plain(f.filterWorkstationByStore([a, b, shared], 'shared')).map(x => x.id), ['s']);
  assert.equal(f.workstationStoreOptions([a, a, b, shared]).length, 2);
  assert.equal(f.filterSharedByStore(null, 'all').length, 0);
  assert.equal(f.sharedStoreLabel(general), '通用素材');
  assert.equal(f.sharedStoreLabel({ stores: { id: 'shop-a', name: 'A' } }), 'A');
});

function database() {
  const tables = {
    profiles: [{ id: 'u', role: 'admin' }],
    stores: [{ id: 'a', name: 'A', archived_at: null }, { id: 'b', name: 'B', archived_at: null }, { id: 'old', name: 'Old', archived_at: '2026' }],
    workstations: [{ id: 2, current_user_name: '小李', note: '历史备注' }, { id: 5, current_user_name: '小王' }],
    shared_assets: [{ id: 's', asset_type: 'legacy', description: 'old' }],
    shared_asset_stores: [{ shared_asset_id: 's', store_id: 'a' }, { shared_asset_id: 's', store_id: 'old' }],
    shared_asset_workstations: [{ shared_asset_id: 's', workstation_id: 2 }],
    shared_asset_tags: [{ shared_asset_id: 's', tag_id: 'legacy-tag' }],
    asset_files: [], activities: [],
  };
  const calls = [], paths = [], media = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) }, from(table) {
    let operation = 'read', payload, fields = '', conditions = [];
    const q = {
      select(value) { fields = value; return q; },
      eq(key, value) { conditions.push(row => row[key] === value); return q; },
      is(key, value) { conditions.push(row => row[key] === value); return q; },
      in(key, value) { conditions.push(row => value.includes(row[key])); return q; },
      update(value) { operation = 'update'; payload = value; return q; },
      insert(value) { operation = 'insert'; payload = Array.isArray(value) ? value : [value]; return q; },
      delete() { operation = 'delete'; return q; },
      single() { return run(true); },
      then(resolve, reject) { return run(false).then(resolve, reject); },
    };
    async function run(single) {
      calls.push({ table, operation, payload: plain(payload ?? null) });
      let matched = (tables[table] || []).filter(row => conditions.every(check => check(row)));
      if (operation === 'update') matched.forEach(row => Object.assign(row, payload));
      if (operation === 'insert') { matched = payload.map((row, index) => ({ id: table + '-' + index, ...row })); tables[table].push(...matched); }
      if (operation === 'delete') tables[table] = tables[table].filter(row => !matched.includes(row));
      if (fields.includes('stores(')) matched = matched.map(row => ({ ...row, stores: tables.stores.find(store => store.id === row.store_id) || null }));
      return { data: single ? matched[0] || null : matched, error: null };
    }
    return q;
  } };
  const actions = loader({
    '@/lib/supabase/server': { createClient: async () => client },
    'next/cache': { revalidatePath: p => paths.push(p) },
    '@/lib/r2': { optimizeAndUploadImage: async () => { media.push('upload'); return { key: 'image', originalName: 'image.png', mimeType: 'image/png', sizeBytes: 3, width: 1, height: 1 }; }, removeObject: async () => media.push('remove') },
  })('app/actions.ts');
  return { tables, calls, paths, media, actions };
}
function form(values = {}) { const f = new FormData(); for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : [value]) f.append(key, item); return f; }

test('shared metadata edit preserves archived stores, legacy tags/type, and refreshes old/new workstations', async () => {
  const d = database();
  await d.actions.updateSharedAsset('s', form({ store_ids: ['b', 'b'], workstation_ids: ['5'], description: '新备注', tag_ids: 'forged-tag' }));
  assert.deepEqual(d.tables.shared_asset_stores.map(row => row.store_id).sort(), ['b', 'old']);
  assert.deepEqual(d.tables.shared_asset_workstations.map(row => row.workstation_id), [5]);
  assert.equal(d.tables.shared_assets[0].description, '新备注');
  assert.equal(d.tables.shared_assets[0].asset_type, 'legacy');
  assert.equal(d.tables.shared_asset_tags[0].tag_id, 'legacy-tag');
  assert.ok(!d.calls.some(call => call.table === 'shared_asset_tags' || call.table === 'tags'));
  assert.ok(d.paths.includes('/workstations/2') && d.paths.includes('/workstations/5') && d.paths.includes('/shared'));
  assert.deepEqual(d.media, []);
});

test('shared edit supports no stores and refuses new archived selections', async () => {
  const d = database();
  await assert.rejects(d.actions.updateSharedAsset('s', form({ store_ids: ['old'] })), /只能选择未归档店铺/);
  assert.ok(!d.calls.some(call => call.operation === 'update'));
  d.tables.shared_asset_stores = d.tables.shared_asset_stores.filter(row => row.store_id !== 'old');
  await d.actions.updateSharedAsset('s', form());
  assert.equal(d.tables.shared_asset_stores.length, 0);
  assert.equal(d.tables.shared_asset_workstations.length, 0);
  assert.equal(d.tables.shared_asset_tags.length, 1);
});

test('shared upload associates multiple active stores/locations without writing tags', async () => {
  const d = database();
  await d.actions.createSharedAsset(form({ image: new File(['x'], 'image.png', { type: 'image/png' }), store_ids: ['a', 'b'], workstation_ids: ['2', '5'], description: '上传备注', tag_ids: ['ignore'] }));
  const created = d.tables.shared_assets.at(-1);
  assert.equal(created.asset_type, 'other');
  assert.equal(created.description, '上传备注');
  assert.equal(d.tables.shared_asset_stores.filter(row => row.shared_asset_id === created.id).length, 2);
  assert.equal(d.tables.shared_asset_workstations.filter(row => row.shared_asset_id === created.id).length, 2);
  assert.equal(d.tables.shared_asset_tags.length, 1);
});

test('workstation rename is admin-only and updates no notes or asset relations', async () => {
  const d = database();
  await d.actions.updateWorkstation(2, form({ current_user_name: '小赵', note: 'must not overwrite' }));
  assert.equal(d.tables.workstations[0].current_user_name, '小赵');
  assert.equal(d.tables.workstations[0].note, '历史备注');
  assert.equal(d.tables.shared_asset_workstations[0].workstation_id, 2);
  assert.deepEqual(Object.keys(d.calls.find(call => call.operation === 'update').payload), ['current_user_name']);
  d.tables.profiles[0].role = 'member';
  await assert.rejects(d.actions.updateWorkstation(2, form()), /管理员权限/);
});

test('null-safe shared/workstation rendering hides removed fields and preserves existing store details', () => {
  const load = loader({ '@/app/actions': new Proxy({}, { get: () => async () => {} }), 'next/navigation': { useRouter: () => ({ refresh() {} }) } });
  const { AssetBrowser, SharedAssetDetail, StoreAssetDetail } = load('components/asset-browser.tsx');
  const { WorkstationCards } = load('components/workstation-cards.tsx');
  const item = { id: 's', kind: 'shared', tags: null, stores: null, workstations: null, image: null, createdAt: '', note: null };
  for (const kind of ['shared', 'workstation']) assert.doesNotThrow(() => renderToString(React.createElement(AssetBrowser, { assets: [item], tags: null, stores: null, workstations: null, kind })));
  const shared = renderToString(React.createElement(SharedAssetDetail, { item, tags: [], stores: [], workstations: [], onClose() {} }));
  assert.ok(!shared.includes('>标签<') && !shared.includes('>类型<'));
  assert.ok(shared.includes('所属店铺') && shared.includes('通用素材') && shared.includes('备注'));
  const store = renderToString(React.createElement(StoreAssetDetail, { item: { ...item, kind: 'store' }, tags: [], workstations: [], onClose() {} }));
  assert.ok(store.includes('标签') && store.includes('分类'));
  const cards = renderToString(React.createElement(WorkstationCards, { workstations: [{ id: 2, count: 0, previews: null, current_user_name: null }], canEdit: false }));
  assert.ok(cards.includes('暂无素材') && cards.includes('未分配使用人') && cards.includes('/workstations/2'));
  assert.ok(!cards.includes('<input') && !cards.includes('备注'));
});

test('failed images become placeholders and a new image URL can load again', () => {
  let state = null;
  const load = loader({ react: { useState: () => [state, value => { state = value; }] } });
  const { AssetImage } = load('components/asset-image.tsx');
  const props = { src: '/broken', alt: '预览' };
  const first = AssetImage(props); assert.equal(first.type, 'img');
  first.props.onError(); assert.equal(AssetImage(props).type, 'div');
  assert.equal(AssetImage({ ...props, src: '/new' }).type, 'img');
});

test('server data keeps archived ownership, normalizes relation shapes, and sorts latest first', async () => {
  const calls = [];
  const store = { id: 'a', store_id: 'old', asset_category: 'scene', created_at: '2026-01-01', updated_at: '2026-09-22', store: [{ id: 'old', name: '历史店铺', archived_at: '2026-02-01' }], asset_files: { id: 'f1' }, store_asset_tags: null, store_asset_workstations: { workstations: [{ id: '2', current_user_name: null }] } };
  const shared = { id: 's', description: null, created_at: '2026-01-02', updated_at: '2026-09-21', preview_file: [{ id: 'f2' }], shared_asset_stores: { store_id: 'old', stores: null }, shared_asset_workstations: [{ workstations: { id: 2 } }, { workstations: { id: 5 } }] };
  const client = { from(table) {
    const q = { select(fields) { calls.push({ table, fields }); return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, then(resolve, reject) {
      const data = table === 'store_asset_workstations' ? [{ asset: [store] }] : table === 'shared_asset_workstations' ? [{ asset: shared }] : [{ id: 2, current_user_name: null, store_count: [{ count: 9 }], shared_count: { count: 4 }, store_previews: [{ asset: store }], shared_previews: [{ asset: shared }] }];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    } }; return q;
  } };
  const data = loader({ './supabase/server': { createClient: async () => client, isSupabaseConfigured: () => true } })('lib/data.ts');
  const assets = await data.getWorkstationAssets(2);
  assert.equal(assets[0].id, 'a');
  assert.equal(assets[0].store.name, '历史店铺');
  assert.equal(assets[0].workstations[0].id, 2);
  assert.equal(assets[1].stores[0].id, 'old'); // Hidden store relation still is NOT general material.
  assert.equal(assets[1].workstations.length, 2);
  assert.equal(assets[1].tags.length, 0);
  const overview = await data.getWorkstationOverview();
  assert.equal(overview[0].count, 13); // Counts are not the number of limited previews.
  assert.equal(overview[0].previews[0].image, '/api/media/f1');
  assert.equal(overview[0].previews[1].image, '/api/media/f2');
  assert.ok(!calls.some(call => call.fields.includes('inspiration') || call.fields.includes('shared_asset_tags')));
});
