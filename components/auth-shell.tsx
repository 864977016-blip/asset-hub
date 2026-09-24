import {Grid2X2} from "lucide-react";
import type {ReactNode} from "react";
export function AuthShell({title,description,children}:{title:string;description:string;children:ReactNode}){
 return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-float"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-orange-brand text-white"><Grid2X2 size={17}/></span><b>火麦-素材共享</b></div><h1 className="mt-10 text-3xl font-bold">{title}</h1><p className="mt-2 text-zinc-500">{description}</p>{children}</section></main>;
}
