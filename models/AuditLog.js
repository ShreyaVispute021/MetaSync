const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "FILE_UPLOADED",
        "FILE_DOWNLOADED",
        "FILE_SHARED",
        "PERMISSION_REVOKED",
        "VERSION_CREATED",
        "VERSION_RESTORED",
        "FILE_DELETED",
        "CONFLICT_DETECTED",
        "RECOVERY_COMPLETED",
      ],
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
      index: true,
    },
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileVersion",
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ fileId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);