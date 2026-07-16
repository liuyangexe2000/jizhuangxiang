"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Send, Route, CalendarClock, Layers, Info, MapPin } from "lucide-react"
import { useResource } from "@/lib/api"
import { useRole } from "@/lib/role-context"
import { usePublicSettings } from "@/lib/settings-client"
import type { ApprovalThresholds, DispatchOrder, ApprovalStep } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

const carriers = ["中远海运欧洲承运", "波兰联运物流", "德铁货运代理", "中欧陆桥物流"]

// BR-09：按调运总价生成审批链
function buildApprovals(total: number, thresholds?: ApprovalThresholds): ApprovalStep[] {
  // 说明书五级：业务部门负责人、财务部门、副总、常务副总、总经理
  const chain: { level: number; role: string; approver: string }[] = [
    { level: 1, role: "业务部门负责人", approver: "张伟" },
    { level: 2, role: "财务部门", approver: "王芳" },
    { level: 3, role: "副总", approver: "李强" },
    { level: 4, role: "常务副总", approver: "赵敏" },
    { level: 5, role: "总经理", approver: "孙涛" },
  ]
  const t2 = thresholds?.level2Below ?? 20000
  const t3 = thresholds?.level3Below ?? 50000
  const need = total < t2 ? 2 : total < t3 ? 3 : 5
  return chain.slice(0, need).map((c, i) => ({
    ...c,
    status: i === 0 ? "待审批" : "未开始",
  }))
}

// BR-11 / M02-F01：调运单价随还箱范围联动配置。
// 每个提箱地对应若干"还箱范围方案"，不同范围对应不同单价与超期费标准。
interface PriceRule {
  id: string
  scope: string // 还箱范围（多点）
  unitPrice: number // 承运单价(¥/箱)
  overdue: string // 超期费标准
  suggestTerm: number // 建议用箱期(天)
  zone: "近距" | "中距" | "远距"
}

const PRICE_RULES: Record<string, PriceRule[]> = {
  汉堡HCS: [
    { id: "ham-1", scope: "不来梅 / 汉诺威", unitPrice: 620, overdue: "¥100/箱/天", suggestTerm: 21, zone: "近距" },
    { id: "ham-2", scope: "杜伊斯堡 / 纽伦堡 / 慕尼黑", unitPrice: 850, overdue: "¥120/箱/天", suggestTerm: 30, zone: "中距" },
    { id: "ham-3", scope: "华沙 / 布达佩斯 / 维也纳", unitPrice: 1180, overdue: "¥150/箱/天", suggestTerm: 45, zone: "远距" },
  ],
  马拉ADAMPOL: [
    { id: "mal-1", scope: "华沙 / 罗兹", unitPrice: 480, overdue: "¥100/箱/天", suggestTerm: 18, zone: "近距" },
    { id: "mal-2", scope: "柏林 / 布拉格", unitPrice: 720, overdue: "¥120/箱/天", suggestTerm: 25, zone: "中距" },
    { id: "mal-3", scope: "西安（境内） / 郑州（境内）", unitPrice: 2600, overdue: "¥120/箱/天", suggestTerm: 45, zone: "远距" },
  ],
  杜堡dit: [
    { id: "dui-1", scope: "汉堡 / 不来梅", unitPrice: 560, overdue: "¥100/箱/天", suggestTerm: 20, zone: "近距" },
    { id: "dui-2", scope: "纽伦堡 / 慕尼黑 / 维也纳", unitPrice: 920, overdue: "¥130/箱/天", suggestTerm: 32, zone: "中距" },
  ],
  纽伦堡CDN: [
    { id: "nue-1", scope: "慕尼黑 / 维也纳", unitPrice: 500, overdue: "¥100/箱/天", suggestTerm: 18, zone: "近距" },
    { id: "nue-2", scope: "西安（境内）", unitPrice: 2400, overdue: "¥120/箱/天", suggestTerm: 45, zone: "远距" },
  ],
  布达佩斯MCC: [
    { id: "bud-1", scope: "维也纳 / 布拉迪斯拉发", unitPrice: 700, overdue: "¥120/箱/天", suggestTerm: 30, zone: "中距" },
    { id: "bud-2", scope: "华沙 / 罗兹", unitPrice: 980, overdue: "¥140/箱/天", suggestTerm: 38, zone: "远距" },
  ],
}

const PICKUP_PLACES = Object.keys(PRICE_RULES)

const zoneTone: Record<PriceRule["zone"], string> = {
  近距: solidTone.success,
  中距: solidTone.primary,
  远距: solidTone.warning,
}

export default function DispatchApplyPage() {
  const { create } = useResource<DispatchOrder>("dispatch")
  const { user } = useRole()
  const { settings } = usePublicSettings()
  const [form, setForm] = useState({
    planTime: "",
    pickupPlace: "",
    ruleId: "",
    reason: "境外空箱返调平衡",
    quantity: "",
    useTerm: "30",
    carrier: "",
    remark: "",
  })

  const rules = form.pickupPlace ? PRICE_RULES[form.pickupPlace] ?? [] : []
  const selectedRule = useMemo(
    () => rules.find((r) => r.id === form.ruleId) ?? null,
    [rules, form.ruleId],
  )

  const unitPrice = selectedRule?.unitPrice ?? 0
  const total = Number(form.quantity || 0) * unitPrice

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function onPickupChange(v: string | null) {
    // 切换提箱地后清空已选方案，需重新联动
    setForm((f) => ({ ...f, pickupPlace: v ?? "", ruleId: "" }))
  }

  function onRuleChange(v: string | null) {
    if (!v) return
    const rule = (PRICE_RULES[form.pickupPlace] ?? []).find((r) => r.id === v)
    setForm((f) => ({
      ...f,
      ruleId: v,
      useTerm: rule ? String(rule.suggestTerm) : f.useTerm,
    }))
  }

  async function submit(mode: "draft" | "submit") {
    const required = [form.planTime, form.pickupPlace, form.ruleId, form.quantity, form.carrier]
    if (mode === "submit" && required.some((v) => !v)) {
      toast.error("请完整填写必填项（含还箱范围方案）后再提交审批")
      return
    }
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, "0")
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    const dispatchNo = `DP${stamp}${String(d.getTime()).slice(-4)}`
    const status: DispatchOrder["status"] = mode === "submit" ? "审批中" : "草稿"
    const nowStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    try {
      await create({
        dispatchNo,
        planTime: form.planTime,
        pickupPlace: form.pickupPlace,
        returnScope: selectedRule?.scope ?? "",
        reason: form.reason,
        unitPrice,
        overdueStandard: selectedRule?.overdue ?? "",
        useTerm: Number(form.useTerm || 0),
        quantity: Number(form.quantity || 0),
        carrier: form.carrier,
        totalPrice: total,
        status,
        createdBy: user?.name ?? "调运专员",
        createdAt: nowStr,
        approvals: mode === "submit" ? buildApprovals(total, settings?.approvalThresholds) : [],
        pickedCount: 0,
        returnedCount: 0,
        __auditAction: "新增",
        __auditDetail: `${mode === "submit" ? "提交" : "草稿保存"}调运申请 ${dispatchNo}`,
      })
      toast.success(
        mode === "submit"
          ? `调运申请已提交，调运总价 ¥${total.toLocaleString()}，进入多级动态审批`
          : "调运申请已保存为草稿",
      )
      setForm({
        planTime: "",
        pickupPlace: "",
        ruleId: "",
        reason: "境外空箱返调平衡",
        quantity: "",
        useTerm: "30",
        carrier: "",
        remark: "",
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M02 · 核心业务与调运管理系统"
        title="调运申请"
        description="M02-F01 调运申请与线路配置 — 选择提箱地与还箱范围方案，系统按 BR-11 自动联动单价、超期费标准并计算调运总价。"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="size-4.5 text-primary" />
              调运信息配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="计划调运时间 *">
                <Input type="date" value={form.planTime} onChange={(e) => set("planTime", e.target.value)} />
              </Field>
              <Field label="调运原因 *">
                <Select value={form.reason} onValueChange={(v) => set("reason", v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["境外空箱返调平衡", "境内外驳箱", "境外集装箱返箱", "境外空箱调运"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="提箱地 *">
                <Select value={form.pickupPlace} onValueChange={onPickupChange}>
                  <SelectTrigger><SelectValue placeholder="选择提箱地" /></SelectTrigger>
                  <SelectContent>
                    {PICKUP_PLACES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="用箱期(天) *">
                <Input type="number" min={1} value={form.useTerm} onChange={(e) => set("useTerm", e.target.value)} />
              </Field>
            </div>

            <Separator />

            {/* BR-11 还箱范围方案联动 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 text-primary" />
                还箱范围方案 *
                <span className="text-xs font-normal text-muted-foreground">（不指定单一还箱点，单价随范围联动）</span>
              </Label>
              {!form.pickupPlace ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  请先选择提箱地，系统将列出对应的还箱范围与单价方案
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rules.map((r) => {
                    const active = r.id === form.ruleId
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onRuleChange(r.id)}
                        className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                          active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Badge className={zoneTone[r.zone]}>{r.zone}</Badge>
                          <span className="text-sm font-semibold text-primary">¥{r.unitPrice.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/箱</span></span>
                        </div>
                        <p className="text-sm font-medium leading-snug text-foreground">{r.scope}</p>
                        <p className="text-xs text-muted-foreground">超期 {r.overdue} · 建议 {r.suggestTerm} 天</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="调运数量(箱) *">
                <Input type="number" min={1} placeholder="0" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </Field>
              <Field label="承运商 *">
                <Select value={form.carrier} onValueChange={(v) => set("carrier", v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="选择承运商" /></SelectTrigger>
                  <SelectContent>
                    {carriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="备注">
              <Textarea rows={2} placeholder="补充说明调运背景、特殊要求等" value={form.remark} onChange={(e) => set("remark", e.target.value)} />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button className="gap-2" onClick={() => submit("submit")}>
                <Send className="size-4" />
                提交审批
              </Button>
              <Button variant="outline" onClick={() => submit("draft")}>
                保存草稿
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4.5 text-primary" />
                费用测算
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="提箱地" value={form.pickupPlace || "—"} />
              <Row label="还箱范围" value={selectedRule?.scope ?? "—"} />
              <Row label="调运数量" value={`${form.quantity || 0} 箱`} />
              <Row label="联动单价" value={selectedRule ? `¥${unitPrice.toLocaleString()}` : "待选方案"} />
              <Row label="超期费标准" value={selectedRule?.overdue ?? "—"} />
              <Row label="用箱期" value={`${form.useTerm} 天`} />
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-medium">预计调运总价</span>
                <span className="text-lg font-semibold text-primary">¥{total.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                单价随还箱范围联动（BR-11）：选择不同范围方案将自动带出对应单价与超期费标准。
              </p>
              <p className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                调运总价决定审批层级（BR-12），全部通过后自动生成《调运审批表》并下发任务。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}
