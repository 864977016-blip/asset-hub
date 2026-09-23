"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="text-xl font-bold">页面暂时无法加载</h1><p className="mt-3 text-sm text-zinc-500">请稍后重试；如果问题持续，请联系管理员。</p><button type="button" onClick={reset} className="round-button mt-6">重试</button></div>}
