"use client";
import {useEffect,useRef,type ReactNode} from "react";
export function Modal({title,children,onClose,pending=false}:{title:string;children:ReactNode;onClose:()=>void;pending?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus()};},[]);
 return <dialog data-asset-detail ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();if(!pending)onClose()}} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-auto rounded-xl bg-white p-6 text-ink shadow-float backdrop:bg-black/40"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button type="button" disabled={pending} onClick={onClose} aria-label="关闭" className="round-button">×</button></div>{children}</dialog>
}
