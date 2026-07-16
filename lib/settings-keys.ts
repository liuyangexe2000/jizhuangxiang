/** 客户端可安全引用的设置键常量（无 server-only） */
export const SETTING_KEYS = {
  showDemoAccounts: "login.showDemoAccounts",
  showUnauthorizedMenus: "nav.showUnauthorizedMenus",
  aclNav: "acl.nav",
  aclResources: "acl.resources",
  cancelFreeHours: "biz.cancelFreeHours",
  returnBookingLeadHours: "biz.returnBookingLeadHours",
  workHours: "biz.workHours",
  billConfirmDays: "biz.billConfirmDays",
  returnProofOverdueDays: "biz.returnProofOverdueDays",
  approvalThresholds: "biz.approvalThresholds",
  feedbackTicketEnabled: "ui.feedbackTicketEnabled",
} as const
