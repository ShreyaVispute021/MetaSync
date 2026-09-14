const mongoose = require("mongoose");

const storageNodeSchema = new mongoose.Schema(
  {
    nodeName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    storagePath: {
      type: String,
      required: true,
      unique: true,
    },
    capacityBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    usedSpaceBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ONLINE", "OFFLINE", "MAINTENANCE"],
      default: "ONLINE",
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StorageNode", storageNodeSchema);