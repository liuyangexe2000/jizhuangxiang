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
import { CitySearchSelect } from "@/components/city-search-select"
import { useResource } from "@/lib/api"
import { useDictionary } from "@/lib/dictionary-context"
import { useRole } from "@/lib/role-context"
import { usePublicSettings } from "@/lib/settings-client"
import type {
  ApprovalThresholds,
  DispatchOrder,
  ApprovalStep,
  DispatchPriceRule,
  Carrier,
  DispatchApprovalLevel,
  SystemUser,
  Yard,
} from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

// BR-09：按调运总价生成审批链（审批人从库内配置 + 用户表解析）
function buildApprovals(
  total: number,
  chain: DispatchApprovalLevel[],
  users: SystemUser[],
  thresholds?: ApprovalThresholds,
): ApprovalStep[] {
  const t2 = thresholds?.level2Below ?? 20000
  const t3 = thresholds?.level3Below ?? 50000
  const need = total < t2 ? 2 : total < t3 ? 3 : 5
  const sorted = [...chain].sort((a, b) => a.level - b.level).slice(0, need)
  return sorted.map((c, i) => {
    const u = users.find((x) => x.account === c.account && x.status === "启用")
    return {
      level: c.level,
      role: c.roleTitle,
      approver: u?.name ?? c.account,
      status: i === 0 ? "待审批" : "未开始",
    }
  })
}

const zoneTone: Record<DispatchPriceRule["zone"], string> = {
  近距: solidTone.success,
  中距: solidTone.primary,
  远距: solidTone.warning,
}

export default function DispatchApplyPage() {
  const { create } = useResource<DispatchOrder>("dispatch")
  const { data: priceRules } = useResource<DispatchPriceRule>("dispatchPriceRules")
  const { data: carrierRows } = useResource<Carrier>("carriers")
  const { data: approvalChain } = useResource<DispatchApprovalLevel>("dispatchApprovalChain")
  const { data: users } = useResource<SystemUser>("users")
  const { data: yards } = useResource<Yard>("yards")
  const { pickupCities } = useDictionary()
  const { user } = useRole()
  const { settings } = usePublicSettings()
  const [form, setForm] = useState({
    planTime: "",
    pickupCity: "",
    pickupPlace: "",
    ruleId: "",
    reason: "境外空箱返调平衡",
    quantity: "",
    useTerm: "30",
    carrier: "",
    remark: "",
  })

  const enabledRules = useMemo(
    () => priceRules.filter((r) => r.enabled !== false),
    [priceRules],
  )
  const enabledYards = useMemo(
    () => yards.filter((y) => y.enabled && !y.deleted),
    [yards],
  )
  const yardsInCity = useMemo(
    () => (form.pickupCity ? enabledYards.filter((y) => y.city === form.pickupCity) : []),
    [enabledYards, form.pickupCity],
  )
  const carriers = useMemo(
    () => carrierRows.filter((c) => c.enabled !== false).map((c) => c.name),
    [carrierRows],
  )

  const rules = form.pickupPlace
    ? enabledRules.filter((r) => r.pickupPlace === form.pickupPlace)
    : []
  const selectedRule = useMemo(
    () => rules.find((r) => r.id === form.ruleId) ?? null,
    [rules, form.ruleId],
  )

  const unitPrice = Number(selectedRule?.unitPrice ?? 0)
  const total = Number(form.quantity || 0) * unitPrice

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function onPickupCityChange(city: string) {
    setForm((f) => ({ ...f, pickupCity: city, pickupPlace: "", ruleId: "" }))
  }

  function onPickupYardChange(v: string | null) {
    setForm((f) => ({ ...f, pickupPlace: v ?? "", ruleId: "" }))
  }

  function onRuleChange(v: string | null) {
    if (!v) return
    const rule = rules.find((r) => r.id === v)
    setForm((f) => ({
      ...f,
      ruleId: v,
      useTerm: rule ? String(rule.suggestTerm) : f.useTerm,
    }))
  }

  async function submit(mode: "draft" | "submit") {
    const required = [form.planTime, form.pickupCity, form.pickupPlace, form.ruleId, form.quantity, form.carrier]
    if (mode === "submit" && required.some((v) => !v)) {
      toast.error("请完整填写必填项（含城市、提箱堆场与还箱范围方案）后再提交审批")
      return
    }
    if (mode === "submit" && form.pickupPlace && rules.length === 0) {
      toast.error("该提箱堆场暂无启用价目方案，请先在调运价目中配置")
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
        approvals:
          mode === "submit"
            ? buildApprovals(total, approvalChain, users, settings?.approvalThresholds)
            : [],
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
        pickupCity: "",
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
              <Field label="提箱城市 *">
                <CitySearchSelect
                  value={form.pickupCity}
                  onValueChange={onPickupCityChange}
                  cities={pickupCities}
                  placeholder="选择城市"
                />
              </Field>
              <Field label="提箱堆场 *">
                <Select
                  value={form.pickupPlace}
                  disabled={!form.pickupCity}
                  onValueChange={onPickupYardChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.pickupCity ? "选择该城市堆场" : "请先选择城市"} />
                  </SelectTrigger>
                  <SelectContent>
                    {yardsInCity.map((y) => (
                      <SelectItem key={y.id} value={y.name}>
                        {y.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="用箱期(天) *">
                <Input type="number" min={1} value={form.useTerm} onChange={(e) => set("useTerm", e.target.value)} />
              </Field>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 text-primary" />
                还箱范围方案 *
                <span className="text-xs font-normal text-muted-foreground">（不指定单一还箱点，单价随范围联动）</span>
              </Label>
              {!form.pickupPlace ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  请先选择提箱城市与堆场，系统将列出对应的还箱范围与单价方案
                </p>
              ) : rules.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  该提箱堆场暂无启用价目方案，请联系管理员在调运价目中配置
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
                          <span className="text-sm font-semibold text-primary">
                            ¥{r.unitPrice.toLocaleString()}
                            <span className="text-xs font-normal text-muted-foreground">/箱</span>
                          </span>
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
              <Row label="提箱城市" value={form.pickupCity || "—"} />
              <Row label="提箱堆场" value={form.pickupPlace || "—"} />
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
