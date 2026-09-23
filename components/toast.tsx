"use client";
import { createContext, useContext, useState } from "react";
type Toast = { message: string; error?: boolean };
const ToastContext = createContext<(toast: Toast) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) { const [toast,setToast]=useState<Toast|null>(null); const show=(next:Toast)=>{setToast(next); window.setTimeout(()=>setToast(null),2800)}; return <ToastContext.Provider value={show}>{children}{toast&&<div className={`fixed bottom-6 right-6 z-[100] rounded-full px-4 py-3 text-sm font-medium shadow-float ${toast.error?"bg-zinc-900 text-white":"bg-orange-brand text-white"}`}>{toast.error?"× ":"✓ "}{toast.message}</div>}</ToastContext.Provider> }
export const useToast = () => useContext(ToastContext);
