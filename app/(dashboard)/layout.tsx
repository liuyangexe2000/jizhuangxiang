import type { ReactNode } from "react"
import { RoleProvider } from "@/lib/role-context"
import { DictionaryProvider } from "@/lib/dictionary-context"
import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { PageAccessGuard } from "@/components/page-access-guard"
import { FeedbackTicketButton } from "@/components/feedback-ticket-button"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <DictionaryProvider>
      <TooltipProvider delay={200}>
        <div className="flex min-h-screen bg-background">
          <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
            <AppSidebar />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-7xl space-y-6">
                <PageAccessGuard>{children}</PageAccessGuard>
              </div>
            </main>
          </div>
          <FeedbackTicketButton />
        </div>
      </TooltipProvider>
      </DictionaryProvider>
    </RoleProvider>
  )
}
