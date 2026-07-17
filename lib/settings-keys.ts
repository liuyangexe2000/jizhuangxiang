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
  /** 用箱免租天数（自提箱日起） */
  useboxFreeDays: "biz.useboxFreeDays",
  /** 用箱超期日费率（元/箱/天） */
  useboxOverdueDailyRate: "biz.useboxOverdueDailyRate",
  /** 还箱异常默认箱损费（元） */
  useboxDamageDefaultFee: "biz.useboxDamageDefaultFee",
  approvalThresholds: "biz.approvalThresholds",
  feedbackTicketEnabled: "ui.feedbackTicketEnabled",
} as const
