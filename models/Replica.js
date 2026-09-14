const mongoose = require("mongoose");

const replicaSchema = new mongoose.Schema(
  {
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileVersion",
      required: true,
      index: true,
    },
    nodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageNode",
      required: true,
      index: true,
    },
    objectPath: {
      type: String,
      required: true,
    },
    checksum: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      enum: ["AVAILABLE", "MISSING", "CORRUPTED", "PENDING"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

replicaSchema.index({ versionId: 1, nodeId: 1 }, { unique: true });

module.exports = mongoose.model("Replica", replicaSchema);