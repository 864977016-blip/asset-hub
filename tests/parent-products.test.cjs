const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,overrides={}){const cache=new Map();function read(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const ctx={exports:{},File,FormData,URL,console:{error(){}},require(id){if(id in overrides)return overrides[id];if(id==='server-only')return {};if(id.startsWith('@/')||id.startsWith('./')){const p=id.startsWith('@/')?path.resolve(id.slice(2)):path.resolve(path.dirname(file),id);return read(p+(fs.existsSync(p+'.tsx')?'.tsx':'.ts'))}return require(id)}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);cache.set(file,ctx.exports);return ctx.exports}return read(file)}
function fixture({rpcError=null,parentValid=true,admin=true}={}){
 const calls=[],removed=[],image={key:'stores/s/logo/new.webp',originalName:'image.png',mimeType:'image/webp',sizeBytes:10,width:20,height:20};let uploads=0,cleanup=0;
 const s={rpc:async(name,args)=>{calls.push({rpc:name,args});return {data:2,error:rpcError}},from(table){let op='select',payload;const filters=[];const b={select(){return b},insert(p){op='insert';payload=p;return b},update(p){op='update';payload=p;return b},delete(){op='delete';return b},eq(k,v){filters.push([k,v]);return b},is(){return b},in(){return b},order(){return b},single:async()=>result(),maybeSingle:async()=>result(),then:(ok,bad)=>Promise.resolve(result()).then(ok,bad)};function result(){calls.push({table,op,payload,filters});return {error:null,data:table==='parent_products'?(parentValid?{id:'p'}:null):table==='stores'?{id:'s'}:table==='store_assets'?{id:'a',store_id:'s'}:[]}}return b}};
 const actions=load('app/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>s},'@/lib/action-utils':{session:async(adminOnly)=>{if(adminOnly&&!admin)throw Error('permission denied');return{s,user:{id:'u'}}},fail:e=>{throw e},drainCleanup:async()=>cleanup++},'@/lib/r2':{optimizeAndUploadImage:async()=>{uploads++;return image},removeObject:async key=>removed.push(key)}});
 return {actions,calls,removed,get uploads(){return uploads},get cleanup(){return cleanup}};
}
function form(parent){const f=new FormData();f.set('image',new File(['image'],'image.png',{type:'image/png'}));f.set('category','main');if(parent!==undefined)f.set('parent_product_id',parent);return f}
test('upload supports optional parent and rejects wrong-store parent before creating or uploading',async()=>{
 for(const p of [undefined,'p']){const h=fixture();await h.actions.uploadStoreAsset('s',form(p));assert.equal(h.calls.find(c=>c.table==='store_assets'&&c.op==='insert').payload.parent_product_id,p??null);assert.equal(h.uploads,1);if(p)assert.deepEqual(h.calls.find(c=>c.table==='parent_products').filters,[['id','p'],['store_id','s']]);}
 const h=fixture({parentValid:false});await assert.rejects(h.actions.uploadStoreAsset('s',form('foreign')),/父体/);assert.equal(h.uploads,0);assert.equal(h.calls.some(c=>c.table==='store_assets'),false);
});
test('single edit assigns, replaces, clears parent; omitted control preserves legacy caller ownership',async()=>{
 for(const p of ['p','other','',undefined]){const h=fixture();await h.actions.updateStoreAsset('a',form(p));const change=h.calls.find(c=>c.table==='store_assets'&&c.op==='update').payload;assert.equal(change.asset_category,'main');if(p===undefined)assert.equal('parent_product_id' in change,false);else assert.equal(change.parent_product_id,p||null);assert.equal(h.calls.some(c=>c.table==='store_asset_tags'&&c.op==='delete'),false);assert.equal(h.uploads,0);assert.equal(h.removed.length,0);}
});
test('batch uses one transaction RPC, cleanup once only after successful delete and no cleanup on failure',async()=>{
 for(const op of ['set_parent','clear_parent','category','add_tags','remove_tags','delete']){const h=fixture();assert.equal(await h.actions.batchStoreAssets('s',['a','a','b'],op,'p',['t']),2);assert.equal(h.calls.length,1);assert.equal(h.calls[0].rpc,'v4_batch_store_assets');assert.equal(h.cleanup,op==='delete'?1:0);}
 const bad=fixture({rpcError:{code:'P0001',message:'raw internal detail'}});await assert.rejects(bad.actions.batchStoreAssets('s',['a'],'delete'),/未对素材进行部分修改/);assert.equal(bad.cleanup,0);
 const unknown=fixture({rpcError:{code:'',message:'network'}});await assert.rejects(unknown.actions.batchStoreAssets('s',['a'],'delete'),/结果暂时无法确认/);
});
test('logo uses atomic RPC, compensates confirmed rollback only, never deletes on unknown commit outcome',async()=>{
 const logo=new FormData();logo.set('logo',new File(['png'],'logo.png'));
 const h=fixture();await h.actions.setStoreLogo('s',logo);assert.equal(h.calls.length,1);assert.equal(h.calls[0].rpc,'v4_set_store_logo');assert.equal(h.cleanup,1);assert.equal(h.removed.length,0);
 await h.actions.removeStoreLogo('s');assert.equal(h.calls[1].args.p_file,null);assert.equal(h.cleanup,2);
 const bad=fixture({rpcError:{code:'23503'}});await assert.rejects(bad.actions.setStoreLogo('s',logo));assert.equal(bad.removed.length,1);assert.equal(bad.cleanup,0);
 const unknown=fixture({rpcError:{code:'',message:'timeout'}});await assert.rejects(unknown.actions.setStoreLogo('s',logo));assert.equal(unknown.removed.length,0);
 const member=fixture({admin:false});await assert.rejects(member.actions.setStoreLogo('s',logo));assert.equal(member.uploads,0);
});
test('StoreIdentity falls back on error and retries a changed Logo URL',()=>{
 let state=null;const identity=load('components/store-identity.tsx',{react:{useState:()=>[state,v=>state=v]}}).StoreIdentity;
 let node=identity({name:'AMOISE',logo:null});assert.equal(node.type,'span');node=identity({name:'AMOISE',logo:'/a'});assert.equal(node.type,'img');assert.match(node.props.className,/object-contain/);node.props.onError();assert.equal(identity({name:'AMOISE',logo:'/a'}).type,'span');assert.equal(identity({name:'AMOISE',logo:'/b'}).type,'img');
});
test('new migration statically preserves three tag pools, composite integrity, active RLS, transactional delete and GC',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260928_parent_products_store_logos.sql','utf8');assert.equal((sql.match(/create table public\./g)||[]).length,3);assert.match(sql,/begin;/);assert.match(sql,/commit;/);assert.match(sql,/foreign key\(parent_product_id,store_id\)[\s\S]*?on delete set null \(parent_product_id\)/);assert.match(sql,/foreign key\(manual_cover_asset_id,id\)/);assert.equal((sql.match(/as restrictive for all/g)||[]).length,3);assert.ok(sql.includes("perform public.v1_delete_asset('store',asset_id,null)"));assert.match(sql,/raw limit[\s\S]*?cardinality\(p_asset_ids\)>1000[\s\S]*?business limit[\s\S]*?total>100/);assert.ok(sql.includes('array_agg(distinct x)'));assert.match(sql,/logo_file_id=p_id/);assert.match(sql,/v4_set_store_logo[\s\S]*?security definer[\s\S]*?jsonb_typeof\(p_file->'originalName'\)[\s\S]*?safe_file_size<=0 or safe_width<=0 or safe_height<=0/);assert.match(sql,/coalesce\([\s\S]*?a\.id=p\.manual_cover_asset_id and a\.parent_product_id=p\.id and a\.store_id=p\.store_id[\s\S]*?a\.asset_category='main'[\s\S]*?order by a\.created_at desc/);assert.doesNotMatch(sql,/alter table public\.(tags|store_tags|prompt_tags)|site_branding|drop table/);
});
test('store-only Masonry keeps A+ natural ratio; parent detail excludes Shared category',()=>{
 const s=fs.readFileSync('components/asset-browser.tsx','utf8');assert.ok(s.includes('kind === "store" ? "inspiration-masonry"'));assert.match(s,/className="block h-auto w-full rounded-xl"/);assert.match(s,/break-inside-avoid/);assert.ok(s.includes('parentOnly?[]'));assert.match(s,/item.kind!=="shared"/);assert.match(s,/bg-black\/55[\s\S]*?\{label\}/);assert.match(s,/options=\{parents\}/);assert.doesNotMatch(s,/kind==="store"[\s\S]{0,300}<p className="p-4/);
 const p=fs.readFileSync('components/parent-product-browser.tsx','utf8');assert.match(p,/parents\.find\(parent=>parent\.id===initialParent\)/);assert.match(p,/删除父体不会删除其中的素材/);assert.match(p,/恢复自动封面/);
});
test('product type aggregation composes with categories and excludes unclassified/shared assets',()=>{
 const {filterStoreAssetsByProductType}=load('lib/asset-filters.ts');
 const assets=[{id:'main',kind:'store',parentProductId:'wood',assetCategory:'main'},{id:'scene',kind:'store',parentProductId:'wood',assetCategory:'scene'},{id:'plus',kind:'store',parentProductId:'multi',assetCategory:'a_plus'},{id:'none',kind:'store',parentProductId:null,assetCategory:'main'},{id:'shared',kind:'shared'}];
 const parents=[{id:'wood',tags:[{id:'wood'}]},{id:'multi',tags:[{id:'metal'},{id:'wood'}]},{id:'empty',tags:[]}];
 assert.equal(filterStoreAssetsByProductType(assets,'all','',parents).length,5);
 assert.deepEqual(filterStoreAssetsByProductType(assets,'all','wood',parents).map(x=>x.id),['main','scene','plus']);
 assert.deepEqual(filterStoreAssetsByProductType(assets,'main','wood',parents).map(x=>x.id),['main']);
 assert.deepEqual(filterStoreAssetsByProductType(assets,'scene','wood',parents).map(x=>x.id),['scene']);
 assert.deepEqual(filterStoreAssetsByProductType(assets,'a_plus','wood',parents).map(x=>x.id),['plus']);
 assert.deepEqual(filterStoreAssetsByProductType(assets,'shared','',parents).map(x=>x.id),['shared']);
});
test('parent preview uses cover first, removes duplicates and caps every collage at four',()=>{
 const {parentPreviewImages}=load('lib/parent-preview.ts');
 const parent=images=>({cover:images[0]??null,assets:images.slice(1).map((image,id)=>({id:String(id),image}))});
 for(let count=0;count<=4;count++)assert.equal(parentPreviewImages(parent(Array.from({length:count},(_,i)=>'/'+i))).length,count);
 assert.deepEqual([...parentPreviewImages({cover:'/cover',assets:[{image:'/a'},{image:'/cover'},{image:'/b'},{image:'/c'},{image:'/d'}]})],['/cover','/a','/b','/c']);
});
test('parent UI is single product type, keeps detail categories and removes store-tag entry points',()=>{
 const parent=fs.readFileSync('components/parent-product-browser.tsx','utf8'),browser=fs.readFileSync('components/asset-browser.tsx','utf8'),upload=fs.readFileSync('components/image-upload-forms.tsx','utf8'),batch=fs.readFileSync('components/store-batch.tsx','utf8'),commands=fs.readFileSync('components/asset-commands.tsx','utf8');
 assert.match(parent,/标签（可选）<select name="product_tag_ids"/);assert.doesNotMatch(parent,/type="checkbox" name="product_tag_ids"|产品类型（可选）/);assert.doesNotMatch(parent,/产品标签：/);assert.match(parent,/data-preview-count/);
 assert.match(browser,/!parentOnly&&category!=="shared"/);assert.match(browser,/if\(value==="shared"\)setSelectedProductTag\(""\)/);for(const source of [browser,upload,commands])assert.doesNotMatch(source,/TagEditor scope="store"/);assert.doesNotMatch(batch,/添加标签|移除标签/);
});
test('legacy store tag links are ignored instead of entering the product type filter',()=>{
 const browser=fs.readFileSync('components/asset-browser.tsx','utf8'),search=fs.readFileSync('components/search-bar.tsx','utf8'),stores=fs.readFileSync('app/stores/page.tsx','utf8');
 assert.match(browser,/productTags\.some\(tag=>tag\.id===initialTag\)\?initialTag:""/);assert.doesNotMatch(search,/店铺素材标签/);assert.doesNotMatch(stores,/getStoreIdsForTag|\?tag=/);
});
test('product tag editor stays admin-gated and parent collection cards are square, dense and footerless',()=>{
 const tools=fs.readFileSync('components/product-tag-create.tsx','utf8'),parent=fs.readFileSync('components/parent-product-browser.tsx','utf8'),browser=fs.readFileSync('components/asset-browser.tsx','utf8');
 assert.match(tools,/profile\.role!=="admin"/);assert.match(tools,/manageProductTag\(tag\.id,tag\.name\.trim\(\)\)/);assert.match(tools,/manageProductTag\(tag\.id,undefined,true\)/);assert.match(tools,/>取消<|>完成</);
 assert.match(browser,/ProductTagEditor tags=\{allProductTags\}/);assert.match(parent,/aspect-square/);assert.match(parent,/repeat\(auto-fill,minmax\(16rem,1fr\)\)/);assert.doesNotMatch(parent,/content-grid grid-three|shadow-card|bg-white/);
});
test('store detail resolves parent product tags and parent selector keeps the tag hint in sync',()=>{
 const browser=fs.readFileSync('components/asset-browser.tsx','utf8'),selector=fs.readFileSync('components/parent-selector.tsx','utf8');
 assert.match(browser,/parents\?\.find\(value=>value\.id===item\.parentProductId\)\?\?item\.parentProduct/);assert.match(browser,/label="父体">\{parent\?\.name\|\|"未归类"\}/);assert.match(browser,/label="标签">\{parent\?\.tags\.map/);assert.doesNotMatch(browser,/store \? "上传时间"/);
 assert.match(selector,/value=\{value\} onChange=\{event=>setValue\(event\.target\.value\)\}/);assert.match(selector,/标签：\{active\?\.tags\?\.map/);assert.match(browser,/options=\{parents\} showTag/);
});
test('parent summaries use database count and cover rather than truncated client assets',async()=>{
 const calls=[],s={rpc:async(name,args)=>{calls.push({name,args});return {data:[{id:'p',asset_count:1500,cover_file_id:'f'}],error:null}},from(){const q={select(){return q},eq(k,v){calls.push([k,v]);return q},order:async()=>({data:[{id:'p',store_id:'s',name:'Parent',created_by:'u',parent_product_tags:[]}],error:null})};return q}};
 const data=load('lib/data.ts',{'@/lib/supabase/server':{isSupabaseConfigured:()=>true,createClient:async()=>s},'./supabase/server':{isSupabaseConfigured:()=>true,createClient:async()=>s}});
 const rows=await data.getParentProducts('s',[]);assert.equal(rows[0].assetCount,1500);assert.equal(rows[0].cover,'/api/media/f');assert.ok(calls.some(c=>c.name==='v4_parent_summaries'&&c.args.p_store_id==='s'));
});
