import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { cleanupHistory, cleanupTypes, executeCleanup, previewCleanup } from "../../services/adminCleanupService.js";
import { writeAuditLog } from "../utils/audit.js";

export const types = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Cleanup types fetched", { types: cleanupTypes() }));
export const history = asyncHandler(async (_req, res) => sendSuccess(res, 200, "Cleanup history fetched", { operations: await cleanupHistory() }));
export const preview = asyncHandler(async (req, res) => {
  try {
    const result = await previewCleanup(req.user._id, req.body);
    await writeAuditLog(req, { action: "data_cleanup.preview", resourceType: "AdminCleanupOperation", resourceId: result.operation.id, summary: `${result.operation.dataType} cleanup preview: ${result.operation.targetCount} record(s)` });
    sendSuccess(res, 201, "Cleanup preview created", result);
  } catch (error) {
    await writeAuditLog(req, { action: "data_cleanup.preview_failed", resourceType: "AdminCleanupOperation", summary: `${String(req.body?.dataType || "unsupported").slice(0, 50)} cleanup preview failed: ${String(error.message).slice(0, 300)}` });
    throw error;
  }
});
export const execute = asyncHandler(async (req, res) => {
  try {
    const operation = await executeCleanup(req.user._id, req.params.id, req.body.confirmationPhrase);
    await writeAuditLog(req, { action: "data_cleanup.completed", resourceType: "AdminCleanupOperation", resourceId: operation.id, summary: `${operation.dataType} cleanup completed: ${operation.deletedCount} record(s), backup ${operation.backupIdentifier}` });
    sendSuccess(res, 200, "Backup verified and cleanup completed", { operation });
  } catch (error) {
    await writeAuditLog(req, { action: "data_cleanup.failed", resourceType: "AdminCleanupOperation", resourceId: req.params.id, summary: `Cleanup failed: ${String(error.message).slice(0, 300)}` });
    throw error;
  }
});
