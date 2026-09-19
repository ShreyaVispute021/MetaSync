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

    const [files, nodes] = await Promise.all([
      File.find({
        ownerId: req.session.userId,
        status: "ACTIVE",
      })
        .populate("currentVersionId")
        .sort({ updatedAt: -1 }),
      StorageNode.find().sort({ nodeName: 1 }),
    ]);

    res.render("files/dashboard", {
      files,
      nodes,
      userName: req.session.userName,
      message: req.query.message || null,
      error: req.query.error || null,
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