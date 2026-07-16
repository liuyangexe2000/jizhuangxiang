/**
 * 反馈工单截图归一化（兼容旧单图字段）
 */
import type { FeedbackScreenshot, FeedbackTicket } from "@/lib/types"

export const FEEDBACK_SCREENSHOT_MAX = 3

export function ticketScreenshots(ticket: Pick<FeedbackTicket, "screenshots" | "screenshotDataUrl" | "screenshotFileName">): FeedbackScreenshot[] {
  if (Array.isArray(ticket.screenshots) && ticket.screenshots.length > 0) {
    return ticket.screenshots.filter((s) => !!s?.dataUrl).slice(0, FEEDBACK_SCREENSHOT_MAX)
  }
  if (ticket.screenshotDataUrl) {
    return [
      {
        dataUrl: ticket.screenshotDataUrl,
        fileName: ticket.screenshotFileName || "screenshot.png",
      },
    ]
  }
  return []
}
