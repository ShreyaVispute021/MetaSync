const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileVersion",
      default: null,
    },
    revision: {
      type: Number,
      default: 1,
      min: 1,
    },
    mimeType: {
      type: String,
      default: "application/octet-stream",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DELETED", "PENDING_RECOVERY"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

// Important DBMS index: fast active-file listing for one owner.
fileSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("File", fileSchema);