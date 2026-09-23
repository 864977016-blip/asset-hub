"use client";
import {Menu, X} from "lucide-react";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {closeActionMenus} from "./action-menu";

export const SIDEBAR_DESKTOP_QUERY = "(min-width: 1024px)";

export function ShellFrame({sidebar,header,children}:{sidebar:ReactNode;header:ReactNode;children:ReactNode}){
 const [open,setOpen]=useState(false),pathname=usePathname();
 const trigger=useRef<HTMLButtonElement>(null),navigation=useRef<HTMLDivElement>(null);
 const close=()=>setOpen(false);
 useEffect(()=>{close()},[pathname]);
 useEffect(()=>{
  const desktop=window.matchMedia(SIDEBAR_DESKTOP_QUERY);
  const sync=()=>{if(desktop.matches)close()};sync();
  desktop.addEventListener("change",sync);return()=>desktop.removeEventListener("change",sync);
 },[]);
 useEffect(()=>{
  if(!open)return;
  closeActionMenus();
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const focusable=()=>Array.from(navigation.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')||[]).filter(el=>el.getClientRects().length>0);
  navigation.current?.querySelector<HTMLElement>('a[aria-current="page"],a[href]')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();close()}
   if(event.key==="Tab"){
    const elements=focusable(),first=elements[0],last=elements.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  };
  document.addEventListener("keydown",key);
  const observer=new MutationObserver(()=>{if(document.querySelector('dialog[open], [data-upload-modal]'))close()});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["open"]});
  return()=>{observer.disconnect();document.body.style.overflow=overflow;document.removeEventListener("keydown",key);
   if(window.matchMedia(SIDEBAR_DESKTOP_QUERY).matches){navigation.current?.querySelector<HTMLElement>('a[href]')?.focus()}
   else (previous?.isConnected?previous:trigger.current)?.focus();
  };
 },[open]);
 return <div className="app-shell min-h-screen bg-canvas" data-sidebar-open={open}>
  {open&&<button type="button" tabIndex={-1} aria-label="关闭导航遮罩" className="sidebar-backdrop" onClick={close}/>}
  <div ref={navigation} role={open?"dialog":undefined} aria-modal={open?true:undefined} aria-label={open?"主导航":undefined} onClick={event=>{if((event.target as HTMLElement).closest('a[href]'))close()}}>
   <button ref={trigger} type="button" aria-label={open?"关闭导航":"打开导航"} aria-expanded={open} aria-controls="app-sidebar-navigation" className="sidebar-toggle" onClick={()=>setOpen(value=>!value)}>{open?<X size={20}/>:<Menu size={20}/>}</button>
   <div id="app-sidebar-navigation">{sidebar}</div>
  </div>
  <div className="min-w-0" inert={open}>
   <header className="app-header sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-zinc-200/70 bg-canvas/85 px-5 backdrop-blur-xl md:px-8">{header}</header>
   <main className="app-main px-5 py-8 md:px-8">{children}</main>
  </div>
 </div>;
}
