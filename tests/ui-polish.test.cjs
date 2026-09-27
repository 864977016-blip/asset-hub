const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
function harness(file,name,props,element,storage=new Map()){
 let cursor=0,tree,pending=[],resize;const slots=[],effects=[];
 const react={useRef:v=>slots[cursor++]??=({current:v}),useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next]},useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};react.useLayoutEffect=react.useEffect;
 const ctx={exports:{},ResizeObserver:class{constructor(fn){resize=fn}observe(){}disconnect(){}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},window:{setInterval:()=>1,clearInterval(){}},require(id){
  if(id==='react')return react;
  if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(id==='@/lib/relation-values')return {relationMany:v=>v||[],arrayOrEmpty:v=>v||[]};
  if(id==='@/lib/home-display')return {homeCategoryLabels:{},homeDate:()=>'',relativeTime:()=>'',storeMonogram:s=>s};
  return new Proxy({},{get:(_,key)=>key});
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
 const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
 const render=()=>{cursor=0;pending=[];tree=ctx.exports[name](props);nodes(tree).forEach(n=>{if(n.props?.ref)n.props.ref.current=element});pending.forEach(fn=>fn());return nodes(tree)};
 return {render,resize:()=>resize(),storage};
}
test('sidebar restores scroll on remount, minimally reveals active store, waits for closed drawer',()=>{
 let current={top:60,bottom:92};const list={scrollTop:0,clientHeight:176,getBoundingClientRect:()=>({top:20,bottom:196}),querySelector:()=>({getBoundingClientRect:()=>current})};
 const storage=new Map([['sidebar-stores-scroll:user','320']]),props={active:'店铺',activeStoreId:'s',profile:{id:'user'},stores:[{id:'s',name:'Store'}]};
 const h=harness('components/sidebar-nav.tsx','SidebarNav',props,list,storage);let nodes=h.render();assert.equal(list.scrollTop,320);
 nodes.find(n=>n.props?.onScroll).props.onScroll({currentTarget:{scrollTop:420}});assert.equal(storage.get('sidebar-stores-scroll:user'),'420');
 list.scrollTop=0;harness('components/sidebar-nav.tsx','SidebarNav',props,list,storage).render();assert.equal(list.scrollTop,420);
 current={top:220,bottom:252};list.scrollTop=0;harness('components/sidebar-nav.tsx','SidebarNav',props,list,storage).render();assert.equal(list.scrollTop,476);
 list.clientHeight=0;list.scrollTop=0;const hidden=harness('components/sidebar-nav.tsx','SidebarNav',props,list,storage);hidden.render();assert.equal(list.scrollTop,0);list.clientHeight=176;current={top:60,bottom:92};hidden.resize();assert.equal(list.scrollTop,420);
});
test('home shows only cards fitting one actual-width row and recomputes after resize',()=>{
 const row={clientWidth:1000},stores=Array.from({length:12},(_,i)=>({id:String(i),name:'Store '+i,count:i}));
 const h=harness('components/home-content.tsx','HomeContent',{stores,inspirations:[],activities:[],tags:[],workstations:[],now:0},row);
 h.render();
 for(const [width,count] of [[1000,4],[740,3],[480,2],[320,1],[1500,6]]){row.clientWidth=width;h.resize();const nodes=h.render(),links=nodes.filter(n=>/^\/stores\/\d+$/.test(n.props?.href));assert.equal(links.length,count);assert.ok(nodes.some(n=>n.props?.href==='/stores'&&n.props.action==='查看全部'));}
});
test('prompt columns avoid row coupling and workstation rows preserve actual IDs and admin controls',()=>{
 const css=fs.readFileSync('app/globals.css','utf8'),prompts=fs.readFileSync('components/prompt-browser.tsx','utf8');
 assert.match(css,/\.prompt-masonry\s*\{[^}]*column-width: 22rem;[^}]*column-count: auto/);assert.match(prompts,/break-inside-avoid/);assert.doesNotMatch(prompts,/content-grid grid-prompts/);
 const work=fs.readFileSync('components/workstation-cards.tsx','utf8');assert.match(work,/\[\[8,7,6,5\],\[4,3,2,1\]\]/);assert.match(work,/canEdit &&/);assert.match(work,/href=\{`\/workstations\/\$\{workstation.id\}`\}/);
 assert.match(css,/@container workspace \(min-width: 48rem\) \{ \.workstation-row \{ grid-template-columns: repeat\(4/);
 const notes=fs.readFileSync('components/handbook-browser.tsx','utf8');assert.match(notes,/py-4 first:pt-0/);assert.match(notes,/empty:hidden mt-3/);
});
