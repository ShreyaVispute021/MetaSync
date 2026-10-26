# MetaSync — Distributed File Storage System with MongoDB Metadata Management

> **DBMS Mini Project**  
> A database-centric file storage prototype built with Node.js, Express.js, MongoDB, Mongoose, and EJS.

MetaSync stores actual file bytes in simulated local storage-node folders and uses MongoDB as the metadata management layer. The application tracks file ownership, storage locations, versions, replica records, permissions, operation status, and audit history.

> **Important scope note:** Node 1, Node 2, and Node 3 are simulated folders on one computer—not separate cloud servers. MongoDB stores metadata; uploaded binary contents are stored in the local `storage/` folders.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Objectives](#objectives)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Features](#features)
- [Database Design](#database-design)
- [Prerequisites](#prerequisites)
- [Installation and Setup](#installation-and-setup)
- [Running the Application](#running-the-application)
- [Using MetaSync](#using-metasync)
- [MongoDB Compass Verification](#mongodb-compass-verification)
- [Testing and Demonstration Checklist](#testing-and-demonstration-checklist)
- [Troubleshooting](#troubleshooting)
- [Security and Implementation Notes](#security-and-implementation-notes)
- [Future Improvements](#future-improvements)

---

## Project Overview

Traditional file storage applications often focus on storing files while providing limited visibility into how files are tracked, versioned, located, or audited. MetaSync demonstrates how a database can serve as the control layer for a file storage system.

When a user uploads a file, MetaSync stores the physical payload in a selected simulated storage node and records the file's metadata in MongoDB. Additional collections can record versions, replica locations, operations, permissions, and audit events. This makes the file lifecycle easier to inspect and demonstrate in a DBMS project.

### Project goal

To demonstrate database-oriented file management using MongoDB, including document modeling, relationships through identifiers, queries, status changes, version history, metadata-based integrity checks, and auditability.

### Project explanation for a presentation

> MetaSync is a database-centric distributed file storage prototype. Instead of storing files without structure in a single folder, it stores the actual file bytes across simulated storage nodes and uses MongoDB as a metadata control layer. MongoDB tracks file ownership, selected node, version history, replica location, operation state, permissions, and audit history. This makes file management traceable, recoverable, and easier to scale.

---

## Objectives

- Store uploaded file bytes separately from MongoDB metadata.
- Simulate multiple storage nodes using local directories.
- Track file owners, names, sizes, checksums, and storage locations.
- Maintain file versions and support version restoration where implemented.
- Record replica/location metadata.
- Track operations and audit events.
- Provide login-protected file management.
- Demonstrate soft deletion and recovery.
- Add metadata-focused tools such as search, sorting, pagination, integrity verification, duplicate detection, storage monitoring, tags, and audit export where implemented.
- Use MongoDB Compass to inspect and explain database state.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js v24 | JavaScript runtime |
| Express.js | Web server and routing |
| MongoDB Community Server | Metadata database |
| Mongoose | MongoDB object modeling and schemas |
| MongoDB Compass | Visual database inspection |
| EJS | Server-rendered HTML views |
| ejs-mate | EJS layout support |
| express-session | Session-based login state |
| connect-mongo | Session persistence in MongoDB |
| bcryptjs | Password hashing |
| multer | Multipart file-upload handling |
| nodemon | Development server restart |
| HTML, CSS, Bootstrap (where included) | User interface and styling |

---

## Architecture

```text
Browser
   |
   v
Express.js + EJS application
   |
   +---- Authentication / Session middleware
   |
   +---- File and feature controllers
   |        |
   |        +---- Local payload operations
   |        |        |
   |        |        +---- storage/node1/
   |        |        +---- storage/node2/
   |        |        +---- storage/node3/
   |        |
   |        +---- Mongoose models
   |                 |
   |                 +---- MongoDB: metasync
   |                          |
   |                          +---- users
   |                          +---- files
   |                          +---- fileversions
   |                          +---- replicas
   |                          +---- storagenodes
   |                          +---- operations
   |                          +---- auditlogs
   |                          +---- permissions
   |
   v
Rendered response to browser
```

### Upload lifecycle

The intended upload workflow is:

1. The user selects a file and a storage node.
2. An operation record may be created with a pending state.
3. The application calculates a checksum.
4. The physical file is written to the selected node folder.
5. A `File` metadata document is created.
6. A `FileVersion` document is created for the uploaded version.
7. A `Replica` document records the physical location.
8. The storage node's used-space metadata is updated.
9. An audit event is recorded.
10. The operation is marked completed.

The exact behavior depends on the current controller implementation. Use the live application and MongoDB records to verify each step before presenting it as confirmed.

---

## Project Structure

The project is expected to use a structure similar to:

```text
E:\MetaSync
│
├── config/
│
├── controllers/
│
├── middleware/
│
├── models/
│   ├── User.js
│   ├── File.js
│   ├── FileVersion.js
│   ├── Permission.js
│   ├── StorageNode.js
│   ├── Replica.js
│   ├── Operation.js
│   └── AuditLog.js
│
├── routes/
│
├── storage/
│   ├── node1/
│   ├── node2/
│   └── node3/
│
├── public/
├── views/
├── .env                 # Local configuration; do not commit
├── package.json
└── server.js
```

Your actual folders or view filenames may differ slightly. Keep the project’s existing structure when adding or editing features.

---

## Features

The following list summarizes the core project and the additional features discussed during development. **A feature is not automatically confirmed as passing just because its UI or code exists.** Verify it with the test checklist below before claiming it is fully working.

### Core functionality

1. **User registration** — creates an account and hashes the password with `bcryptjs`.
2. **Login and logout** — uses session-based authentication.
3. **Protected dashboard** — requires a logged-in session.
4. **Simulated storage nodes** — displays Node 1, Node 2, and Node 3.
5. **File upload** — saves the physical file to a selected node folder and creates metadata.
6. **File download** — retrieves the stored payload through the application.
7. **File versioning** — records version history and includes a version restore workflow.
8. **Replica/location metadata** — records where a stored payload is located.
9. **Operations and audit history** — tracks relevant workflow status and events.
10. **Permissions/sharing** — models permission records; verify sharing and revocation before demonstrating them as working.

### Additional features

11. **Dashboard search** — searches file records using the available search controls.
12. **Sorting** — provides sort controls for file lists; verify the selected order changes the results.
13. **Pagination** — intended to show a subset of matching files per page; verify using more files than the configured page limit.
14. **Soft delete and Recycle Bin** — changes a file's status instead of immediately removing it.
15. **Recovery** — returns a soft-deleted file to the active list; reported as tested during development.
16. **File tags/categories** — tag editing and display were adjusted during development; verify persistence after refresh and in MongoDB.
17. **SHA-256 integrity verification** — intended to compare a freshly calculated checksum with stored checksum metadata.
18. **Duplicate-file detection** — intended to group files by content checksum.
19. **Storage capacity monitoring** — intended to display capacity and usage metadata for the simulated nodes.
20. **Audit-log CSV export** — intended to export audit entries for review.
21. **Permanent deletion and storage cleanup** — an additional feature was planned during development. Do not assume it is complete until the route, UI, physical cleanup, metadata cleanup, storage accounting, and audit entry have all been tested.

### UI improvements

- Dark backgrounds and higher-contrast text were added to the Duplicate File Detection, Storage Capacity Monitor, and File Integrity Verification pages.
- The tag form layout on the dashboard was adjusted so tags appear alongside the corresponding file.
- If the browser cannot connect, check whether the Express server is still listening on port `3000`.

---

## Database Design

Database name:

```text
metasync
```

Connection string for local development:

```text
mongodb://127.0.0.1:27017/metasync
```

### Collections and purpose

| Collection | Purpose |
|---|---|
| `users` | User accounts and password hashes |
| `files` | Main file metadata, owner, status, selected node, and other file attributes |
| `fileversions` | Version history and version-related metadata |
| `replicas` | Physical storage locations and replica metadata |
| `storagenodes` | Simulated node capacity and used-space information |
| `operations` | Workflow status and operation details |
| `auditlogs` | Historical events for traceability |
| `permissions` | Sharing and access permission records |

MongoDB collection names may be lowercased/pluralized by Mongoose. The names shown above are the expected names in MongoDB Compass.

### What belongs in MongoDB?

MongoDB stores structured metadata, not the uploaded file's raw binary payload in this design. A file document may contain values such as:

- Original filename
- Owner reference
- File size
- MIME type
- Selected storage node
- Status such as active or deleted
- Current-version reference or version metadata
- Tags
- Revision or timestamps

Version and replica documents store related metadata such as version identifiers, checksums, and physical object paths. The exact fields are defined by the model schemas in the current source code.

### What belongs on disk?

Physical file payloads are stored in the simulated node folders:

```text
E:\MetaSync\storage\node1\
E:\MetaSync\storage\node2\
E:\MetaSync\storage\node3\
```

The actual path and stored filename depend on the upload implementation.

---

## Prerequisites

Install or configure:

- Node.js v24
- npm
- MongoDB Community Server for Windows
- MongoDB Compass (recommended for the DBMS demonstration)
- Git Bash or PowerShell
- The project source code

MongoDB is expected to be installed as a Windows service named `MongoDB`.

Check its state in **Administrator PowerShell**:

```powershell
Get-Service MongoDB
```

If the status is `Stopped`, start the service:

```powershell
Start-Service MongoDB
```

Do not start a separate `mongod` process if the Windows MongoDB service is already running.

---

## Installation and Setup

### 1. Open the project folder

PowerShell:

```powershell
cd E:\MetaSync
```

Git Bash:

```bash
cd /e/MetaSync
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create or check the `.env` file in the project root:

```dotenv
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/metasync
SESSION_SECRET=replace_with_a_long_random_secret
```

The example secret is a placeholder. Use a private, randomly generated secret for your own environment. Never commit `.env` or expose real secrets in screenshots or public repositories.

### 4. Ensure storage directories exist

The expected directories are:

```text
storage/node1/
storage/node2/
storage/node3/
```

If your current application creates them automatically, keep that behavior. Otherwise create the folders before testing uploads.

### 5. Start MongoDB

In Administrator PowerShell:

```powershell
Get-Service MongoDB
```

If stopped:

```powershell
Start-Service MongoDB
```

---

## Running the Application

Start the development server from the project root:

```bash
npm run dev
```

Keep this terminal window open while using the website.

Open:

- Dashboard/application entry: `http://localhost:3000`
- Login page, if needed: `http://localhost:3000/auth/login`
- Dashboard route used during testing: `http://localhost:3000/files/dashboard`

Routes can redirect unauthenticated visitors to the login page. A `302 Found` redirect to `/auth/login` is normal for a protected dashboard.

### Confirm that port 3000 is listening

PowerShell:

```powershell
netstat -ano | findstr :3000
```

Test the server:

```powershell
curl.exe -v http://127.0.0.1:3000/files/dashboard
```

If the server is listening but the dashboard returns a redirect, log in through the browser. If the connection is refused, inspect the terminal running `npm run dev` for a stopped process or startup error.

---

## Using MetaSync

### Register and log in

1. Open the application in a browser.
2. Register a test account if needed.
3. Log in using that account.
4. Confirm that the protected dashboard loads.

### Upload a file

1. Choose a small test file.
2. Select Node 1, Node 2, or Node 3.
3. Submit the upload.
4. Confirm the success message.
5. Check the selected `storage/nodeX/` folder for the physical payload.
6. Open MongoDB Compass and inspect the corresponding `files`, `fileversions`, and `replicas` documents.

### Download a file

Use the application's download action and confirm that the downloaded file opens and contains the expected content.

### Test versioning

1. Upload a file.
2. Use the application's version-upload workflow for the same logical file.
3. Confirm the new version record in `fileversions`.
4. Test restore only after confirming the version list and physical payloads.

### Use tags

1. Enter tags for a file, separated by commas if that is the current UI's format.
2. Click **Save Tags**.
3. Refresh the dashboard.
4. Confirm the tags remain visible.
5. Inspect the file's `tags` field in MongoDB Compass.

### Use the Recycle Bin

1. Soft-delete a test file.
2. Confirm it disappears from the active list.
3. Open the Recycle Bin.
4. Test recovery and confirm that the file returns to the active list.
5. Only test permanent deletion with disposable data, and only if the current implementation is present and has been reviewed.

---

## MongoDB Compass Verification

Connect Compass to:

```text
mongodb://127.0.0.1:27017
```

Open the `metasync` database.

Recommended evidence:

| Action | Collection to inspect | What to verify |
|---|---|---|
| Register | `users` | New user document exists; password is a hash, not plaintext |
| Upload | `files` | File metadata and owner reference |
| Upload/version update | `fileversions` | Version record and checksum metadata |
| Upload | `replicas` | Location/node metadata |
| Node usage update | `storagenodes` | Used-space value changes as expected |
| Workflow | `operations` | Status and relevant operation details |
| Download/upload/delete/recovery | `auditlogs` | Relevant event exists, if that action is audited |
| Share/revoke | `permissions` | Permission state changes, if sharing is implemented and tested |
| Soft delete/recovery | `files` | Status changes between active/deleted states |
| Tags | `files` | `tags` array persists after refresh |

Click **Refresh** in Compass after actions that update the database.

For a faculty presentation, capture real screenshots from your own running application and Compass. Do not use mock screenshots as proof that a feature works.

---

## Testing and Demonstration Checklist

Use a small disposable file first. Mark a test as passed only after observing the result.

### Core workflow

- [ ] Server starts and MongoDB connects.
- [ ] Registration creates a user record.
- [ ] Login and logout work.
- [ ] Unauthenticated dashboard requests redirect to login.
- [ ] Upload to each simulated node works.
- [ ] Physical file exists in the selected node folder.
- [ ] File metadata appears in `files`.
- [ ] Version metadata appears in `fileversions`.
- [ ] Replica/location metadata appears in `replicas`.
- [ ] Download returns the correct file.
- [ ] Version restore works and preserves expected history.
- [ ] Audit and operation records are created for the relevant actions.

### Additional workflow

- [ ] Search returns the expected matching files.
- [ ] Sorting visibly changes the order.
- [ ] Pagination works when the matching file count exceeds the page limit.
- [ ] Soft delete moves a file to the Recycle Bin.
- [ ] Recovery returns a file to the active list.
- [ ] Tags persist after refresh and appear in MongoDB.
- [ ] Integrity verification reports the correct result for an unchanged file.
- [ ] Integrity verification detects a deliberately modified test payload, if supported.
- [ ] Duplicate detection groups two files with identical contents, if supported.
- [ ] Storage monitor values agree with stored node metadata.
- [ ] CSV export downloads a readable file with expected audit rows.
- [ ] Sharing and revocation work for the intended users, if supported.
- [ ] Permanent deletion removes only eligible physical payloads and related metadata, updates storage usage, and preserves an audit record, if implemented.

---

## Troubleshooting

### `Database connection failed: connect ECONNREFUSED 127.0.0.1:27017`

Check the Windows service first:

```powershell
Get-Service MongoDB
```

If stopped:

```powershell
Start-Service MongoDB
```

Then restart MetaSync.

### Browser shows `ERR_CONNECTION_REFUSED`

1. Confirm the `npm run dev` terminal is still running.
2. Check port `3000`:

   ```powershell
   netstat -ano | findstr :3000
   ```

3. Test:

   ```powershell
   curl.exe -v http://127.0.0.1:3000/files/dashboard
   ```

4. If the terminal returned to a prompt, the Node process may have exited. Read the exact error before changing application code.

### Dashboard redirects to login

A `302 Found` response with `Location: /auth/login` normally means the protected route requires authentication. Open the login page and sign in.

### New collection or document is not visible in Compass

- Confirm Compass is connected to the correct local MongoDB instance.
- Confirm the selected database is `metasync`.
- Refresh the collection view.
- Perform the relevant action again and check the server terminal for errors.
- Check the Mongoose schema and controller to confirm the document is actually saved.

### Tags do not persist

- Click **Save Tags** and check for a success or error message.
- Refresh the dashboard.
- Inspect the corresponding file document in `files`.
- Check the browser/server error output if the `tags` field is unchanged.

### Text is hard to read on dark pages

The Duplicate File Detection, Storage Capacity Monitor, and File Integrity Verification views received CSS contrast improvements. If text still looks dark, hard-refresh the browser with **Ctrl + F5** and check that the style block is in the correct EJS view and after the Bootstrap stylesheet.

---

## Security and Implementation Notes

- Passwords should be stored as bcrypt hashes, never plaintext.
- Protected routes should check the authenticated session.
- Every file operation should validate ownership or explicit permission.
- Validate storage paths before reading or deleting physical files.
- Do not trust a user-supplied filename as a physical path.
- Do not delete a physical object if surviving metadata still references it.
- Permanent deletion is destructive; test only with disposable data until the cleanup behavior is verified.
- Physical filesystem changes and MongoDB writes are separate operations. Without explicit transaction or recovery logic, a failure midway can leave inconsistent state.
- Do not claim multi-document MongoDB transactions unless they are actually implemented and tested.
- The three storage nodes are local simulations, not real independent distributed servers.
- The integrity feature verifies content against stored checksums; it does not by itself provide encryption or guarantee tamper-proof storage.

---

## Future Improvements

Possible extensions include:

- Robust permanent deletion with retry/reconciliation logic.
- Safer atomic workflows and consistent storage accounting.
- Permission-sharing tests and a clearer access-control matrix.
- Automated tests for upload, versioning, recovery, and deletion.
- Better error pages and structured logging.
- Checksum verification during upload and download.
- Replica consistency checks and recovery from missing payloads.
- Real distributed nodes for a future version of the project.
- Pagination and query-performance improvements for larger collections.

---

## Academic Project Summary

MetaSync demonstrates how MongoDB can act as a metadata control layer for a file storage application. It combines server-side file operations with document-based metadata, version records, storage-location records, and audit history. The prototype is designed to make database state observable through MongoDB Compass and to support a clear faculty demonstration of file lifecycle management.

**Project name:** MetaSync  
**Project type:** DBMS Mini Project  
**Primary database:** MongoDB Community Server  
**Backend:** Node.js and Express.js  
**Views:** EJS  
**Storage model:** Local simulated storage-node folders plus MongoDB metadata
