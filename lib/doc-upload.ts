/** 随箱资料 / 还箱证明允许的类型与大小 */
export const DOC_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export const DOC_UPLOAD_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"

export function validateDocUploadFile(file: File): string | null {
  if (!file || file.size <= 0) return "请选择要上传的文件"
  if (file.size > DOC_UPLOAD_MAX_BYTES) return "文件不能超过 8MB"
  return null
}
