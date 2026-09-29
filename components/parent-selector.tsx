"use client";
import {useEffect,useState} from "react";
import {readParentOptions} from "@/app/actions";
import type {ProductTag} from "@/lib/types";
type Option={id:string;name:string;tags?:ProductTag[]};
export function ParentSelector({storeId,selected,options,showTag=false}:{storeId?:string;selected?:string|null;options?:Option[];showTag?:boolean}){
 const [loaded,setLoaded]=useState<Option[]|null>(null),[error,setError]=useState(false),[value,setValue]=useState(selected??"");
 useEffect(()=>{let stale=false;if(!options&&storeId)readParentOptions(storeId).then(data=>{if(!stale)setLoaded(data)}).catch(()=>{if(!stale)setError(true)});return()=>{stale=true}},[storeId,options]);
 useEffect(()=>setValue(selected??""),[selected]);
 const items=options??loaded;
 const active=items?.find(parent=>parent.id===value);
 return <label className="block text-sm font-medium">父体（可选）{items?<><select name="parent_product_id" value={value} onChange={event=>setValue(event.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">未归类</option>{items.map(parent=><option key={parent.id} value={parent.id}>{parent.name}</option>)}</select>{showTag&&<p className="mt-2 text-xs font-normal text-zinc-500">标签：{active?.tags?.map(tag=>tag.name).join("、")||"—"}</p>}</>:<><input type="hidden" name="parent_product_id" value={selected??""}/><p role="status" className="mt-2 text-xs text-zinc-500">{error?"父体暂时无法加载，原归属保持不变。":"加载父体…"}</p></>}</label>;
}
