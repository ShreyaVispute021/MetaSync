const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const File = require("../models/File");
const FileVersion = require("../models/FileVersion");
const StorageNode = require("../models/StorageNode");
const Replica = require("../models/Replica");
const Operation = require("../models/Operation");
const AuditLog = require("../models/AuditLog");

const storageBase = path.join(process.cwd(), "storage");

const Permission = require("../models/Permission");
const User = require("../models/User");

async function ensureStorageNodes() {
  const nodeDefinitions = [
    {
      nodeName: "Node 1",
      storagePath: path.join(storageBase, "node1"),
    },
    {
      nodeName: "Node 2",
      storagePath: path.join(storageBase, "node2"),
    },
    {
      nodeName: "Node 3",
      storagePath: path.join(storageBase, "node3"),
    },
  ];

  for (const node of nodeDefinitions) {
    await fs.mkdir(node.storagePath, { recursive: true });

    await StorageNode.findOneAndUpdate(
      { nodeName: node.nodeName },
      {
        $setOnInsert: {
          storagePath: node.storagePath,
          capacityBytes: 1073741824,
          usedSpaceBytes: 0,
          status: "ONLINE",
        },
        $set: {
          lastHeartbeat: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }
}


exports.dashboard = async (req, res) => {
  try {
    await ensureStorageNodes();

    const q = String(req.query.q || "").trim().slice(0, 100);
    const ext = String(req.query.ext || "")
      .replace(/^\./, "")
      .trim()
      .slice(0, 10);
    const allowedSorts = ["newest", "oldest", "nameAsc", "nameDesc"];
    const sort = allowedSorts.includes(req.query.sort)
      ? req.query.sort
      : "newest";

    const requestedPage = Number.parseInt(req.query.page, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
    const limit = 10;

    const conditions = [
      {
        ownerId: req.session.userId,
        status: "ACTIVE",
      },
    ];

    if (q) {
      const safeSearch = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({
        name: { $regex: safeSearch, $options: "i" },
      });
    }

    if (ext && /^[a-zA-Z0-9]+$/.test(ext)) {
      const safeExt = ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({
        name: { $regex: `\\.${safeExt}$`, $options: "i" },
      });
    }

    const filter = { $and: conditions };

    const sortOptions = {
      newest: { updatedAt: -1 },
      oldest: { updatedAt: 1 },
      nameAsc: { name: 1 },
      nameDesc: { name: -1 },
    };

    const [files, nodes, totalFiles] = await Promise.all([
      File.find(filter)
        .populate("currentVersionId")
        .sort(sortOptions[sort])
        .skip((page - 1) * limit)
        .limit(limit),
      StorageNode.find().sort({ nodeName: 1 }),
      File.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalFiles / limit));

    res.render("files/dashboard", {
      files,
      nodes,
      userName: req.session.userName,
      message: req.query.message || null,
      error: req.query.error || null,
      q,
      ext,
      sort,
      page: Math.min(page, totalPages),
      totalPages,
      totalFiles,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};


exports.uploadFile = async (req, res) => {
  let operation = null;

  try {
    if (!req.file) {
      return res.redirect("/files/dashboard?error=Please select a file.");
    }

    await ensureStorageNodes();

    const node = await StorageNode.findOne({
      _id: req.body.nodeId,
      status: "ONLINE",
    });

    if (!node) {
      await fs.unlink(req.file.path);
      return res.redirect("/files/dashboard?error=Selected storage node is unavailable.");
    }

    operation = await Operation.create({
      operationId: crypto.randomUUID(),
      type: "UPLOAD",
      initiatedBy: req.session.userId,
      status: "PENDING",
      currentStep: "Upload request received",
    });

    const fileBuffer = await fs.readFile(req.file.path);
    const checksum = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    const file = await File.create({
      name: req.file.originalname,
      ownerId: req.session.userId,
      mimeType: req.file.mimetype,
    });

    operation.fileId = file._id;
    operation.status = "FILE_STORED";
    operation.currentStep = "Binary file copied to selected storage node";
    await operation.save();

    const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
    const objectName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const destinationPath = path.join(node.storagePath, objectName);

    await fs.copyFile(req.file.path, destinationPath);
    await fs.unlink(req.file.path);

    const version = await FileVersion.create({
      fileId: file._id,
      versionNo: 1,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      checksum,
      createdBy: req.session.userId,
    });

    await Replica.create({
      versionId: version._id,
      nodeId: node._id,
      objectPath: destinationPath,
      checksum,
      state: "AVAILABLE",
    });

    file.currentVersionId = version._id;
    await file.save();

    node.usedSpaceBytes += req.file.size;
    await node.save();

    await AuditLog.create({
      actorId: req.session.userId,
      action: "FILE_UPLOADED",
      fileId: file._id,
      versionId: version._id,
      details: {
        nodeName: node.nodeName,
        checksum,
        size: req.file.size,
      },
    });

    operation.status = "COMPLETED";
    operation.currentStep = "Metadata, replica, and audit records created";
    await operation.save();

    res.redirect("/files/dashboard?message=File uploaded successfully.");
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    if (operation) {
      operation.status = "FAILED";
      operation.currentStep = "Upload failed";
      operation.errorMessage = error.message;
      await operation.save();
    }

    res.redirect("/files/dashboard?error=Upload failed. A recovery operation was recorded.");
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    if (!file) {
      return res.status(404).send("File not found or access denied.");
    }

    const replica = await Replica.findOne({
      versionId: file.currentVersionId,
      state: "AVAILABLE",
    });

    if (!replica) {
      return res.status(404).send("No healthy replica is available.");
    }

    await AuditLog.create({
      actorId: req.session.userId,
      action: "FILE_DOWNLOADED",
      fileId: file._id,
      versionId: file.currentVersionId,
      details: {
        replicaPath: replica.objectPath,
      },
    });

    res.download(replica.objectPath, file.name);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.showVersions = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    if (!file) {
      return res.status(404).send("File not found or access denied.");
    }

    const [versions, nodes, permissions] = await Promise.all([
      FileVersion.find({ fileId: file._id }).sort({ versionNo: -1 }),
      StorageNode.find({ status: "ONLINE" }).sort({ nodeName: 1 }),
      Permission.find({ fileId: file._id }).populate("userId", "name email"),
    ]);

    res.render("files/versions", {
      file,
      versions,
      nodes,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
};

exports.addVersion = async (req, res) => {
  let operation = null;

  try {
    if (!req.file) {
      return res.redirect(`/${req.params.id}/versions?error=Select a file.`);
    }

    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    const node = await StorageNode.findOne({
      _id: req.body.nodeId,
      status: "ONLINE",
    });

    if (!file || !node) {
      await fs.unlink(req.file.path);
      return res.redirect(`/files/${req.params.id}/versions?error=File or node unavailable.`);
    }

    operation = await Operation.create({
      operationId: crypto.randomUUID(),
      type: "UPDATE",
      fileId: file._id,
      initiatedBy: req.session.userId,
      status: "PENDING",
      currentStep: "New version requested",
    });

    const latestVersion = await FileVersion.findOne({ fileId: file._id })
      .sort({ versionNo: -1 });

    const buffer = await fs.readFile(req.file.path);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
    const destinationPath = path.join(
      node.storagePath,
      `${Date.now()}-${crypto.randomUUID()}-${safeName}`
    );

    await fs.copyFile(req.file.path, destinationPath);
    await fs.unlink(req.file.path);

    const version = await FileVersion.create({
      fileId: file._id,
      versionNo: latestVersion.versionNo + 1,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      checksum,
      createdBy: req.session.userId,
    });

    await Replica.create({
      versionId: version._id,
      nodeId: node._id,
      objectPath: destinationPath,
      checksum,
      state: "AVAILABLE",
    });

    // Optimistic concurrency control:
    // update succeeds only if the submitted revision is still current.
    const updatedFile = await File.findOneAndUpdate(
      {
        _id: file._id,
        revision: Number(req.body.expectedRevision),
      },
      {
        $set: {
          currentVersionId: version._id,
          mimeType: req.file.mimetype,
        },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (!updatedFile) {
      operation.status = "FAILED";
      operation.currentStep = "Concurrency conflict detected";
      operation.errorMessage = "Another user already created a newer version.";
      await operation.save();

      await AuditLog.create({
        actorId: req.session.userId,
        action: "CONFLICT_DETECTED",
        fileId: file._id,
        versionId: version._id,
        details: { expectedRevision: req.body.expectedRevision },
      });

      return res.redirect(
        `/files/${file._id}/versions?error=Update rejected because the file revision changed.`
      );
    }

    node.usedSpaceBytes += req.file.size;
    await node.save();

    await AuditLog.create({
      actorId: req.session.userId,
      action: "VERSION_CREATED",
      fileId: file._id,
      versionId: version._id,
      details: {
        versionNo: version.versionNo,
        nodeName: node.nodeName,
      },
    });

    operation.status = "COMPLETED";
    operation.currentStep = "Version metadata and replica created";
    await operation.save();

    res.redirect(`/files/${file._id}/versions?message=New version created successfully.`);
  } catch (error) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});

    if (operation) {
      operation.status = "FAILED";
      operation.errorMessage = error.message;
      await operation.save();
    }

    res.redirect(`/files/${req.params.id}/versions?error=Version update failed.`);
  }
};

exports.restoreVersion = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    const sourceVersion = await FileVersion.findOne({
      _id: req.params.versionId,
      fileId: req.params.id,
    });

    if (!file || !sourceVersion) {
      return res.status(404).send("File or version not found.");
    }

    const sourceReplica = await Replica.findOne({
      versionId: sourceVersion._id,
      state: "AVAILABLE",
    });

    if (!sourceReplica) {
      return res.redirect(`/files/${file._id}/versions?error=Selected version has no healthy replica.`);
    }

    const latestVersion = await FileVersion.findOne({ fileId: file._id })
      .sort({ versionNo: -1 });

    const restoredVersion = await FileVersion.create({
      fileId: file._id,
      versionNo: latestVersion.versionNo + 1,
      originalName: sourceVersion.originalName,
      size: sourceVersion.size,
      mimeType: sourceVersion.mimeType,
      checksum: sourceVersion.checksum,
      createdBy: req.session.userId,
      isRestoredVersion: true,
    });

    await Replica.create({
      versionId: restoredVersion._id,
      nodeId: sourceReplica.nodeId,
      objectPath: sourceReplica.objectPath,
      checksum: sourceReplica.checksum,
      state: "AVAILABLE",
    });

    const updatedFile = await File.findOneAndUpdate(
      {
        _id: file._id,
        revision: Number(req.body.expectedRevision),
      },
      {
        $set: {
          currentVersionId: restoredVersion._id,
          mimeType: restoredVersion.mimeType,
        },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (!updatedFile) {
      return res.redirect(`/files/${file._id}/versions?error=Restore rejected due to a revision conflict.`);
    }

    await AuditLog.create({
      actorId: req.session.userId,
      action: "VERSION_RESTORED",
      fileId: file._id,
      versionId: restoredVersion._id,
      details: {
        restoredFromVersion: sourceVersion.versionNo,
        newVersion: restoredVersion.versionNo,
      },
    });

    res.redirect(`/files/${file._id}/versions?message=Older version restored as a new current version.`);
  } catch (error) {
    res.redirect(`/files/${req.params.id}/versions?error=Restore failed.`);
  }
};

exports.shareFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    const targetUser = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
    });

    if (!file) {
      return res.status(404).send("Only the owner can share this file.");
    }

    if (!targetUser) {
      return res.redirect(`/files/${file._id}/versions?error=No MetaSync user exists with that email.`);
    }

    if (String(targetUser._id) === String(req.session.userId)) {
      return res.redirect(`/files/${file._id}/versions?error=You already own this file.`);
    }

    const permission = await Permission.findOneAndUpdate(
      {
        fileId: file._id,
        userId: targetUser._id,
      },
      {
        $set: {
          role: req.body.role,
          grantedBy: req.session.userId,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await AuditLog.create({
      actorId: req.session.userId,
      action: "FILE_SHARED",
      fileId: file._id,
      details: {
        sharedWith: targetUser.email,
        role: permission.role,
      },
    });

    res.redirect(`/files/${file._id}/versions?message=Permission granted successfully.`);
  } catch (error) {
    res.redirect(`/files/${req.params.id}/versions?error=Permission update failed.`);
  }
};

exports.revokePermission = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
    });

    if (!file) {
      return res.status(403).send("Only the owner can revoke permission.");
    }

    const permission = await Permission.findOneAndDelete({
      _id: req.params.permissionId,
      fileId: file._id,
    });

    if (permission) {
      await AuditLog.create({
        actorId: req.session.userId,
        action: "PERMISSION_REVOKED",
        fileId: file._id,
        details: {
          revokedUserId: permission.userId,
        },
      });
    }

    res.redirect(`/files/${file._id}/versions?message=Permission revoked.`);
  } catch (error) {
    res.redirect(`/files/${req.params.id}/versions?error=Could not revoke permission.`);
  }
};


exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findOneAndUpdate(
      {
        _id: req.params.id,
        ownerId: req.session.userId,
        status: "ACTIVE",
      },
      {
        $set: { status: "DELETED" },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (!file) {
      return res.status(404).send("File not found or access denied.");
    }

    await AuditLog.create({
      actorId: req.session.userId,
      action: "FILE_DELETED",
      fileId: file._id,
      details: {
        deletionType: "SOFT_DELETE",
        fileName: file.name,
      },
    });

    res.redirect("/files/dashboard?message=File moved to recycle bin.");
  } catch (error) {
    console.error("Soft delete failed:", error);
    res.status(500).send("Could not delete the file.");
  }
};

exports.recycleBin = async (req, res) => {
  try {
    const files = await File.find({
      ownerId: req.session.userId,
      status: "DELETED",
    })
      .populate("currentVersionId")
      .sort({ updatedAt: -1 });

    res.render("files/recycle-bin", {
      files,
      userName: req.session.userName,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (error) {
    console.error("Recycle bin failed:", error);
    res.status(500).send("Could not load the recycle bin.");
  }
};

exports.recoverFile = async (req, res) => {
  try {
    const file = await File.findOneAndUpdate(
      {
        _id: req.params.id,
        ownerId: req.session.userId,
        status: "DELETED",
      },
      {
        $set: { status: "ACTIVE" },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (!file) {
      return res.status(404).send("Deleted file not found or access denied.");
    }

    await AuditLog.create({
      actorId: req.session.userId,
      action: "RECOVERY_COMPLETED",
      fileId: file._id,
      details: {
        recoveryType: "SOFT_DELETE_RECOVERY",
        fileName: file.name,
      },
    });

    res.redirect("/files/recycle-bin?message=File recovered successfully.");
  } catch (error) {
    console.error("File recovery failed:", error);
    res.status(500).send("Could not recover the file.");
  }
};


exports.permanentlyDeleteFile = async (req, res) => {
  try {
    // Only the owner can permanently delete their own recycled file.
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "DELETED",
    });

    if (!file) {
      return res.status(404).send(
        "Deleted file not found or access denied."
      );
    }

    const versions = await FileVersion.find({
      fileId: file._id,
    }).lean();

    const versionIds = versions.map((version) => version._id);

    const replicas = versionIds.length
      ? await Replica.find({
          versionId: { $in: versionIds },
        }).lean()
      : [];

    // Group identical physical paths so a restored version cannot
    // cause the same file to be removed or counted more than once.
    const paths = new Map();

    for (const replica of replicas) {
      const fullPath = path.resolve(replica.objectPath);
      const relativePath = path.relative(storageBase, fullPath);

      if (
        !relativePath ||
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      ) {
        return res.status(400).send(
          "Deletion stopped: a replica path is outside the storage folders."
        );
      }

      if (!paths.has(fullPath)) {
        paths.set(fullPath, {
          nodeId: replica.nodeId,
          size: 0,
          shouldUnlink: false,
        });
      }
    }

    // Validate references and inspect files before deleting anything.
    for (const [fullPath, item] of paths) {
      const otherReference = await Replica.findOne({
        objectPath: fullPath,
        versionId: { $nin: versionIds },
      }).lean();

      if (otherReference) {
        continue;
      }

      item.shouldUnlink = true;

      try {
        const stat = await fs.stat(fullPath);

        if (!stat.isFile()) {
          return res.status(400).send(
            "Deletion stopped: a replica path is not a regular file."
          );
        }

        item.size = stat.size;
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    // Remove eligible physical payloads.
    for (const [fullPath, item] of paths) {
      if (!item.shouldUnlink) continue;

      await fs.unlink(fullPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }

    // Remove metadata associated with this file.
    await Permission.deleteMany({ fileId: file._id });

    if (versionIds.length) {
      await Replica.deleteMany({
        versionId: { $in: versionIds },
      });

      await FileVersion.deleteMany({
        fileId: file._id,
      });
    }

    await File.deleteOne({ _id: file._id });

    // Reduce usage only for physical files that were eligible
    // for removal. Clamp the result to avoid negative usage.
    for (const item of paths.values()) {
      if (!item.shouldUnlink || item.size <= 0) continue;

      await StorageNode.updateOne(
        { _id: item.nodeId },
        [
          {
            $set: {
              usedSpaceBytes: {
                $max: [
                  0,
                  {
                    $subtract: [
                      "$usedSpaceBytes",
                      item.size,
                    ],
                  },
                ],
              },
            },
          },
        ]
      );
    }

    // Keep audit history even after the file document is removed.
    await AuditLog.create({
      actorId: req.session.userId,
      action: "PERMANENT_DELETE",
      fileId: file._id,
      details: {
        fileName: file.name,
        versionsRemoved: versions.length,
        replicasRemoved: replicas.length,
      },
    });

    return res.redirect(
      "/files/recycle-bin?message=File permanently deleted."
    );
  } catch (error) {
    console.error("Permanent deletion failed:", error);

    return res.status(500).send(
      "Permanent deletion failed. Check the server logs and storage metadata."
    );
  }
};


exports.verifyIntegrity = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    if (!file) {
      return res.status(404).send("File not found or access denied.");
    }

    const version = file.currentVersionId
      ? await FileVersion.findById(file.currentVersionId)
      : null;

    let replica = null;
    let actualChecksum = null;
    let integrityStatus = "NO_VERSION";

    if (version) {
      replica = await Replica.findOne({
        versionId: version._id,
      });

      if (!replica) {
        integrityStatus = "NO_REPLICA";
      } else {
        try {
          const buffer = await fs.readFile(replica.objectPath);

          actualChecksum = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex");

          integrityStatus =
            actualChecksum === version.checksum &&
            actualChecksum === replica.checksum
              ? "PASS"
              : "CORRUPTED";

          if (integrityStatus === "CORRUPTED") {
            replica.state = "CORRUPTED";
            await replica.save();
          } else {
            replica.state = "AVAILABLE";
            await replica.save();
          }
        } catch (error) {
          integrityStatus = "MISSING";
          replica.state = "MISSING";
          await replica.save();
        }
      }
    }

    await AuditLog.create({
      actorId: req.session.userId,
      action: "FILE_INTEGRITY_CHECKED",
      fileId: file._id,
      versionId: version ? version._id : null,
      details: {
        status: integrityStatus,
        expectedChecksum: version ? version.checksum : null,
        actualChecksum,
        replicaId: replica ? replica._id : null,
      },
    });

    res.render("files/integrity-result", {
      file,
      version,
      replica,
      actualChecksum,
      integrityStatus,
    });
  } catch (error) {
    console.error("Integrity verification failed:", error);
    res.status(500).send("Could not verify file integrity.");
  }
};

exports.findDuplicates = async (req, res) => {
  try {
    const files = await File.find({
      ownerId: req.session.userId,
      status: "ACTIVE",
    })
      .select("name currentVersionId")
      .populate("currentVersionId", "checksum versionNo")
      .sort({ name: 1 });

    const groups = new Map();

    for (const file of files) {
      const version = file.currentVersionId;

      if (!version || !version.checksum) continue;

      const checksum = version.checksum.toLowerCase();

      if (!groups.has(checksum)) {
        groups.set(checksum, []);
      }

      groups.get(checksum).push(file);
    }

    const duplicates = [];

    for (const [checksum, matchingFiles] of groups) {
      if (matchingFiles.length > 1) {
        duplicates.push({
          checksum,
          files: matchingFiles,
        });
      }
    }

    res.render("files/duplicates", {
      duplicates,
      totalGroups: duplicates.length,
      totalFiles: duplicates.reduce(
        (sum, group) => sum + group.files.length,
        0
      ),
    });
  } catch (error) {
    console.error("Duplicate detection failed:", error);
    res.status(500).send("Could not detect duplicate files.");
  }
};

exports.storageMonitor = async (req, res) => {
  try {
    const nodes = await StorageNode.find().sort({ nodeName: 1 });

    const monitoredNodes = nodes.map((node) => {
      const capacity = Number(node.capacityBytes) || 0;
      const usedSpace = Number(node.usedSpaceBytes) || 0;

      const utilization = capacity > 0
        ? Math.min(100, Math.round((usedSpace / capacity) * 100))
        : 0;

      let health = "HEALTHY";

      if (capacity <= 0 || usedSpace < 0 || usedSpace > capacity) {
        health = "CHECK_REQUIRED";
      } else if (utilization >= 90) {
        health = "CRITICAL";
      } else if (utilization >= 75) {
        health = "WARNING";
      }

      return {
        id: node._id,
        name: node.nodeName,
        status: node.status,
        capacity,
        usedSpace,
        availableSpace: Math.max(0, capacity - usedSpace),
        utilization,
        health,
      };
    });

    res.render("files/storage-monitor", {
      nodes: monitoredNodes,
      totalNodes: monitoredNodes.length,
      totalCapacity: monitoredNodes.reduce(
        (sum, node) => sum + node.capacity, 0
      ),
      totalUsed: monitoredNodes.reduce(
        (sum, node) => sum + node.usedSpace, 0
      ),
    });
  } catch (error) {
    console.error("Storage monitoring failed:", error);
    res.status(500).send("Could not load storage monitoring.");
  }
};

exports.updateTags = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      ownerId: req.session.userId,
      status: "ACTIVE",
    });

    if (!file) {
      return res.status(404).send("File not found or access denied.");
    }

    const rawTags = String(req.body.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const tags = [...new Set(rawTags.map((tag) => tag.toLowerCase()))];

    if (tags.length > 10 || tags.some((tag) => tag.length > 30)) {
      return res.status(400).send("Use at most 10 tags, each up to 30 characters.");
    }

    file.tags = tags;
    await file.save();

    await AuditLog.create({
      actorId: req.session.userId,
      action: "TAGS_UPDATED",
      fileId: file._id,
      details: { tags },
    });

    res.redirect("/files/dashboard?message=File tags updated.");
  } catch (error) {
    console.error("Tag update failed:", error);
    res.status(500).send("Could not update file tags.");
  }
};

exports.exportAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      actorId: req.session.userId,
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const escapeCsv = (value) => {
      const text = value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = [
      ["Timestamp", "Action", "File ID", "Details"],
      ...logs.map((log) => [
        log.createdAt ? new Date(log.createdAt).toISOString() : "",
        log.action,
        log.fileId || "",
        log.details || "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="metasync-audit-logs.csv"'
    );

    res.send("\uFEFF" + csv);
  } catch (error) {
    console.error("Audit export failed:", error);
    res.status(500).send("Could not export audit logs.");
  }
};
