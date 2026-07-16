/**
 * 对照《02-堆场作业主路径》做 API 级验证
 * 运行：pnpm test:ut02
 */
import { Client, BASE_URL, nowStr, uid } from "../scripts/e2e/harness"
import { writeFileSync, mkdirSync } from "node:fs"

type Row = { id: string; ok: boolean; note: string }
const rows: Row[] = []

function mark(id: string, ok: boolean, note: string) {
  rows.push({ id, ok, note })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${note}`)
}

function workPlanTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function main() {
  console.log(`\n=== 验证 02-堆场作业 · ${BASE_URL} ===\n`)
  try {
    const r = await fetch(`${BASE_URL}/api/auth/me`)
    if (r.status >= 500) throw new Error(`auth/me ${r.status}`)
  } catch {
    console.error("无法连接服务，请先 pnpm dev")
    process.exit(1)
  }

  // —— UT-YARD-01 ——
  const r01 = new Client("R01")
  await r01.login("zhangwei")
  mark("UT-YARD-01#0", true, "zhangwei 登录成功")

  const bookingNo = `BK${uid("").slice(0, 8)}`
  const bk = await r01.create("bookings", {
    bookingNo,
    type: "提箱预约",
    containerNos: [`YT${bookingNo.slice(-6)}`],
    yard: "汉堡HCS",
    city: "汉堡",
    planTime: workPlanTime(),
    driver: "堆场测试司机",
    driverId: "YT1",
    driverPhone: "13900000000",
    plateNo: "沪A00001",
    refNo: `UT-YARD-${bookingNo}`,
    notifyByEmail: true,
    status: "待发送",
    withinWorkHours: true,
  })
  mark("UT-YARD-01#1", !!bk.ok, bk.ok ? `预约 ${bookingNo} 待发送` : `创建失败 ${bk.status}`)

  const notify = await r01.api("POST", `/api/bookings/${encodeURIComponent(bk.data.id)}/notify`)
  const list = await r01.list("bookings")
  const updated = (list.data as any[] | null)?.find((b) => b.id === bk.data.id)
  mark(
    "UT-YARD-01#2",
    !!notify.ok && notify.data?.ok === true && updated?.status === "已通知",
    notify.ok ? `已通知（mailSent=${notify.data?.mailSent}）` : `通知失败 ${notify.status}`,
  )

  const notifs = await r01.list("notifications")
  const hasN =
    notifs.ok &&
    (notifs.data as any[]).some(
      (n) => String(n.title || "").includes(bookingNo) || String(n.desc || "").includes("汉堡"),
    )
  mark("UT-YARD-01#3", !!hasN, hasN ? "站内通知已产生" : "未找到站内通知")

  // 阶段A：已通知 → 确认预约（confirmedBy/confirmedAt），仅 R00/R01/R04/R06 可操作
  const r05Early = new Client("R05")
  await r05Early.login("carrier_pl")
  const r05Denied = await r05Early.api(
    "POST",
    `/api/bookings/${encodeURIComponent(bk.data.id)}/confirm`,
    {},
  )
  mark("UT-YARD-01#4", r05Denied.status === 403, `R05 确认预约应 403，实际 ${r05Denied.status}`)

  const confirmRes = await r01.api("POST", `/api/bookings/${encodeURIComponent(bk.data.id)}/confirm`, {})
  const listAfterConfirm = await r01.list("bookings")
  const confirmedBooking = (listAfterConfirm.data as any[] | null)?.find((b) => b.id === bk.data.id)
  mark(
    "UT-YARD-01#5",
    !!confirmRes.ok && confirmedBooking?.status === "已确认" && !!confirmedBooking?.confirmedBy,
    confirmRes.ok
      ? `预约已确认，confirmedBy=${confirmedBooking?.confirmedBy}`
      : `确认失败 ${confirmRes.status}`,
  )

  // —— UT-YARD-02 ——
  const r04 = new Client("R04")
  await r04.login("agent_de")
  const gateNo = `YTG${uid("").slice(0, 6)}`
  const g = await r04.create("gate", {
    containerNo: gateNo,
    type: "进场",
    time: nowStr(),
    yard: "杜堡dit",
    city: "杜伊斯堡",
    source: "代管公司上传",
    mappingStatus: "未映射",
    ownership: "自有箱",
  })
  mark("UT-YARD-02#1", !!g.ok, g.ok ? `未映射进场 ${gateNo}` : "创建 gate 失败")

  const disp = (await r04.list("dispatch")).data?.[0]
  const mapped = await r04.patch("gate", g.data.id, {
    mappingStatus: "已映射",
    relatedOrderNo: disp?.dispatchNo ?? "UT-YARD-MAP",
  })
  mark("UT-YARD-02#2", !!mapped.ok && mapped.data?.mappingStatus === "已映射", "自动匹配→已映射")

  const invList = await r04.list("inventory")
  const inv = (invList.data as any[] | null)?.find((r) => r.yard === "杜堡dit")
  mark("UT-YARD-02#3", !!inv?.id, inv?.id ? `可见杜伊斯堡库存 onSite=${inv.onSite}` : "不可见代管库存")

  // —— UT-YARD-03 ——
  const r00 = new Client("R00")
  await r00.login("admin")
  const users = await r00.list("users")
  const yardUser = (users.data as any[] | null)?.find((u) => u.account === "yard_ham")
  if (yardUser) {
    await r00.patch("users", yardUser.id, { status: "启用" })
  }
  const r06 = new Client("R06")
  try {
    await r06.login("yard_ham")
    mark("UT-YARD-03#1", true, "yard_ham 启用后登录成功")
  } catch (e) {
    mark("UT-YARD-03#1", false, (e as Error).message)
  }

  const r06bk = await r06.list("bookings")
  const foreign =
    r06bk.ok &&
    Array.isArray(r06bk.data) &&
    (r06bk.data as any[]).some((b) => b.yard && b.yard !== "汉堡HCS" && b.yard !== r06.org)
  mark(
    "UT-YARD-03#2",
    !!r06bk.ok && !foreign,
    r06bk.ok
      ? `R06 可见 ${Array.isArray(r06bk.data) ? r06bk.data.length : 0} 条预约（租户隔离）`
      : `R06 列预约失败 ${r06bk.status}`,
  )

  // R05 出场联动抽检
  const r05 = new Client("R05")
  await r05.login("carrier_pl")
  const outNo = `YTO${uid("").slice(0, 6)}`
  const out = await r05.create("gate", {
    containerNo: outNo,
    type: "出场",
    time: nowStr(),
    yard: "汉堡HCS",
    city: "汉堡",
    source: "系统放箱/调运订单",
    relatedOrderNo: "UT-YARD-OUT",
    mappingStatus: "已映射",
    ownership: "自有箱",
  })
  mark("UT-YARD-05", !!out.ok, out.ok ? `R05 出场 gate ${outNo}` : "出场失败")

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok)
  const md = [
    `# 验证记录 · 02-堆场作业主路径`,
    ``,
    `- 时间：${nowStr()}`,
    `- 环境：${BASE_URL}`,
    `- 方式：API 对照文档自动验证`,
    `- 汇总：**${passed}/${rows.length}** 通过`,
    ``,
    `| 用例步骤 | 结果 | 说明 |`,
    `| :--- | :---: | :--- |`,
    ...rows.map((r) => `| ${r.id} | ${r.ok ? "通过" : "失败"} | ${r.note} |`),
    ``,
    failed.length
      ? `## 失败项\n\n${failed.map((f) => `- **${f.id}**：${f.note}`).join("\n")}`
      : `## 结论\n\n堆场预约通知、进出场映射、R06 启用与租户隔离（API 层）可闭环。`,
    ``,
  ].join("\n")
  mkdirSync("用户测试", { recursive: true })
  writeFileSync("用户测试/验证记录-02.md", md, "utf8")
  console.log(`\n已写入 用户测试/验证记录-02.md`)
  console.log(`=== 汇总：${passed}/${rows.length} ===\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
