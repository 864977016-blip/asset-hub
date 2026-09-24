export function emailError(email: string) {
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "" : "请输入有效的邮箱地址。";
}
export function passwordError(password: string, confirmation: string) {
 if(password.length<8)return "新密码至少需要 8 位。";
 if(password!==confirmation)return "两次输入的密码不一致。";
 return "";
}
export function authError(error: unknown, fallback: string) {
 const code=(error as {code?:string})?.code;
 if(code==="invalid_credentials")return "邮箱或密码不正确，请重试。";
 if(code==="email_not_confirmed")return "账号邮箱尚未确认，请联系管理员。";
 if(code==="over_email_send_rate_limit"||code==="over_request_rate_limit")return "请求过于频繁，请稍后再试。";
 if(code==="weak_password")return "密码不符合安全要求，请使用更长的密码并包含大小写字母、数字和符号。";
 if(code==="same_password")return "新密码不能与原密码相同。";
 if(code==="session_not_found"||code==="session_expired")return "重置链接已失效，请重新申请。";
 return fallback;
}
export function recoveryUrl(origin: string) { return new URL("/auth/recovery",origin).href; }
export function isPublicAuthPath(path: string){return ["/login","/register","/forgot-password","/reset-password","/auth/recovery","/auth/confirm"].includes(path)}
