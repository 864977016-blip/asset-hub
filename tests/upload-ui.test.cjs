const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');

test('real website form uploads all selected files, unlocks after failure and retries only the failed item',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/stores/shop'}),previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const calls=[],cache=new Map();let fail=true,closed=0,refreshed=0;
 const overrides={'next/navigation':{useRouter:()=>({refresh(){refreshed++;}})},'@/components/toast':{useToast:()=>()=>{}},'@/app/actions':new Proxy({},{get:()=>async()=>[]}),'@/app/asset-operations':new Proxy({},{get:()=>async()=>[]})};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const context={exports:{},require(name){if(name in overrides)return overrides[name];if(name.startsWith('@/')||name.startsWith('./')){const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);return load(base+(fs.existsSync(base+'.tsx')?'.tsx':'.ts'));}return require(name);},File:dom.window.File,FormData:dom.window.FormData,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},crypto:webcrypto,AbortSignal,performance,process:{env:{NODE_ENV:'test'}},window:dom.window,document:dom.window.document,console,
 fetch:async(url,request)=>{calls.push(request.body);await new Promise(resolve=>setTimeout(resolve,15));const file=request.body.get('image');return file.name==='1.png'&&fail?Response.json({error:'图片存储服务上传失败，请重试。'},{status:500}):Response.json({id:request.body.get('id')});}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);cache.set(file,context.exports);return context.exports;}
 const root=createRoot(dom.window.document.getElementById('app'));
 try{
  const {StoreAssetModal}=load('components/image-upload-forms.tsx'),files=Array.from({length:3},(_,i)=>new dom.window.File(['image'],`${i}.png`,{type:'image/png'}));
  await React.act(async()=>{root.render(React.createElement(StoreAssetModal,{storeId:'shop',people:[{id:'person',name:'制作人',disabled_at:null}],initialPeople:[{id:'person',name:'制作人',disabled_at:null}],parents:[],open:true,initialFile:files[0],initialFiles:files,initialCategory:'main',onClose(){closed++;}}));});
  assert.equal(dom.window.document.querySelectorAll('li').length,3);assert.equal(dom.window.document.querySelector('input[type=file]').multiple,true);
  const submit=()=>dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await React.act(async()=>{submit();submit();await new Promise(resolve=>setTimeout(resolve,90));});
  assert.equal(calls.length,3);assert.equal(closed,0);assert.equal(refreshed,1);assert.match(dom.window.document.body.textContent,/已保存 2 张，失败 1 张/);assert.equal(dom.window.document.querySelector('button[type=submit]')?.disabled||false,false);
  fail=false;await React.act(async()=>{submit();await new Promise(resolve=>setTimeout(resolve,70));});
  assert.equal(calls.length,4);assert.equal(closed,1);assert.equal(refreshed,2);assert.equal(calls[1].get('id'),calls[3].get('id'));
  for(const form of calls){assert.equal(form.get('category'),'main');assert.equal(form.get('store_id'),'shop');assert.equal(form.get('production_person_ids'),'person');}
 }finally{await React.act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);}
});
