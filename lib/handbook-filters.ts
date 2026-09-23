import {relationMany,arrayOrEmpty} from "./relation-values";
import type {Prompt,HandbookProduct} from "./types";
export function filterPrompts(items:Prompt[],mode:string,query:string,tags:string[],userId?:string){const q=query.trim().toLocaleLowerCase();return relationMany(items).filter(p=>(mode!=="mine"||p.createdBy===userId)&&(mode!=="favorites"||p.favorite)&&arrayOrEmpty(tags).every(id=>relationMany(p.tags).some(t=>t.id===id))&&(!q||(p.content||"").toLocaleLowerCase().includes(q)||relationMany(p.tags).some(t=>(t.name||"").toLocaleLowerCase().includes(q))))}
export function filterHandbook(items:HandbookProduct[],query:string){const q=query.trim().toLocaleLowerCase();return relationMany(items).filter(p=>!q||(p.name||"").toLocaleLowerCase().includes(q)||relationMany(p.notes).some(n=>(n.content||"").toLocaleLowerCase().includes(q)))}
export function canManagePrompt(prompt:Prompt,userId?:string,admin=false){return prompt.createdBy===userId||(prompt.visibility==="team"&&admin)}
