const mongoose = require("mongoose");

const operationSchema = new mongoose.Schema(
  {
    operationId: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["UPLOAD", "UPDATE", "RESTORE", "DELETE", "REPLICATION"],
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "FILE_STORED", "METADATA_COMMITTED", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    currentStep: {
      type: String,
      default: "Operation created",
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

operationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Operation", operationSchema);