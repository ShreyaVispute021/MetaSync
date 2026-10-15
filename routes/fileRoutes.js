const express = require("express");
const multer = require("multer");

const fileController = require("../controllers/fileController");
const { requireLogin } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.get("/dashboard", requireLogin, fileController.dashboard);
router.get("/recycle-bin", requireLogin, fileController.recycleBin);
router.post("/:id/delete", requireLogin, fileController.deleteFile);
router.post("/:id/recover", requireLogin, fileController.recoverFile);
router.get("/:id/verify", requireLogin, fileController.verifyIntegrity);
router.get("/duplicates", requireLogin, fileController.findDuplicates);
router.get("/storage-monitor", requireLogin, fileController.storageMonitor);
router.post("/:id/tags", requireLogin, fileController.updateTags);
router.get("/audit-logs/export", requireLogin, fileController.exportAuditLogs);

router.post(
  "/upload",
  requireLogin,
  upload.single("file"),
  fileController.uploadFile
);
router.get("/:id/download", requireLogin, fileController.downloadFile);
router.get("/:id/versions", requireLogin, fileController.showVersions);

router.post(
  "/:id/versions",
  requireLogin,
  upload.single("file"),
  fileController.addVersion
);

router.post(
  "/:id/restore/:versionId",
  requireLogin,
  fileController.restoreVersion
);

router.post("/:id/share",requireLogin,fileController.shareFile);
router.post(
  "/:id/permissions/:permissionId/revoke",
  requireLogin,
  fileController.revokePermission
);

module.exports = router;