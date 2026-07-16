"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Ship, Calculator, CheckCircle2, Info } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CitySearchSelect } from "@/components/city-search-select"
import { useDictionary } from "@/lib/dictionary-context"
import { useResource, revalidateResource } from "@/lib/api"
import { useRole } from "@/lib/role-context"
import { pushNotification } from "@/lib/domain/notify"
import { CONTAINER_TYPES, DEFAULT_CONTAINER_TYPE } from "@/lib/container-types"
import type { ContainerType, Notification, SystemUser, UseBoxOrder, Yard } from "@/lib/types"

const priceMap: Record<string, number> = { "20GP": 2100, "40GP": 2980, "40HQ": 3280, "45HQ": 3600 }

export default function ApplyPage() {
  const { pickupCities, returnCities } = useDictionary()
  const { create } = useResource<UseBoxOrder>("orders")
  const { create: createNotif } = useResource<Notification>("notifications")
  const { data: users } = useResource<SystemUser>("users")
  const { data: yards } = useResource<Yard>("yards")
  const { user, roleId } = useRole()
  const isProxy = roleId === "R01"

  const customers = useMemo(
    () => users.filter((u) => u.roleId === "R03" && u.status === "启用"),
    [users],
  )

  /** 有启用且未删除堆场的城市集合 */
  const citiesWithYard = useMemo(() => {
    const set = new Set<string>()
    for (const y of yards) {
      if (y.enabled && !y.deleted && y.city) set.add(y.city)
    }
    return set
  }, [yards])

  const [customerOrg, setCustomerOrg] = useState("")
  const [customerType, setCustomerType] = useState<UseBoxOrder["customerType"]>("班列客户")
  const [pickupCity, setPickupCity] = useState("")
  const [returnCity, setReturnCity] = useState("")
  const [containerType, setContainerType] = useState(DEFAULT_CONTAINER_TYPE)
  const [quantity, setQuantity] = useState("")
  const [remark, setRemark] = useState("")
  const [quoted, setQuoted] = useState<number | null>(null)

  const valid =
    pickupCity &&
    returnCity &&
    containerType &&
    Number(quantity) > 0 &&
    (!isProxy || !!customerOrg)

  function assertCitiesHaveYards(): boolean {
    if (pickupCity && !citiesWithYard.has(pickupCity)) {
      toast.error("该城市没有堆场，不能申请", {
        description: `提箱城市「${pickupCity}」暂无可用堆场`,
      })
      setQuoted(null)
      return false
    }
    if (returnCity && !citiesWithYard.has(returnCity)) {
      toast.error("该城市没有堆场，不能申请", {
        description: `还箱城市「${returnCity}」暂无可用堆场`,
      })
      setQuoted(null)
      return false
    }
    return true
  }

  function handleQuote() {
    if (!valid) {
      toast.error(
        isProxy
          ? "请完整填写客户、提箱城市、还箱城市、箱型与数量"
          : "请完整填写提箱城市、还箱城市、箱型与数量（系统强校验 BR-02）",
      )
      return
    }
    if (!assertCitiesHaveYards()) return
    const unit = priceMap[containerType] ?? 3000
    setQuoted(unit * Number(quantity))
    toast.success("系统已反馈用箱服务价格")
  }

  async function handleSubmit() {
    if (quoted == null) return
    if (!assertCitiesHaveYards()) return
    if (isProxy && !customerOrg) {
      toast.error("代客申请须选择客户")
      return
    }
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    const orderNo = `UB${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${String(
      now.getTime(),
    ).slice(-4)}`
    const unit = priceMap[containerType] ?? 3000
    const customer = isProxy ? customerOrg : user?.org || user?.name || "客户"
    try {
      await create({
        orderNo,
        customer,
        customerType,
        pickupCity,
        returnCity,
        containerType: containerType as ContainerType,
        quantity: Number(quantity),
        unitPrice: unit,
        quotedUnitPrice: unit,
        status: "待确认",
        createdAt: fmt(now),
        releaseDocReady: false,
        stuffingListUploaded: false,
        returnProofUploaded: false,
        channel: "订舱后新增",
        remark,
        __auditAction: "新增",
        __auditDetail: isProxy
          ? `代客提交用箱申请 ${orderNo}（${customer}）`
          : `提交用箱申请 ${orderNo}`,
      })
      await pushNotification(createNotif, {
        type: "任务",
        level: "重要",
        title: `用箱申请待确认 · ${orderNo}`,
        desc: `${customer} · ${pickupCity}→${returnCity} · ${containerType}×${quantity}，请分配堆场并确认。`,
        module: "M01 订单处理",
        href: "/operations/usebox",
        roles: ["R01"],
      })
      await revalidateResource("notifications")
      toast.success("申请已提交，等待箱管确认堆场与价格", {
        description: `${pickupCity} → ${returnCity} · ${containerType} × ${quantity}`,
      })
      setPickupCity("")
      setReturnCity("")
      setContainerType(DEFAULT_CONTAINER_TYPE)
      setQuantity("")
      setRemark("")
      setQuoted(null)
      if (isProxy) setCustomerOrg("")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="用箱申请"
        description={
          isProxy
            ? "箱管代客提交用箱申请：须选择客户，系统报价后提交，由订单处理页确认堆场与成交价。"
            : "填写用箱信息并获取系统报价后提交申请，箱管确认分配堆场后可打印提箱单。"
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="size-4 text-primary" />
              申请信息
            </CardTitle>
            <CardDescription>请准确填写用箱申请信息（BR-02）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isProxy && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>客户 *</Label>
                  <Select
                    value={customerOrg}
                    onValueChange={(v) => {
                      setCustomerOrg(v ?? "")
                      const u = customers.find((c) => c.org === v)
                      if (u) setCustomerType("班列客户")
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择代客客户" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.org}>
                          {c.org}（{c.name}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>客户类型</Label>
                  <Select
                    value={customerType}
                    onValueChange={(v) => setCustomerType((v as UseBoxOrder["customerType"]) ?? "班列客户")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["班列客户", "多式联运客户", "租箱客户"] as const).map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pickup">提箱城市 *</Label>
                <CitySearchSelect
                  id="pickup"
                  value={pickupCity}
                  onValueChange={setPickupCity}
                  cities={pickupCities}
                  placeholder="选择提箱城市"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="return">还箱城市 *</Label>
                <CitySearchSelect
                  id="return"
                  value={returnCity}
                  onValueChange={setReturnCity}
                  cities={returnCities}
                  placeholder="选择还箱城市"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">箱型 *</Label>
                <Select value={containerType} onValueChange={(v) => setContainerType(v ?? DEFAULT_CONTAINER_TYPE)}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty">数量 *</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  placeholder="请输入用箱数量"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remark">备注</Label>
              <Textarea
                id="remark"
                placeholder="如有特殊要求可在此说明（原则上需在提箱前 3 天申请 BR-01）"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleQuote} className="gap-2">
                <Calculator className="size-4" />
                获取用箱价格
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>价格反馈</CardTitle>
              <CardDescription>系统根据库存与价格策略反馈</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {quoted == null ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                  <Calculator className="size-8 opacity-40" />
                  填写信息后点击「获取用箱价格」
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <Row label="线路" value={`${pickupCity} → ${returnCity}`} />
                    <Row label="箱型 / 数量" value={`${containerType} × ${quantity}`} />
                    <Row label="用箱单价" value={`¥${priceMap[containerType].toLocaleString()}`} />
                    {isProxy && customerOrg ? <Row label="客户" value={customerOrg} /> : null}
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
                    <span className="text-sm font-medium text-foreground">预计用箱费</span>
                    <span className="text-xl font-semibold text-primary">¥{quoted.toLocaleString()}</span>
                  </div>
                  <Button onClick={handleSubmit} className="w-full gap-2">
                    <CheckCircle2 className="size-4" />
                    提交申请
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>提交后由箱管确认并分配提/还箱堆场；确认后方可打印提箱单并生成账单。</span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>箱管确认后 24 小时内可免责取消；超时取消需承担取消费（BR-03）。</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
