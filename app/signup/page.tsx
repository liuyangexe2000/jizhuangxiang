"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { validateApplication } from "@/lib/domain/user-signup-plan"

export default function SignupPage() {
  const [name, setName] = useState("")
  const [org, setOrg] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [remark, setRemark] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = validateApplication({ name, org, email, phone, remark })
    if (!result.ok) {
      toast.error(result.errors[0] ?? "请完善申请信息")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/account-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, org, email, phone, remark }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "提交失败")
        return
      }
      setSubmitted(true)
      toast.success("申请已提交，请等待管理员审批")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>账号申请</CardTitle>
          <CardDescription>
            填写基本信息提交申请，管理员审批通过后将开通客户门户账号。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                您的申请已收到，我们将在 1～3 个工作日内完成审核。审批结果将通过您留存的邮箱/手机联系。
              </p>
              <Link
                href="/login"
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent"
              >
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name">姓名 *</Label>
                <Input
                  id="signup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="您的姓名"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-org">所属组织 *</Label>
                <Input
                  id="signup-org"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="公司 / 组织名称"
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email">邮箱 *</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-phone">手机 *</Label>
                <Input
                  id="signup-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="手机号码"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-remark">申请说明</Label>
                <Textarea
                  id="signup-remark"
                  rows={2}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="可选：业务需求说明"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "提交中…" : "提交申请"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                已有账号？{" "}
                <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                  返回登录
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
