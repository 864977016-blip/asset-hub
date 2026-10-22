const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),sharp=require('sharp');

function storage(){
 const uploads=[];
 class PutObjectCommand{constructor(input){this.input=input;}}
 class S3Client{async send(command){uploads.push(command.input);}}
 const env={R2_BUCKET_NAME:'test',R2_ENDPOINT:'https://r2.example.test',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test'};
 const dependencies={'server-only':{},'@aws-sdk/client-s3':{S3Client,PutObjectCommand,GetObjectCommand:class{},DeleteObjectCommand:class{}},sharp};
 const context={exports:{},require:name=>dependencies[name]||require(name),process:{env},Buffer,File};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/r2.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
 return{r2:context.exports,uploads};
}

test('extension and website use the same WebP compression and metadata',async()=>{
 const {r2,uploads}=storage();
 const source=await sharp({create:{width:3000,height:1500,channels:3,background:'#ff6b00'}}).png().toBuffer();
 const file=new File([source],'original.png',{type:'image/png'});
 let pending,uploadCountAtReservation;
 const collected=await r2.uploadCollectedImage(file,'inspirations','stable-id',async image=>{pending=image;uploadCountAtReservation=uploads.length;});
 const website=await r2.optimizeAndUploadImage(file,'inspirations');
 assert.equal(uploadCountAtReservation,0);
 assert.deepEqual({...collected},{...pending});
 assert.equal(collected.key,'inspirations/stable-id.webp');
 assert.equal(collected.mimeType,'image/webp');
 assert.equal(uploads.length,2);
 for(const [index,result] of [collected,website].entries()){
  const object=uploads[index];
  const meta=await sharp(object.Body).metadata();
  assert.equal(object.ContentType,'image/webp');
  assert.equal(meta.format,'webp');
  assert.equal(meta.width,2400);assert.equal(meta.height,1200);
  assert.equal(result.sizeBytes,object.Body.byteLength);
  assert.equal(result.width,meta.width);assert.equal(result.height,meta.height);
 }
 assert.deepEqual(uploads[0].Body,uploads[1].Body);
 const expected=await sharp(source,{failOn:'error'}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:83}).toBuffer();assert.deepEqual(uploads[0].Body,expected);
});

test('EXIF orientation is applied before WebP storage and real local Sharp stages are timed',async()=>{
 const {r2,uploads}=storage();
 const input=await sharp({create:{width:300,height:120,channels:3,background:'#ff6b00'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const started=performance.now(),stages=[];let previous=started;
 const image=await r2.uploadCollectedImage(new File([input],'rotated.jpg',{type:'image/jpeg'}),'inspirations','rotated',async()=>{},stage=>{const now=performance.now();stages.push({stage,ms:Math.round(now-previous)});previous=now;});
 assert.equal(image.width,120);assert.equal(image.height,300);assert.equal(image.sizeBytes,uploads[0].Body.length);assert.deepEqual(stages.map(item=>item.stage),['file-read','sharp','r2-start','r2']);
 console.info('LOCAL synthetic image / mocked R2 only:',stages);
});

test('small extension image is never enlarged and original size limit is enforced',async()=>{
 const {r2,uploads}=storage();
 const source=await sharp({create:{width:120,height:80,channels:3,background:'#ffffff'}}).png().toBuffer();
 const result=await r2.uploadCollectedImage(new File([source],'small.png',{type:'image/png'}),'inspirations','small');
 assert.equal(result.width,120);assert.equal(result.height,80);
 assert.equal((await sharp(uploads[0].Body).metadata()).format,'webp');
 await assert.rejects(()=>r2.uploadCollectedImage({size:20*1024*1024+1},'inspirations','large'),/20MB/);
 assert.equal(uploads.length,1);
});
