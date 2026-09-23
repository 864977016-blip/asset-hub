const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),postcss=require('postcss');
function mount(){
 let cursor=0,path='/library',tree,pending=[],closedMenus=0;const slots=[],effects=[],listeners=new Map(),changes=new Set();
 const doc={body:{style:{overflow:'auto'}},activeElement:null,querySelector:()=>null,addEventListener(k,f){listeners.set(k,f)},removeEventListener(k,f){if(listeners.get(k)===f)listeners.delete(k)}};
 const media={matches:false,addEventListener(k,f){changes.add(f)},removeEventListener(k,f){changes.delete(f)}};
 const react={useRef(value){return slots[cursor++]??=({current:value})},useState(value){const i=cursor++;slots[i]??=value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};
 class Observer{observe(){}disconnect(){}}
 const ctx={exports:{},document:doc,window:{matchMedia:()=>media},MutationObserver:Observer,require(name){if(name==='react')return react;if(name==='next/navigation')return{usePathname:()=>path};if(name==='./action-menu')return{closeActionMenus:()=>closedMenus++};if(name==='lucide-react')return{Menu:'icon',X:'icon'};if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};throw Error(name)}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/shell-frame.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
 const button={isConnected:true,getClientRects:()=>[{}],focus(){doc.activeElement=this}},link={isConnected:true,getClientRects:()=>[{}],focus(){doc.activeElement=this}};
 const nav={querySelector:()=>link,querySelectorAll:()=>[button,link]};
 const render=()=>{cursor=0;pending=[];tree=ctx.exports.ShellFrame({sidebar:'one-real-sidebar',header:'header',children:'main'});const navigation=tree.props.children[1];navigation.props.ref.current=nav;navigation.props.children[0].props.ref.current=button;pending.forEach(fn=>fn());return tree};
 render();return{doc,media,button,link,render,query:ctx.exports.SIDEBAR_DESKTOP_QUERY,open:()=>tree.props['data-sidebar-open'],toggle(){tree.props.children[1].props.children[0].props.onClick();render()},backdrop(){tree.props.children[0].props.onClick();render()},navigate(){path='/stores';render();render()},clickLink(){tree.props.children[1].props.onClick({target:{closest:()=>link}});render()},resize(wide){media.matches=wide;changes.forEach(f=>f());render()},key(key,shiftKey=false){let prevented=false;listeners.get('keydown')?.({key,shiftKey,preventDefault(){prevented=true}});render();return prevented},unmount(){effects.forEach(e=>e?.cleanup?.())},closedMenus:()=>closedMenus};
}
test('narrow sidebar opens and closes from trigger, backdrop, Escape and navigation',()=>{
 const h=mount();assert.equal(h.open(),false);h.toggle();assert.equal(h.open(),true);assert.equal(h.doc.body.style.overflow,'hidden');assert.equal(h.doc.activeElement,h.link);
 let tree=h.render();assert.equal(tree.props.children[2].props.inert,true);assert.equal(tree.props.children[1].props['aria-modal'],true);assert.equal(tree.props.children[1].props.children[0].props['aria-expanded'],true);
 h.toggle();assert.equal(h.open(),false);assert.equal(h.doc.body.style.overflow,'auto');h.toggle();h.backdrop();assert.equal(h.open(),false);
 h.toggle();assert.equal(h.key('Escape'),true);assert.equal(h.open(),false);assert.equal(h.doc.activeElement,h.button);
 h.toggle();h.clickLink();assert.equal(h.open(),false);h.toggle();h.navigate();assert.equal(h.open(),false);assert.ok(h.closedMenus()>0);h.unmount();
});
test('drawer keyboard cycles internally and breakpoint change clears backdrop, inert and scroll lock',()=>{
 const h=mount();h.toggle();h.doc.activeElement=h.link;assert.equal(h.key('Tab'),true);assert.equal(h.doc.activeElement,h.button);assert.equal(h.key('Tab',true),true);assert.equal(h.doc.activeElement,h.link);
 h.resize(true);assert.equal(h.open(),false);assert.equal(h.doc.body.style.overflow,'auto');let tree=h.render();assert.equal(tree.props.children[0],false);assert.equal(tree.props.children[2].props.inert,false);
 h.resize(false);assert.equal(h.open(),false);assert.equal(h.query,'(min-width: 1024px)');h.unmount();
});
test('one breakpoint controls sidebar, menu trigger and offset, with bounded drawer/search widths',()=>{
 const css=postcss.parse(fs.readFileSync('app/globals.css','utf8'));
 const value=(selector,property,width)=>{let result;css.walkRules(rule=>{if(!rule.selectors.includes(selector))return;let p=rule.parent;if(p.type==='atrule'){if(p.name!=='media'||!p.params.includes('min-width:'))return;if(width<Number(p.params.match(/min-width:\s*(\d+)/)[1]))return}rule.walkDecls(property,d=>result=d.value)});return result};
 for(const width of [600,800,1023,1024,1440,1920]){
  assert.equal(value('.sidebar-toggle','display',width),width<1024?'grid':'none');assert.equal(value('.app-sidebar','display',width),width<1024?'none':'flex');assert.equal(value('.app-shell','padding-left',width),width<1024?'0':'18rem');
  assert.equal(value('.app-shell[data-sidebar-open="true"] .app-sidebar','display',width),'flex');
 }
 assert.equal(value('.app-sidebar','overflow-y',800),'auto');assert.equal(value('.app-sidebar','max-width',800),'calc(100vw - 2rem)');
 assert.equal(value('.global-search-results','width',800),'min(32rem, calc(100vw - 5.75rem))');
 assert.equal(value('.sidebar-backdrop','display',1440),'none');
 assert.equal((fs.readFileSync('components/app-shell.tsx','utf8').match(/<SidebarNav /g)||[]).length,1);
});
