"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { validateApplication } from "@/lib/domain/user-signup-plan"

export default function SignupPage() {
  const [name, setName] = useState("")
  const [org, setOrg] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = validateApplication({ name, org, email, phone })
    if (!result.ok) {
      toast.error(result.errors[0] ?? "请完善申请信息")
      return
    }
    // TODO: POST /api/account-applications
    toast.info("功能开发中，请联系管理员")
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>账号申请</CardTitle>
          <CardDescription>
            填写基本信息提交申请。正式开通流程开发中，紧急需求请联系管理员。
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" className="w-full">
              提交申请
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              已有账号？{" "}
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                返回登录
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
