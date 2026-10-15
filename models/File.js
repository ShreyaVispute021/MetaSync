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
      tags: {
        type: [String],
        default: [],
        validate: {
          validator: (tags) =>
            tags.length <= 10 &&
            tags.every((tag) =>
              typeof tag === "string" &&
              tag.trim().length > 0 &&
              tag.trim().length <= 30
            ),
          message: "Use up to 10 non-empty tags, each at most 30 characters.",
        },
      },
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