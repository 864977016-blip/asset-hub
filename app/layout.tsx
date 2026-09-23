import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "火麦-素材共享",
  description: "火麦-素材共享 · 设计团队素材与店铺资产工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
