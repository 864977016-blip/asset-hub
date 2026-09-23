const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),postcss=require('postcss');

function menus(){
 const listeners=new Map(),observers=new Set();let current,path='/library';
 const doc={body:{},activeElement:null,addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},removeEventListener(k,f){listeners.get(k)?.delete(f)}};
 const win={innerWidth:800,innerHeight:600,addEventListener(){},removeEventListener(){}};
 class Dialog{open=true}
 class Observer{constructor(fn){this.fn=fn}observe(){observers.add(this)}disconnect(){observers.delete(this)}}
 const react={useRef(value){const i=current.index++;return current.slots[i]??=({current:value})},useState(value){const owner=current,i=current.index++;owner.slots[i]??=value;return[owner.slots[i],v=>{owner.slots[i]=v}]},useId(){return current.id},useEffect(fn,deps){const i=current.index++,previous=current.effects[i];if(!previous||deps.some((v,j)=>v!==previous.deps[j]))current.pending.push(()=>{previous?.cleanup?.();current.effects[i]={deps,cleanup:fn()}})}};
 const ctx={exports:{},document:doc,window:win,MutationObserver:Observer,HTMLDialogElement:Dialog,require(name){if(name==='react')return react;if(name==='next/navigation')return{usePathname:()=>path};if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};throw Error(name)}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/action-menu.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
 const make=id=>{
  const state={id,index:0,slots:[],effects:[],pending:[]};let tree;
  const trigger={focus(){doc.activeElement=trigger},contains(node){return node===trigger},getBoundingClientRect:()=>({right:790,bottom:580,top:550})};
  const items=[0,1].map(()=>({focus(){doc.activeElement=this},setAttribute(){}}));
  const panel={style:{},shown:false,showPopover(){this.shown=true},hidePopover(){this.shown=false},matches(){return this.shown},querySelectorAll:()=>items,contains:n=>items.includes(n),getBoundingClientRect:()=>({width:160,height:120})};
  const render=()=>{current=state;state.index=0;state.pending=[];tree=ctx.exports.ActionMenu({label:id,children:[]});tree.props.children[0].props.ref.current=trigger;tree.props.children[1].props.ref.current=panel;state.pending.forEach(fn=>fn());return tree};
  render();return{panel,trigger,items,render,click(){tree.props.children[0].props.onClick({preventDefault(){}});render()},key(key){tree.props.children[0].props.onKeyDown({key,preventDefault(){}});render()},choose(){tree.props.children[1].props.onClickCapture({target:{closest:()=>items[0]}});render()},arrow(key){tree.props.children[1].props.onKeyDown({key,preventDefault(){}})},nativeDismiss(){panel.hidePopover();tree.props.children[1].props.onToggle({newState:'closed'});render()},unmount(){state.effects.forEach(e=>e?.cleanup?.())}};
 };
 return{make,doc,observers,Dialog,listeners,navigate(p){path=p},dispatch(type,event){for(const fn of [...listeners.get(type)||[]])fn(event)}};
}
test('ActionMenu toggles, coordinates one open menu, and cleans up after action/navigation',()=>{
 const h=menus(),a=h.make('a'),b=h.make('b');a.click();assert.equal(a.panel.shown,true);a.click();assert.equal(a.panel.shown,false);
 a.click();b.click();a.render();assert.equal(a.panel.shown,false);assert.equal(b.panel.shown,true);assert.equal(h.listeners.get('keydown').size,1);
 b.choose();assert.equal(b.panel.shown,false);assert.equal(h.doc.activeElement,b.trigger);
 a.click();h.navigate('/stores');a.render();a.render();assert.equal(a.panel.shown,false);a.unmount();b.unmount();assert.equal(h.listeners.get('keydown').size,0);
});
test('ActionMenu supports keyboard focus, Escape, native light dismiss, modal dismissal and viewport positioning',()=>{
 const h=menus(),a=h.make('a');a.key('ArrowDown');assert.equal(h.doc.activeElement,a.items[0]);a.arrow('ArrowDown');assert.equal(h.doc.activeElement,a.items[1]);
 assert.equal(a.panel.style.left,'630px');assert.equal(a.panel.style.top,'424px');
 h.dispatch('keydown',{key:'Escape',preventDefault(){},stopPropagation(){}});a.render();assert.equal(a.panel.shown,false);assert.equal(h.doc.activeElement,a.trigger);
 a.click();a.nativeDismiss();assert.equal(a.render().props.children[0].props['aria-expanded'],false);
 a.click();h.dispatch('focusin',{target:{}});a.render();assert.equal(a.panel.shown,false);
 a.click();for(const o of h.observers)o.fn([{target:new h.Dialog()}]);a.render();assert.equal(a.panel.shown,false);a.unmount();assert.equal(h.observers.size,0);
});
test('shared CSS ties sidebar offset to visibility and grids to actual content width',()=>{
 const css=postcss.parse(fs.readFileSync('app/globals.css','utf8'));
 const value=(selector,property,viewport,content)=>{let result;css.walkRules(rule=>{if(!rule.selectors.includes(selector))return;let parent=rule.parent;while(parent?.type==='atrule'){const width=Number(parent.params.match(/min-width:\s*([\d.]+)/)?.[1]);const scale=parent.params.includes('rem')?16:1;if((parent.name==='container'?content:viewport)<width*scale)return;parent=parent.parent}rule.walkDecls(property,d=>result=d.value)});return result};
 for(const [viewport,content,columns] of [[1920,1568,4],[1440,1088,4],[1280,928,3],[1024,672,2],[1000,936,3],[800,736,2],[600,560,2],[480,440,1]]){
  assert.equal(value('.app-sidebar','display',viewport,content),viewport>=1024?'flex':'none');assert.equal(value('.app-shell','padding-left',viewport,content),viewport>=1024?'18rem':'0');
  const base=value('.content-grid','grid-template-columns',viewport,content),override=value('.grid-four','grid-template-columns',viewport,content);assert.equal(override||base,columns===1?'minmax(0, 1fr)':`repeat(${columns}, minmax(0, 1fr))`);
 }
 assert.equal(value('.handbook-layout','grid-template-columns',1024,672),undefined);
 assert.equal(value('.handbook-layout','grid-template-columns',1440,1088),'240px minmax(0, 1fr)');
 assert.equal(value('.app-main','container',800,736),'workspace / inline-size');
});

test('both inspiration walls share automatic columns calculated from Main content width',()=>{
 const css=postcss.parse(fs.readFileSync('app/globals.css','utf8')),declarations={};
 css.walkRules(rule=>{if(!rule.selectors.includes('.inspiration-masonry'))return;
  assert.equal(rule.parent.type,'root','Masonry must not acquire breakpoint overrides');
  rule.walkDecls(d=>declarations[d.prop]=d.value);
 });
 assert.equal(declarations['column-count'],'auto');assert.equal(declarations.width,'100%');assert.equal(declarations['min-width'],'0');
 const rem=value=>{assert.match(value,/^[\d.]+rem$/);return parseFloat(value)*16};
 const ideal=rem(declarations['column-width']),gap=rem(declarations['column-gap']);
 // CSS multicol's used count and width for column-count:auto, not viewport classes.
 const layout=width=>{const count=Math.max(1,Math.floor((width+gap)/(ideal+gap)));return{count,card:(width-gap*(count-1))/count}};
 for(const [mainWidth,expected] of [[1568,6],[1088,4],[936,3],[928,3],[736,3],[672,2],[560,2],[280,1]]){
  const {count,card}=layout(mainWidth);assert.equal(count,expected);assert.ok(card<=336,'Cards must not stretch into giant columns at desktop widths');
  assert.ok(Math.abs(card*count+gap*(count-1)-mainWidth)<0.001,'Columns fit without horizontal overflow');
 }
 // A sidebar change affects available width; the wall itself has no sidebar/viewport rule.
 assert.equal(layout(1000-64).count,3);assert.equal(layout(1000-64-288).count,2);
 assert.equal(layout(3*ideal+2*gap-1).count,2);assert.equal(layout(3*ideal+2*gap).count,3);
 for(const file of ['components/home-content.tsx','components/inspiration-browser.tsx']){
  const source=fs.readFileSync(file,'utf8');assert.ok(source.includes('className="inspiration-masonry"'));
  assert.ok(!source.includes('home-masonry'));
 }
 assert.ok(!fs.readFileSync('app/globals.css','utf8').includes('.home-masonry'));
 for(const file of ['components/home-content.tsx','components/inspiration-card.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes('className="block h-auto w-full"'),'Images keep their intrinsic aspect ratio');
});
