const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["READ", "WRITE", "OWNER"],
      required: true,
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Prevents duplicate permission rows for the same user and file.
permissionSchema.index({ fileId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Permission", permissionSchema);