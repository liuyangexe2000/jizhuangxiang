"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { SETTING_KEYS } from "@/lib/settings-keys"
import type { ApprovalThresholds, RoleId, WorkHoursConfig } from "@/lib/types"
import { roles as roleDefs } from "@/lib/mock-data"

const ROLE_IDS: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

type AdminSettingsPayload = {
  showDemoAccounts: boolean
  showUnauthorizedMenus: Record<RoleId, boolean>
  cancelFreeHours: number
  returnBookingLeadHours: number
  workHours: WorkHoursConfig
  billConfirmDays: number
  returnProofOverdueDays: number
  approvalThresholds: ApprovalThresholds
  feedbackTicketEnabled: boolean
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AdminSettingsPayload | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "加载失败")
        setForm({
          showDemoAccounts: !!data.showDemoAccounts,
          showUnauthorizedMenus: data.showUnauthorizedMenus,
          cancelFreeHours: Number(data.cancelFreeHours) || 24,
          returnBookingLeadHours: Number(data.returnBookingLeadHours) || 24,
          workHours: data.workHours || { startHour: 8, endHour: 18 },
          billConfirmDays: Number(data.billConfirmDays) || 3,
          returnProofOverdueDays: Number(data.returnProofOverdueDays) || 3,
          approvalThresholds: data.approvalThresholds || { level2Below: 20000, level3Below: 50000 },
          feedbackTicketEnabled: data.feedbackTicketEnabled !== false,
        })
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      const body = {
        [SETTING_KEYS.showDemoAccounts]: form.showDemoAccounts,
        [SETTING_KEYS.showUnauthorizedMenus]: form.showUnauthorizedMenus,
        [SETTING_KEYS.cancelFreeHours]: form.cancelFreeHours,
        [SETTING_KEYS.returnBookingLeadHours]: form.returnBookingLeadHours,
        [SETTING_KEYS.workHours]: form.workHours,
        [SETTING_KEYS.billConfirmDays]: form.billConfirmDays,
        [SETTING_KEYS.returnProofOverdueDays]: form.returnProofOverdueDays,
        [SETTING_KEYS.approvalThresholds]: form.approvalThresholds,
        [SETTING_KEYS.feedbackTicketEnabled]: form.feedbackTicketEnabled,
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "保存失败")
      toast.success("系统参数已保存")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return <p className="p-6 text-sm text-muted-foreground">加载系统参数…</p>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="系统参数"
        description="登录演示账号开关、右下角工单入口、各角色无权限菜单显示策略，以及业务时限/审批阈值。"
        actions={
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存全部"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">登录与侧栏</CardTitle>
          <CardDescription>影响登录页演示入口与左侧菜单无权限项展示方式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">显示登录页演示账号</p>
              <p className="text-xs text-muted-foreground">关闭后右下角演示账号抽屉不再出现</p>
            </div>
            <Switch
              checked={form.showDemoAccounts}
              onCheckedChange={(v) => setForm({ ...form, showDemoAccounts: !!v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">显示右下角软件工单按钮</p>
              <p className="text-xs text-muted-foreground">开启后各业务页可提交 Bug / 需求反馈工单</p>
            </div>
            <Switch
              checked={form.feedbackTicketEnabled}
              onCheckedChange={(v) => setForm({ ...form, feedbackTicketEnabled: !!v })}
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">各角色是否显示无权限菜单（灰显锁定）</p>
            <p className="text-xs text-muted-foreground">
              关闭后该角色侧栏直接隐藏无权限项。切换后会立即保存；若执行过数据库初始化（pnpm db:init）会恢复为默认「全部开启」。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_IDS.map((rid) => {
                const name = roleDefs.find((r) => r.id === rid)?.name ?? rid
                return (
                  <label key={rid} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{rid}</span> {name}
                    </span>
                    <Switch
                      checked={form.showUnauthorizedMenus[rid] !== false}
                      disabled={saving}
                      onCheckedChange={(v) => {
                        const next = { ...form.showUnauthorizedMenus, [rid]: !!v }
                        setForm({ ...form, showUnauthorizedMenus: next })
                        void (async () => {
                          setSaving(true)
                          try {
                            const res = await fetch("/api/settings", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                [SETTING_KEYS.showUnauthorizedMenus]: next,
                              }),
                            })
                            const data = await res.json().catch(() => ({}))
                            if (!res.ok) throw new Error(data.error || "保存失败")
                            toast.success(`${rid} 菜单策略已保存`)
                          } catch (e) {
                            toast.error((e as Error).message)
                          } finally {
                            setSaving(false)
                          }
                        })()
                      }}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">业务参数</CardTitle>
          <CardDescription>时限与审批阈值，保存后即时作用于校验逻辑</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="免责取消时限（小时）"
            value={form.cancelFreeHours}
            onChange={(n) => setForm({ ...form, cancelFreeHours: n })}
          />
          <Field
            label="还箱预约最短提前（小时）"
            value={form.returnBookingLeadHours}
            onChange={(n) => setForm({ ...form, returnBookingLeadHours: n })}
          />
          <Field
            label="账单确认宽限（天）"
            value={form.billConfirmDays}
            onChange={(n) => setForm({ ...form, billConfirmDays: n })}
          />
          <Field
            label="还箱证明逾期（天）"
            value={form.returnProofOverdueDays}
            onChange={(n) => setForm({ ...form, returnProofOverdueDays: n })}
          />
          <Field
            label="工作日开始时刻（时）"
            value={form.workHours.startHour}
            onChange={(n) => setForm({ ...form, workHours: { ...form.workHours, startHour: n } })}
          />
          <Field
            label="工作日结束时刻（时，不含）"
            value={form.workHours.endHour}
            onChange={(n) => setForm({ ...form, workHours: { ...form.workHours, endHour: n } })}
          />
          <Field
            label="审批：低于此金额仅 2 级"
            value={form.approvalThresholds.level2Below}
            onChange={(n) =>
              setForm({
                ...form,
                approvalThresholds: { ...form.approvalThresholds, level2Below: n },
              })
            }
          />
          <Field
            label="审批：低于此金额 3 级，否则 5 级"
            value={form.approvalThresholds.level3Below}
            onChange={(n) =>
              setForm({
                ...form,
                approvalThresholds: { ...form.approvalThresholds, level3Below: n },
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
