"use client";
import { createContext,useContext,type ReactNode } from "react";
import type { SidebarProfile,Tag,TagScope } from "@/lib/types";
const Context=createContext<{ready:boolean;profile:SidebarProfile;tags:Tag[];storeTags:Tag[];promptTags:Tag[]}>({ready:false,profile:{displayName:"用户",role:"member"},tags:[],storeTags:[],promptTags:[]});
export function TeamProvider({children,...value}: {children:ReactNode;ready:boolean;profile:SidebarProfile;tags:Tag[];storeTags:Tag[];promptTags:Tag[]}){return <Context.Provider value={value}>{children}</Context.Provider>}
export function useTeam(){return useContext(Context)}
export function useTagPool(scope:TagScope){const value=useTeam();return scope==="store"?value.storeTags:scope==="prompt"?value.promptTags:value.tags}
export function useCanManage(createdBy?:string){const {profile}=useTeam();return profile.role==="admin"||Boolean(createdBy&&profile.id===createdBy)}
