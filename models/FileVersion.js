const mongoose = require("mongoose");

const fileVersionSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    versionNo: {
      type: Number,
      required: true,
      min: 1,
    },
    originalName: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      default: "application/octet-stream",
    },
    checksum: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isRestoredVersion: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// A file cannot have duplicate version numbers.
fileVersionSchema.index({ fileId: 1, versionNo: 1 }, { unique: true });

module.exports = mongoose.model("FileVersion", fileVersionSchema);