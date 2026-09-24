import {LoginForm} from "./login-form";
import {AuthShell} from "@/components/auth-shell";
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}){const params=await searchParams;return <AuthShell title="欢迎回来" description="登录以进入团队素材工作台。"><LoginForm unavailable={params.error==="account-unavailable"}/></AuthShell>}
