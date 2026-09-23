"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";

let activeClose: (()=>void)|undefined;
export function closeActionMenus(){activeClose?.()}

/** Native popovers live in the top layer, including inside scrollable dialogs. */
export function ActionMenu({label,children,className="",triggerClassName="px-2"}:{label:string;children:ReactNode;className?:string;triggerClassName?:string}){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false);const id=useId(),pathname=usePathname();
 const close=()=>{panel.current?.hidePopover();setOpen(false)};
 const items=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')||[]);
 useEffect(()=>{close()},[pathname]);
 useEffect(()=>{
  if(!open)return;
  activeClose?.();activeClose=close;
  const position=()=>{const a=trigger.current?.getBoundingClientRect(),p=panel.current;if(!a||!p)return;const r=p.getBoundingClientRect();p.style.left=`${Math.max(8,Math.min(a.right-r.width,window.innerWidth-r.width-8))}px`;p.style.top=`${Math.max(8,a.bottom+6+r.height<=window.innerHeight-8?a.bottom+6:a.top-r.height-6)}px`};
  position();items().forEach(item=>item.setAttribute('role','menuitem'));
  const focus=(event:FocusEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close()};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus()}};
  // Only the currently open menu installs listeners. A newly opened modal also dismisses it.
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target instanceof HTMLDialogElement&&(r.target as HTMLDialogElement).open))close()});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('focusin',focus);document.addEventListener('keydown',key,true);
  window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  return()=>{if(activeClose===close)activeClose=undefined;observer.disconnect();document.removeEventListener('focusin',focus);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true)};
 },[open]);
 const toggle=()=>{if(panel.current?.matches(':popover-open')){close();return}closeActionMenus();panel.current?.showPopover();setOpen(true)};
 return <div className={`shrink-0 ${className}`}><button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} className={triggerClassName} popoverTarget={id} onClick={e=>{e.preventDefault();toggle()}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!panel.current?.matches(':popover-open'))toggle();const list=items();(e.key==='ArrowUp'?list.at(-1):list[0])?.focus()}}}>···</button>
 <div ref={panel} id={id} popover="auto" role="menu" aria-label={label} onToggle={e=>setOpen(e.newState==='open')} className="action-menu rounded-lg border border-zinc-200 bg-white p-2 text-sm text-ink shadow-float" onClickCapture={e=>{const item=(e.target as HTMLElement).closest('button:not(:disabled),a[href]');if(item){close();trigger.current?.focus()}}} onKeyDown={e=>{const list=items(),index=list.indexOf(document.activeElement as HTMLElement);let next:number|undefined;if(e.key==='ArrowDown')next=(index+1)%list.length;if(e.key==='ArrowUp')next=(index-1+list.length)%list.length;if(e.key==='Home')next=0;if(e.key==='End')next=list.length-1;if(next!==undefined){e.preventDefault();list[next]?.focus()}}}>{children}</div></div>
}
