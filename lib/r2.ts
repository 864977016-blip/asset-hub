import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { Readable } from "node:stream";

const maxBytes = 20 * 1024 * 1024;
function config() { const required = ["R2_BUCKET_NAME", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const; if (required.some(key => !process.env[key])) throw new Error("R2 存储未配置"); return { bucket: process.env.R2_BUCKET_NAME!, endpoint: process.env.R2_ENDPOINT!, accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }; }
let sharedClient:S3Client|undefined;
function client(){if(sharedClient)return sharedClient;const c=config();return sharedClient=new S3Client({region:"auto",endpoint:c.endpoint,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey}});}
export async function optimizeAndUploadImage(file: File, prefix: string, mark?: (stage: "file-read" | "sharp" | "r2") => void) {
 if (!file.size || file.size > maxBytes) throw new Error("图片不能超过 20MB");
 const input = Buffer.from(await file.arrayBuffer());mark?.("file-read");
 let image;try { image = sharp(input, { failOn: "error" }).rotate(); } catch { throw new Error("无法识别图片文件"); }
 const meta = await image.metadata();if (!meta.width || !meta.height || !meta.format) throw new Error("无法识别图片文件");
 const output = await image.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 83 }).toBuffer({ resolveWithObject: true });mark?.("sharp");
 const key = `${prefix}/${randomUUID()}.webp`;await client().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: output.data, ContentType: "image/webp" }));mark?.("r2");
 return { key, mimeType: "image/webp", sizeBytes: output.data.byteLength, width: output.info.width, height: output.info.height, originalName: file.name || "image" };
}
export async function removeObject(key: string) { await client().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key })); }
export async function readObject(key:string,mark?:(stage:"r2-get"|"r2-body")=>void){const result=await client().send(new GetObjectCommand({Bucket:config().bucket,Key:key}));mark?.("r2-get");if(!result.Body)throw new Error("图片不存在");const bytes=await result.Body.transformToByteArray();mark?.("r2-body");return{bytes,contentType:result.ContentType||"image/webp"};}
export async function readObjectStream(key:string,mark?:()=>void){const result=await client().send(new GetObjectCommand({Bucket:config().bucket,Key:key}));mark?.();if(!(result.Body instanceof Readable))throw new Error("图片不存在");return{body:Readable.toWeb(result.Body),contentType:result.ContentType||"image/webp"};}
