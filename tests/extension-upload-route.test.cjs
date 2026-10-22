const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');

function route(failTable=null){
 const rows={profiles:[{id:'user-1',is_disabled:false}],stores:[{id:'22222222-2222-4222-8222-222222222222',archived_at:null}],parent_products:[],production_people:[],store_assets:[],asset_files:[],store_asset_production_people:[],store_asset_tags:[],store_tags:[],shared_assets:[],shared_asset_production_people:[],shared_asset_stores:[],activities:[],inspirations:[],inspiration_tags:[],tags:[]},calls={r2:0,removed:0};
 const s={auth:{getUser:async()=>({data:{user:{id:'user-1'}},error:null})},rpc:async()=>({data:true,error:null}),from(table){
  let filters=[],operation='select',value,returning=false;
  const q={select(){returning=true;return q},eq(key,item){filters.push(row=>row[key]===item);return q},is(key,item){filters.push(row=>row[key]===item);return q},in(key,items){filters.push(row=>items.includes(row[key]));return q},insert(item){operation='insert';value=item;return q},update(item){operation='update';value=item;return q},delete(){operation='delete';return q},single(){return Promise.resolve(run(true))},maybeSingle(){return Promise.resolve(run(true))},then(resolve){return Promise.resolve(run(false)).then(resolve)}};
  function run(one){const tableRows=rows[table]||[],matched=tableRows.filter(row=>filters.every(filter=>filter(row)));
   if(operation==='insert'){if(table===failTable)return{data:null,error:{code:'42501'}};const input=Array.isArray(value)?value:[value];tableRows.push(...input);return{data:returning?(one?input[0]:input):null,error:null};}
   if(operation==='update'){matched.forEach(row=>Object.assign(row,value));return{data:returning?(one?matched[0]||null:matched):null,error:null};}
   if(operation==='delete'){matched.forEach(row=>tableRows.splice(tableRows.indexOf(row),1));return{data:null,error:null};}
   return{data:one?matched[0]||null:matched,error:null};
  }return q;
 }};
 const overrides={'@supabase/supabase-js':{createClient:()=>s},'@/lib/supabase/server':{createClient:async()=>s},'next/server':{after:task=>task()},'next/cache':{revalidatePath(){}},'@/lib/r2':{async uploadCollectedImage(file,prefix,id,beforeUpload){const image={key:`${prefix}/${id}.webp`,mimeType:'image/webp',sizeBytes:42,width:16,height:16,originalName:file.name};await beforeUpload(image);calls.r2++;return image;},async removeObject(){calls.removed++;}}};
 const context={exports:{},require:name=>overrides[name]||require(name),Request,Response,FormData,File,URL,performance,console:{error(){},info(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/extension/assets/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return{POST:context.exports.POST,rows,calls};
}
function request(id,target,extra={}){const form=new FormData();form.set('id',id);form.set('target',target);form.set('image',new File(['image bytes'],'image.png',{type:'image/png'}));for(const [key,value] of Object.entries(extra)){if(Array.isArray(value))value.forEach(item=>form.append(key,item));else form.set(key,value);}return new Request('http://localhost/api/extension/assets',{method:'POST',headers:{Authorization:'Bearer member-token'},body:form});}
const ID='11111111-1111-4111-8111-111111111111';

test('store collection writes an R2 file and asset once across a retry',async()=>{
 const {POST,rows,calls}=route(),extra={store_id:'22222222-2222-4222-8222-222222222222',category:'main'};
 const first=await POST(request(ID,'store',extra));assert.equal(first.status,200);assert.equal(rows.store_assets.length,1);assert.equal(rows.asset_files.length,1);assert.equal(rows.asset_files[0].store_asset_id,ID);assert.equal(rows.asset_files[0].storage_key,`stores/${extra.store_id}/assets/${ID}.webp`);assert.equal(rows.asset_files[0].mime_type,'image/webp');assert.equal(rows.asset_files[0].size_bytes,42);assert.equal(rows.asset_files[0].width,16);assert.equal(rows.asset_files[0].height,16);assert.equal(calls.r2,1);
 const repeat=await POST(request(ID,'store',extra));assert.equal(repeat.status,200);assert.equal((await repeat.json()).alreadySaved,true);assert.equal(calls.r2,1);assert.equal(rows.store_assets.length,1);
});

test('inspiration collection persists source and R2 image with its existing table',async()=>{
 const {POST,rows,calls}=route();const response=await POST(request(ID,'inspiration',{source_url:'https://example.com/article'}));
 assert.equal(response.status,200);assert.equal(rows.inspirations.length,1);assert.equal(rows.inspirations[0].source_domain,'example.com');assert.equal(rows.inspirations[0].image_url,`/api/inspirations/${ID}/image`);assert.equal(calls.r2,1);
});

test('store collection validates parent labels and links multiple active people',async()=>{
 const {POST,rows}=route(),parent='33333333-3333-4333-8333-333333333333',tag='44444444-4444-4444-8444-444444444444',people=['55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
 rows.parent_products.push({id:parent,store_id:'22222222-2222-4222-8222-222222222222',parent_product_tags:[{product_tag_id:tag}]});people.forEach(id=>rows.production_people.push({id,disabled_at:null}));
 const response=await POST(request(ID,'store',{store_id:'22222222-2222-4222-8222-222222222222',parent_product_id:parent,category:'a_plus',tag_ids:[tag],production_person_ids:people}));
 assert.equal(response.status,200);assert.equal(rows.store_assets[0].parent_product_id,parent);assert.deepEqual(rows.store_asset_production_people.map(row=>row.production_person_id),people);
});

test('invalid store and parent choices are rejected before R2 upload',async()=>{
 const {POST,calls}=route();const response=await POST(request(ID,'store',{store_id:'22222222-2222-4222-8222-222222222222',parent_product_id:'33333333-3333-4333-8333-333333333333',category:'main'}));assert.equal(response.status,400);assert.equal(calls.r2,0);
});

test('disabled production person cannot be attached and relation failure cleans up the asset',async()=>{
 const person='55555555-5555-4555-8555-555555555555',base={store_id:'22222222-2222-4222-8222-222222222222',category:'main',production_person_ids:[person]};
 const inactive=route();inactive.rows.production_people.push({id:person,disabled_at:'2026-10-01'});
 assert.equal((await inactive.POST(request(ID,'store',base))).status,400);assert.equal(inactive.calls.r2,0);
 const broken=route('store_asset_production_people');broken.rows.production_people.push({id:person,disabled_at:null});
 assert.equal((await broken.POST(request(ID,'store',base))).status,500);assert.equal(broken.rows.store_assets.length,0);assert.equal(broken.calls.removed,1);
});

function websiteRequest(id,target,extra={}){const original=request(id,target,extra),headers=new Headers(original.headers);headers.delete('authorization');headers.set('origin','http://localhost');return new Request(original,{headers});}
test('website cookie uploads reject cross-origin requests and preserve N distinct store assets with shared assignment',async()=>{
 const d=route(),shop='22222222-2222-4222-8222-222222222222',person='55555555-5555-4555-8555-555555555555',parent='33333333-3333-4333-8333-333333333333';
 d.rows.production_people.push({id:person,disabled_at:null});d.rows.parent_products.push({id:parent,store_id:shop,parent_product_tags:[{product_tag_id:'44444444-4444-4444-8444-444444444444'}]});
 const ids=Array.from({length:5},(_,i)=>`11111111-1111-4111-8111-11111111111${i}`);
 const extra={store_id:shop,parent_product_id:parent,category:'scene',production_person_ids:[person]};
 const rejected=new Request(websiteRequest(ids[0],'store',extra),{headers:{Origin:'https://other.example'}});assert.equal((await d.POST(rejected)).status,401);assert.equal(d.calls.r2,0);
 for(const id of ids)assert.equal((await d.POST(websiteRequest(id,'store',extra))).status,200);
 assert.equal(d.rows.store_assets.length,5);assert.equal(d.rows.asset_files.length,5);assert.equal(d.rows.store_asset_production_people.length,5);
 assert.ok(d.rows.store_assets.every(row=>row.parent_product_id===parent&&row.asset_category==='scene'));
 for(const id of ids)assert.equal((await d.POST(websiteRequest(id,'store',extra))).status,200);
 assert.equal(d.calls.r2,5);assert.equal(d.rows.asset_files.length,5);
});
test('website shared upload completes people/store associations and retries without duplicate files',async()=>{
 const d=route(),shop='22222222-2222-4222-8222-222222222222',person='55555555-5555-4555-8555-555555555555';d.rows.production_people.push({id:person,disabled_at:null});
 const extra={store_ids:[shop],production_person_ids:[person],description:'note'};
 assert.equal((await d.POST(websiteRequest(ID,'shared',extra))).status,200);
 assert.equal(d.rows.shared_assets[0].preview_file_id,ID);assert.equal(d.rows.shared_asset_stores.length,1);assert.equal(d.rows.shared_asset_production_people.length,1);
 assert.equal((await d.POST(websiteRequest(ID,'shared',extra))).status,200);assert.equal(d.calls.r2,1);
 const inactive=route();inactive.rows.production_people.push({id:person,disabled_at:'2026-01-01'});assert.equal((await inactive.POST(websiteRequest(ID,'shared',extra))).status,400);assert.equal(inactive.calls.r2,0);
});
