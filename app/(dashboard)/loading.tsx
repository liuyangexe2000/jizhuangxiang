import { PageSpinner } from "@/components/navigation-loading"

/** 路由段切换时的即时加载态（App Router） */
export default function DashboardLoading() {
  return <PageSpinner label="页面加载中" />
}
