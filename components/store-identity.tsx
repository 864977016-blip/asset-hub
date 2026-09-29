"use client";
import { useState } from "react";
import { storeMonogram } from "@/lib/home-display";

export function StoreIdentity({name,logo,className="h-14 w-14"}:{name:string;logo?:string|null;className?:string}){
 const [failed,setFailed]=useState<string|null>(null);
 return logo&&failed!==logo?<img src={logo} alt={`${name} Logo`} onError={()=>setFailed(logo!)} className={`${className} rounded-lg bg-white object-contain`}/>:<span aria-label={`${name} 默认标识`} className={`${className} grid place-items-center rounded-lg bg-ink text-lg font-semibold tracking-wide text-white`}>{storeMonogram(name)}</span>;
}
