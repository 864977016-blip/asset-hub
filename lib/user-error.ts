export function userError(error: unknown, fallback = "保存失败，请重试。") {
  const e = error as { code?: string; message?: string };
  const message = e?.message || "";
  if (e?.code === "42501" || /permission|权限|row.level|未登录/i.test(message)) return "你目前没有权限执行此操作。";
  if (e?.code === "PGRST116" || /不存在|not found/i.test(message)) return "这项内容已不存在。";
  if (/标签已存在|名称不能为空|请选择|已变化|不能超过|不能为空|通用规范不可|移动失败，原素材未改变|移动结果暂时无法确认|已归档/.test(message)) return message;
  if (e?.code === "23505" || /duplicate key/i.test(message)) return "名称已存在，请使用已有内容或更换名称。";
  return fallback;
}
