const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{randomUUID}=require('node:crypto');
function load(file,mocks={},globals={}){const ctx={exports:{},require:name=>mocks[name]||require(name),File,FormData,AbortSignal,performance,process:{env:{NODE_ENV:'test'}},console,...globals};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);return ctx.exports;}
const files=n=>Array.from({length:n},(_,i)=>new File(['image'],`${i}.png`,{type:'image/png'}));
const entries=n=>files(n).map(file=>({id:randomUUID(),file,status:'waiting'}));

test('drag/drop and file picker retain 1, 3 and 5 valid images',()=>{
 const listeners={},react={useState:v=>[v,()=>{}],useRef:v=>({current:v}),useEffect:fn=>fn()},jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const hooks=load('components/image-drop-zone.tsx',{'react':react,'react/jsx-runtime':jsx,'./asset-image':{}},{window:{addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){}},document:{querySelector:()=>null}});
 for(const n of [1,3,5]){
  const expected=files(n),transfer={files:[...expected,new File(['text'],'a.txt',{type:'text/plain'})],items:[],getData:()=>''};
  assert.equal(hooks.imagesFromTransfer(transfer).length,n);
  let dropped=[];hooks.usePageImageDrop(()=>assert.fail('single-file fallback called'),undefined,true,false,images=>dropped=images);
  listeners.drop({dataTransfer:transfer,preventDefault(){},stopPropagation(){}});assert.deepEqual([...dropped],expected);
 }
 let picked=[];const tree=hooks.ImageDropZone({file:null,previewUrl:null,onFileChange:()=>assert.fail('single-file picker called'),onFilesChange:images=>picked=images});
 const input=tree.props.children.find(node=>node.type==='input');assert.equal(input.props.multiple,true);input.props.onChange({target:{files:files(3),value:'selected'}});assert.equal(picked.length,3);
});
test('home destination changes preserve all files',()=>{
 const {emptyHomeUpload,homeUploadReducer:r}=load('lib/home-upload-state.ts'),selected=files(5);
 for(const target of ['store','shared','inspiration']){let state=r(emptyHomeUpload,{type:'open',files:selected});state=r(state,{type:'target',target});if(target==='store')state=r(state,{type:'store',id:'shop'});assert.deepEqual([...state.files],selected);assert.equal(state.file,selected[0]);}
});
test('bounded uploads finish every item, isolate failure and retry only the failed stable ID',async()=>{
 const {uploadBatch}=load('lib/upload-batch.ts'),items=entries(5),calls=[],statuses=[];let active=0,peak=0,fail=true;
 const send=async item=>{calls.push(item.id);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,12));active--;if(fail&&item.id===items[2].id)throw Error('network');};
 const first=await uploadBatch(items,send,item=>statuses.push(item.status));assert.equal(peak,2);assert.equal(first.filter(item=>item.status==='success').length,4);assert.equal(first.filter(item=>item.status==='error').length,1);assert.equal(active,0);
 fail=false;const second=await uploadBatch(first,send,()=>{});assert.equal(second.filter(item=>item.status==='success').length,5);assert.equal(calls.length,6);assert.equal(calls.filter(id=>id===items[2].id).length,2);assert.equal(statuses.filter(s=>s==='uploading').length,5);
});
test('each POST uses one file, common assignment and stable IDs across uncertain retries',async()=>{
 const requests=[],item=entries(1)[0],assignment=new FormData();assignment.set('store_id','shop');assignment.set('parent_product_id','parent');assignment.append('production_person_ids','person');
 let fail=true;const {postUpload}=load('lib/upload-batch.ts',{}, {fetch:async(url,init)=>{requests.push(init);if(fail)throw Error('connection');return Response.json({id:item.id});}});
 await assert.rejects(()=>postUpload(item,assignment,'store'),/网络/);fail=false;await postUpload(item,assignment,'store');assert.equal(requests.length,2);
 for(const request of requests){assert.equal(request.body.get('id'),item.id);assert.equal(request.body.get('image'),item.file);assert.equal(request.body.get('parent_product_id'),'parent');assert.equal(request.body.get('production_person_ids'),'person');assert.ok(request.signal);}
});
test('controlled upload wait benchmark compares serial and two workers without real network',async()=>{
 const {uploadBatch}=load('lib/upload-batch.ts');const times={serial:[],limited:[]};
 for(let round=0;round<3;round++)for(const [name,limit] of [['serial',1],['limited',2]]){const started=performance.now();await uploadBatch(entries(3),()=>new Promise(resolve=>setTimeout(resolve,40)),()=>{},limit);times[name].push(Math.round(performance.now()-started));}
 const median=values=>[...values].sort((a,b)=>a-b)[1];console.info('SIMULATED wait only (3 images x 40ms), median ms:',{serial:median(times.serial),twoWorkers:median(times.limited)});
 assert.ok(median(times.limited)<median(times.serial));
});
