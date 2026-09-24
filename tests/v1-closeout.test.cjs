const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test'),ts=require('typescript'),React=require('react'),{renderToString}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function loader(overrides={},globals={}){const cache=new Map();return function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const ctx={exports:{},File,FormData,URL,process:{env:{NODE_ENV:'test'}},...globals,require(name){if(name==="server-only")return {};if(["@/app/asset-operations","@/app/handbook-actions"].includes(name))return new Proxy({},{get:()=>async()=>{}});if(Object.hasOwn(overrides,name))return overrides[name];if(name.startsWith('@/')||name.startsWith('./')){const target=name.startsWith('@/')?path.resolve(root,name.slice(2)):path.resolve(path.dirname(file),name);return load(target+(fs.existsSync(target+'.tsx')?'.tsx':'.ts'));}return require(name)}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx,{filename:file});cache.set(file,ctx.exports);return ctx.exports;};}
const plain=value=>JSON.parse(JSON.stringify(value));

test('member management entry is admin-only and last admin action is disabled in the lightweight list',()=>{
 const load=uiLoader(),{SidebarNav}=load('components/sidebar-nav.tsx');
 const sidebar=role=>renderToString(React.createElement(SidebarNav,{active:'首页',profile:{id:'u',displayName:'User',role},stores:[]}));
 assert.ok(sidebar('member').includes('退出登录'));assert.ok(sidebar('admin').includes('退出登录'));assert.ok(!sidebar('member').includes('/members'));assert.ok(sidebar('admin').includes('/members'));
 const {MemberManagement}=load('components/member-management.tsx');
 const html=renderToString(React.createElement(MemberManagement,{members:[{id:'u',display_name:'Admin',email:'admin@example.test',role:'admin'}],invitations:[],currentUserId:'u'}));
 assert.ok(html.includes('生成邀请码'));assert.ok(html.includes('至少保留一名正常状态的管理员'));assert.ok(html.includes('disabled=""'));assert.ok(html.includes('admin@example.test'));
});

test('handbook directory keeps general and product heading peers with indented product actions',()=>{
 const load=uiLoader();const {TeamProvider}=load('components/team-context.tsx'),{HandbookBrowser}=load('components/handbook-browser.tsx');
 const products=[{id:'general',name:'通用规范',general:true,notes:[]},{id:'product',name:'产品 A long name',general:false,notes:[]}];
 const render=role=>renderToString(React.createElement(TeamProvider,{ready:true,profile:{id:'u',displayName:'用户',role},tags:[],storeTags:[],promptTags:[]},React.createElement(HandbookBrowser,{products,initialProduct:'product'})));
 for(const role of ['member','admin']){
  const html=render(role),nav=html.split('aria-label="作图规范目录"')[1].split('</nav>')[0];
  assert.ok(nav.includes('text-sm font-semibold'));assert.ok(nav.includes('<h2 class="px-3 py-3 text-sm font-semibold text-ink">产品规范</h2>'));
  const group=nav.split('aria-label="产品规范"')[1];assert.ok(!group.includes('通用规范'));assert.ok(group.includes('ml-4 min-w-0'));assert.ok(group.includes('aria-current="page"'));assert.ok(group.includes('text-sm font-normal'));assert.equal(group.includes('+ 新建产品'),role==='admin');
 }
});

test('non-owner shared removal entry appears only in an associated store context',()=>{
 const load=uiLoader();const {TeamProvider}=load('components/team-context.tsx'),{AssetCommands}=load('components/asset-commands.tsx');
 const render=(kind,currentStore,role='member')=>renderToString(React.createElement(TeamProvider,{ready:true,profile:{id:'b',displayName:'B',role},tags:[],storeTags:[],promptTags:[]},React.createElement(AssetCommands,{kind,item:{id:'a',createdBy:'a',stores:[{id:'s',name:'Store'}]},currentStore,onClose(){}})));
 assert.ok(render('shared',{id:'s',name:'Store'}).includes('素材操作'));
 assert.equal(render('shared',undefined),'');assert.equal(render('shared',{id:'other',name:'Other'}),'');assert.equal(render('store',{id:'s',name:'Store'}),'');
 assert.ok(render('shared',undefined,'admin').includes('素材操作'));
});

const nav={useRouter:()=>({refresh(){}}),usePathname:()=>'/handbook'};
function uiLoader(extra={}){return loader({'next/navigation':nav,'@/app/actions':new Proxy({},{get:()=>async()=>{}}),'@/app/search-actions':{searchAll:async()=>({})},...extra});}
test('prompt mode, tag AND and content/tag search compose as intersections with null safety',()=>{
 const f=loader()('lib/handbook-filters.ts');const items=[{id:'a',createdBy:'u',visibility:'private',favorite:true,content:'mirror scene',tags:[{id:'mj',name:'MJ'},{id:'light',name:'Light'}]},{id:'b',createdBy:'other',visibility:'team',favorite:true,content:'mirror',tags:[{id:'mj',name:'MJ'}]},{id:'c',createdBy:'u',visibility:'team',favorite:false,content:'plain',tags:[{id:'light',name:'Light'}]}];
 assert.deepEqual(plain(f.filterPrompts(items,'mine','mirror',['mj','light'],'u').map(p=>p.id)),['a']);assert.deepEqual(plain(f.filterPrompts(items,'favorites','mj',[],'u').map(p=>p.id)),['a','b']);assert.equal(f.filterPrompts(items,'all','mirror',['missing'],'u').length,0);assert.equal(f.filterPrompts(null,'all','',null).length,0);assert.equal(f.canManagePrompt(items[0],'other',true),false);assert.equal(f.canManagePrompt(items[1],'u',true),true);
});
test('handbook note search keeps the complete product context',()=>{
 const f=loader()('lib/handbook-filters.ts');const p={id:'p',name:'镜子',notes:[{id:'1',content:'matching mirror'},{id:'2',content:'other rule'}]};assert.equal(f.filterHandbook([p],'mirror')[0].notes.length,2);assert.equal(f.filterHandbook([p],'镜子').length,1);assert.equal(f.filterHandbook(null,'x').length,0);
});
test('handbook and prompt UI hide management for members, preserve admin/private boundary and tolerate null relations',()=>{
 const load=uiLoader();const {TeamProvider}=load('components/team-context.tsx'),{HandbookBrowser}=load('components/handbook-browser.tsx'),{PromptBrowser}=load('components/prompt-browser.tsx');
 const wrap=(role,child)=>React.createElement(TeamProvider,{ready:true,profile:{id:'u',displayName:'用户',role},tags:[],storeTags:[],promptTags:[]},child);
 const product={id:'p',name:'产品',general:false,notes:[{id:'n',content:'正文',images:null}]};
 const member=renderToString(wrap('member',React.createElement(HandbookBrowser,{products:[product]})));assert.ok(!member.includes('+ 添加注意事项'));assert.ok(!member.includes('产品操作'));assert.ok(member.includes('正文'));
 const admin=renderToString(wrap('admin',React.createElement(HandbookBrowser,{products:[product]})));assert.ok(admin.includes('+ 添加注意事项'));assert.ok(admin.includes('产品操作'));
 const general=renderToString(wrap('admin',React.createElement(HandbookBrowser,{products:[{...product,general:true,name:'通用规范'}]})));assert.ok(!general.includes('产品操作'));
 const prompt={id:'x',createdBy:'other',content:'long prompt',visibility:'team',favorite:false,tags:[]};const normal=renderToString(wrap('member',React.createElement(PromptBrowser,{items:[prompt],tags:[]})));assert.ok(!normal.includes('提示词操作'));assert.ok(normal.includes('新建提示词'));
 const adminPrompt=renderToString(wrap('admin',React.createElement(PromptBrowser,{items:[prompt],tags:[]})));assert.ok(adminPrompt.includes('提示词操作'));
 for(const empty of [null,undefined,[null],[]]){assert.doesNotThrow(()=>renderToString(wrap('member',React.createElement(HandbookBrowser,{products:empty}))));assert.doesNotThrow(()=>renderToString(wrap('member',React.createElement(PromptBrowser,{items:empty,tags:[]}))));}
});
test('tag editors stay in their own pool; members create but cannot organize',()=>{
 const load=uiLoader();const {TeamProvider}=load('components/team-context.tsx'),{ScopedTagEditor,TagOrganizer}=load('components/tag-tools.tsx');
 const value={ready:true,profile:{id:'u',displayName:'用户',role:'member'},tags:[{id:'i',name:'灵感独有'}],storeTags:[{id:'s',name:'店铺独有'}],promptTags:[{id:'p',name:'Prompt独有'}]};
 for(const [scope,name] of [['inspiration','灵感独有'],['store','店铺独有'],['prompt','Prompt独有']]){const html=renderToString(React.createElement(TeamProvider,value,React.createElement(ScopedTagEditor,{scope})));assert.ok(html.includes(name));assert.equal(['灵感独有','店铺独有','Prompt独有'].filter(n=>html.includes(n)).length,1);assert.ok(html.includes('新建标签'));}
 assert.equal(renderToString(React.createElement(TeamProvider,value,React.createElement(TagOrganizer,{scope:'store'}))), '');
});
test('handbook Header hides global plus; final sidebar contains no shared/tag/settings entry',async()=>{
 const load=uiLoader({'@/lib/data':{getV1Ready:async()=>true,getSidebarData:async()=>({profile:{displayName:'用户',role:'member'},stores:[]}),getTags:async()=>[],getWorkstations:async()=>[],getActiveStoreOptions:async()=>[]}});
 const html=renderToString(await load('components/app-shell.tsx').AppShell({active:'创作手册',children:'rules'}));assert.ok(!html.includes('aria-label="新增素材"'));assert.ok(html.includes('搜索灵感、资产、标签'));assert.ok(html.includes('href="/handbook"'));assert.ok(!html.includes('href="/shared"'));assert.ok(!html.includes('href="/tags"'));assert.ok(!html.includes('>设置<'));
});
test('move reconciles a lost committed response while confirmed transaction failure retains original',async()=>{
 for(const scenario of ['rollback','committed']){let refreshed=0;const client={rpc:async()=>({error:{message:'connection lost'}}),from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({error:null,data:table===(scenario==='rollback'?'store_assets':'shared_assets')?{id:'a'}:null})};return q;}};const actions=loader({'@/lib/action-utils':{session:async()=>({s:client}),refreshAssets:()=>refreshed++,fail:e=>{throw e},drainCleanup:async()=>{}}},{console:{error(){}}})('app/asset-operations.ts');if(scenario==='rollback'){await assert.rejects(actions.moveAsset('store','a',new FormData()),/移动失败，原素材未改变/);assert.equal(refreshed,0)}else{await actions.moveAsset('store','a',new FormData());assert.equal(refreshed,1)}}
});

test('member list distinguishes disabled status, pending counts and last active admin without exposing private content',()=>{
 const load=uiLoader(),{MemberManagement}=load('components/member-management.tsx');
 const html=renderToString(React.createElement(MemberManagement,{members:[{id:'a',display_name:'ActiveAdmin',email:'a@test',role:'admin',is_disabled:false,pending_private_count:0},{id:'b',display_name:'DisabledAdmin',email:'b@test',role:'admin',is_disabled:true,pending_private_count:3}],invitations:[],currentUserId:'a'}));
 assert.ok(html.replace(/<!--.*?-->/g,'').includes('Admin · 正常'));assert.ok(html.replace(/<!--.*?-->/g,'').includes('Admin · 已停用'));assert.ok(html.includes('待交接 Private Prompt'));assert.ok(html.includes('重新启用'));assert.ok(html.includes('交接数据'));assert.ok(html.includes('至少保留一名正常状态的管理员'));
 assert.equal((html.match(/设为普通成员/g)||[]).length,1);assert.equal((html.match(/停用成员/g)||[]).length,1);
});
