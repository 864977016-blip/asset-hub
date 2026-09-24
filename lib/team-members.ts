export type TeamMember={id:string;display_name:string;email:string;role:"admin"|"member";is_disabled:boolean;pending_private_count:number};
export type ActiveInvitation={id:string;code_hint:string;created_at:string;expires_at:string};
export type GeneratedInvitation={id:string;code:string;createdAt:string;expiresAt:string};
export function registrationError(name:string,email:string,password:string,code:string){
 if(!name.trim()||name.trim().length>80)return "用户名需为 1–80 个字符。";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return "请输入有效的邮箱地址。";
 if(password.length<8)return "密码至少需要 8 位。";
 if(!/^HM-[0-9A-F]{24}$/.test(code.trim().toUpperCase()))return "请输入完整的邀请码。";
 return "";
}
