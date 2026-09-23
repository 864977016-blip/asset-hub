import type { Inspiration, RecentAsset, Store } from "./types";

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;

export const inspirations: Inspiration[] = [
  { id: "in-1", title: "粗野主义混凝土亭", source: "Pinterest", tags: [{id:"mock-architecture",name:"建筑",group_name:"space"}, {id:"mock-brutal",name:"粗野主义",group_name:"style"}], image: photo("photo-1487958449943-2429e8be8625"), ratio: "tall" },
  { id: "in-2", title: "哑光黑精华瓶包装", source: "Behance", tags: [{id:"mock-pack",name:"包装设计",group_name:"usage"}], image: photo("photo-1611930022073-b7a4ba5fcccd"), ratio: "short" },
  { id: "in-3", title: "Amazon A+ 模块化排版", source: "火麦-素材共享", tags: [{id:"mock-commerce",name:"电商视觉",group_name:"usage"}], image: photo("photo-1556742049-0cfed4f6a45d"), ratio: "medium" },
  { id: "in-4", title: "日式原木风客厅研究", source: "Same Energy", tags: [{id:"mock-space",name:"室内空间",group_name:"space"}], image: photo("photo-1600210492486-724fe5c67fb0"), ratio: "tall" },
  { id: "in-5", title: "先锋时尚大衣特写", source: "Pinterest", tags: [{id:"mock-fashion",name:"时尚造型",group_name:"style"}], image: photo("photo-1483985988355-763728e1935b"), ratio: "tall" },
  { id: "in-6", title: "瑞士排版指南展册", source: "Behance", tags: [{id:"mock-graphic",name:"平面设计",group_name:"usage"}], image: photo("photo-1543002588-bfa74002ed7e"), ratio: "medium" },
  { id: "in-7", title: "玄武岩一体式厨房岛台", source: "Pinterest", tags: [{id:"mock-interior",name:"室内空间",group_name:"space"}], image: photo("photo-1556912167-f556f1f39fdf"), ratio: "medium" },
  { id: "in-8", title: "手工陶器美学特写", source: "Same Energy", tags: [{id:"mock-life",name:"生活方式",group_name:"other"}], image: photo("photo-1493106641515-6b5631de4bb9"), ratio: "tall" },
];

export const stores: Store[] = [
  { id: "amiose", name: "AMOISE 官方旗舰店", count: 128, recent: "Amazon A+ 视觉模板", cover: inspirations[0].image },
  { id: "fgu", name: "FGU 独立站美学", count: 84, recent: "极简包装源文件", cover: inspirations[1].image },
  { id: "fictor", name: "FICTOR 家居空间", count: 56, recent: "粗野主义混凝土亭", cover: inspirations[2].image },
  { id: "mavora", name: "Mavora 概念店", count: 92, recent: "日式原木风客厅研究", cover: inspirations[3].image },
];

export const recentAssets: RecentAsset[] = [
  { id: "as-1", name: "粗野主义混凝土亭主视觉", store: "AMOISE", workstation: "2号 · 小李", type: "PSD", cover: inspirations[0].image },
  { id: "as-2", name: "哑光黑精华瓶包装渲染", store: "FGU", workstation: "1号 · 张伟", type: "A+", cover: inspirations[1].image },
  { id: "as-3", name: "Amazon 模块化排版栅格", store: "FICTOR", workstation: "3号 · 娜娜", type: "场景图", cover: inspirations[2].image },
];
