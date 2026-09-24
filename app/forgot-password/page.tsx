import {AuthShell} from "@/components/auth-shell";
import {ForgotPasswordForm} from "./password-form";
export default function Page(){return <AuthShell title="忘记密码" description="输入账号邮箱，我们将发送密码重置邮件。"><ForgotPasswordForm/></AuthShell>}
