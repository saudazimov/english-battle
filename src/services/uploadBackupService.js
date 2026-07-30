"use strict";

const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const { constants: fsConstants, createReadStream } = require("node:fs");
const path = require("node:path");

const MANIFEST_FILE = "upload-backup-manifest.json";
const FORMAT_VERSION = 1;
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const ROOTS = [
  { key: "public-uploads", sourceRelative: "public/uploads" },
  { key: "private-resources", sourceRelative: "uploads/resources" },
];

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveRoots(projectRoot) {
  const root = path.resolve(projectRoot);
  return ROOTS.map((entry) => ({
    ...entry,
    sourceDirectory: path.resolve(root, entry.sourceRelative),
  }));
}

function comparablePath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSameOrWithin(parentPath, candidatePath) {
  const parent = comparablePath(parentPath);
  const candidate = comparablePath(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeRelativePath(relativePath) {
  const value = String(relativePath || "");
  if (!value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw codedError("UNSAFE_UPLOAD_BACKUP_PATH", "Manifest fayl yo'li xavfsiz emas.");
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) {
    throw codedError("UNSAFE_UPLOAD_BACKUP_PATH", "Manifest fayl yo'li backupdan tashqariga chiqadi.");
  }
  return value;
}

async function pathExists(targetPath, fsImpl = fs) {
  try {
    await fsImpl.lstat(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function assertDirectory(directory, label, fsImpl = fs) {
  let stats;
  try {
    stats = await fsImpl.lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw codedError("UPLOAD_BACKUP_SOURCE_MISSING", `${label} papkasi topilmadi: ${directory}`);
    }
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw codedError("UNSAFE_UPLOAD_BACKUP_SOURCE", `${label} haqiqiy papka bo'lishi kerak.`);
  }
}

async function listRegularFiles(directory, fsImpl = fs, prefix = "") {
  const entries = await fsImpl.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw codedError("UPLOAD_BACKUP_SYMLINK", `Symlink backupga kiritilmaydi: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listRegularFiles(absolutePath, fsImpl, relativePath));
      continue;
    }
    if (!entry.isFile()) {
      throw codedError("UNSUPPORTED_UPLOAD_FILE", `Nostandart fayl backupga kiritilmaydi: ${relativePath}`);
    }
    files.push(relativePath);
  }

  return files;
}

async function sha256File(filePath, createStream = createReadStream) {
  const hash = createHash("sha256");
  for await (const chunk of createStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function validateManifest(manifest) {
  if (!manifest || manifest.formatVersion !== FORMAT_VERSION || !Array.isArray(manifest.files)) {
    throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Upload backup manifest formati noto'g'ri.");
  }
  if (!Array.isArray(manifest.roots) || manifest.roots.length !== ROOTS.length) {
    throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Upload backup root ma'lumotlari noto'g'ri.");
  }

  const rootKeys = new Set(ROOTS.map(({ key }) => key));
  const manifestRootKeys = new Set(manifest.roots.map(({ key }) => key));
  if (manifestRootKeys.size !== ROOTS.length) {
    throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Manifest takroriy upload root saqlaydi.");
  }
  const seenFiles = new Set();
  for (const file of manifest.files) {
    if (!rootKeys.has(file.root)) {
      throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Manifest noma'lum upload root saqlaydi.");
    }
    assertSafeRelativePath(file.path);
    const identity = `${file.root}:${file.path}`;
    if (seenFiles.has(identity)) {
      throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Manifest takroriy fayl saqlaydi.");
    }
    seenFiles.add(identity);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Manifest fayl metadata formati noto'g'ri.");
    }
  }

  for (const expectedRoot of ROOTS) {
    const root = manifest.roots.find(({ key }) => key === expectedRoot.key);
    const files = manifest.files.filter(({ root: key }) => key === expectedRoot.key);
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (!root || root.sourceRelative !== expectedRoot.sourceRelative ||
        root.fileCount !== files.length || root.totalBytes !== totalBytes) {
      throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Manifest upload root hisoblari noto'g'ri.");
    }
  }

  return manifest;
}

async function readManifest(snapshotDirectory, fsImpl = fs) {
  const manifestPath = path.join(snapshotDirectory, MANIFEST_FILE);
  const stats = await fsImpl.lstat(manifestPath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_MANIFEST_BYTES) {
    throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Upload backup manifest xavfsiz fayl emas.");
  }
  try {
    return validateManifest(JSON.parse(await fsImpl.readFile(manifestPath, "utf8")));
  } catch (error) {
    if (error.code) throw error;
    throw codedError("INVALID_UPLOAD_BACKUP_MANIFEST", "Upload backup manifest JSON formati noto'g'ri.");
  }
}

async function assertExactDirectoryEntries(directory, expectedNames, fsImpl = fs) {
  const actualNames = (await fsImpl.readdir(directory)).sort();
  const expected = [...expectedNames].sort();
  if (actualNames.length !== expected.length ||
      actualNames.some((name, index) => name !== expected[index])) {
    throw codedError("UPLOAD_BACKUP_FILE_SET_MISMATCH", "Backup katalog tuzilishi manifestga mos emas.");
  }
}

async function verifyFiles({ manifest, resolveRoot, fsImpl = fs }) {
  const expected = new Set(manifest.files.map((file) => `${file.root}:${file.path}`));
  const actual = new Set();

  for (const root of ROOTS) {
    const rootDirectory = resolveRoot(root);
    await assertDirectory(rootDirectory, root.key, fsImpl);
    for (const relativePath of await listRegularFiles(rootDirectory, fsImpl)) {
      actual.add(`${root.key}:${relativePath}`);
    }
  }
  if (expected.size !== actual.size || [...expected].some((file) => !actual.has(file))) {
    throw codedError("UPLOAD_BACKUP_FILE_SET_MISMATCH", "Backup fayllar ro'yxati manifestga mos emas.");
  }

  for (const file of manifest.files) {
    const root = ROOTS.find(({ key }) => key === file.root);
    const filePath = path.join(resolveRoot(root), ...file.path.split("/"));
    const stats = await fsImpl.lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== file.size) {
      throw codedError("UPLOAD_BACKUP_INTEGRITY_FAILED", `Backup fayli hajmi mos emas: ${file.root}/${file.path}`);
    }
    if (await sha256File(filePath) !== file.sha256) {
      throw codedError("UPLOAD_BACKUP_INTEGRITY_FAILED", `Backup checksum mos emas: ${file.root}/${file.path}`);
    }
  }
}

async function verifyUploadSnapshot({ snapshotDirectory, fsImpl = fs }) {
  const snapshot = path.resolve(snapshotDirectory);
  await assertDirectory(snapshot, "Upload snapshot", fsImpl);
  await assertExactDirectoryEntries(snapshot, ["data", MANIFEST_FILE], fsImpl);
  await assertDirectory(path.join(snapshot, "data"), "Upload snapshot data", fsImpl);
  await assertExactDirectoryEntries(path.join(snapshot, "data"), ROOTS.map(({ key }) => key), fsImpl);
  const manifest = await readManifest(snapshot, fsImpl);
  await verifyFiles({
    manifest,
    resolveRoot: ({ key }) => path.join(snapshot, "data", key),
    fsImpl,
  });
  return manifest;
}

async function removeTemporaryDirectory(temporaryPath, finalPath, fsImpl = fs) {
  const sameParent = path.dirname(temporaryPath) === path.dirname(finalPath);
  const expectedPrefix = `${path.basename(finalPath)}.partial-`;
  if (!sameParent || !path.basename(temporaryPath).startsWith(expectedPrefix)) {
    throw codedError("UNSAFE_UPLOAD_BACKUP_CLEANUP", "Vaqtinchalik backup yo'li xavfsiz emas.");
  }
  await fsImpl.rm(temporaryPath, { recursive: true, force: true });
}

async function assertDestinationOutsideRoots(destination, roots, fsImpl, code, message) {
  const realParent = await fsImpl.realpath(path.dirname(destination));
  const effectiveDestination = path.join(realParent, path.basename(destination));
  for (const root of roots) {
    const realRoot = await fsImpl.realpath(root.sourceDirectory);
    if (isSameOrWithin(realRoot, effectiveDestination) ||
        isSameOrWithin(effectiveDestination, realRoot)) {
      throw codedError(code, message);
    }
  }
  return effectiveDestination;
}

async function createUploadSnapshot({ projectRoot, outputDirectory, fsImpl = fs, now = () => new Date() }) {
  const roots = resolveRoots(projectRoot);
  const output = path.resolve(outputDirectory);
  for (const root of roots) {
    await assertDirectory(root.sourceDirectory, root.key, fsImpl);
    if (isSameOrWithin(root.sourceDirectory, output)) {
      throw codedError("UNSAFE_UPLOAD_BACKUP_TARGET", "Snapshot upload manbasi ichida bo'lishi mumkin emas.");
    }
  }
  if (await pathExists(output, fsImpl)) {
    throw codedError("UPLOAD_BACKUP_ALREADY_EXISTS", `Mavjud snapshot ustiga yozish rad etildi: ${output}`);
  }

  await fsImpl.mkdir(path.dirname(output), { recursive: true });
  await assertDestinationOutsideRoots(
    output,
    roots,
    fsImpl,
    "UNSAFE_UPLOAD_BACKUP_TARGET",
    "Snapshot upload manbasi bilan ustma-ust tushishi mumkin emas."
  );
  const temporary = `${output}.partial-${process.pid}-${randomUUID()}`;
  let operationError;
  try {
    await fsImpl.mkdir(temporary, { recursive: false, mode: 0o700 });
    const manifest = { formatVersion: FORMAT_VERSION, createdAt: now().toISOString(), roots: [], files: [] };

    for (const root of roots) {
      const destinationRoot = path.join(temporary, "data", root.key);
      await fsImpl.mkdir(destinationRoot, { recursive: true, mode: 0o700 });
      let totalBytes = 0;
      const files = await listRegularFiles(root.sourceDirectory, fsImpl);
      for (const relativePath of files) {
        const source = path.join(root.sourceDirectory, ...relativePath.split("/"));
        const destination = path.join(destinationRoot, ...relativePath.split("/"));
        const sourceStats = await fsImpl.lstat(source);
        if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
          throw codedError("UPLOAD_BACKUP_SYMLINK", `Source fayl nusxalashdan oldin o'zgardi: ${relativePath}`);
        }
        await fsImpl.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await fsImpl.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        await fsImpl.chmod(destination, 0o600);
        const stats = await fsImpl.lstat(destination);
        totalBytes += stats.size;
        manifest.files.push({ root: root.key, path: relativePath, size: stats.size, sha256: await sha256File(destination) });
      }
      manifest.roots.push({ key: root.key, sourceRelative: root.sourceRelative, fileCount: files.length, totalBytes });
    }

    await fsImpl.writeFile(path.join(temporary, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await verifyUploadSnapshot({ snapshotDirectory: temporary, fsImpl });
    await fsImpl.rename(temporary, output);
    return { snapshotDirectory: output, manifest };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      if (await pathExists(temporary, fsImpl)) await removeTemporaryDirectory(temporary, output, fsImpl);
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
      operationError.cleanupError = cleanupError;
    }
  }
}

function assertSafeRestoreDirectory({ targetDirectory, confirmation, projectRoot, snapshotDirectory }) {
  const target = path.resolve(targetDirectory);
  for (const root of resolveRoots(projectRoot)) {
    if (isSameOrWithin(root.sourceDirectory, target) || isSameOrWithin(target, root.sourceDirectory)) {
      throw codedError("UNSAFE_UPLOAD_RESTORE_TARGET", "Jonli upload papkasi restore drill target bo'lishi mumkin emas.");
    }
  }
  const snapshot = path.resolve(snapshotDirectory);
  if (isSameOrWithin(snapshot, target) || isSameOrWithin(target, snapshot)) {
    throw codedError("UNSAFE_UPLOAD_RESTORE_TARGET", "Snapshot va restore target bir-birining ichida bo'lishi mumkin emas.");
  }
  if (!String(confirmation || "").trim() || path.resolve(confirmation) !== target ||
      !/restore[-_]test/i.test(path.basename(target))) {
    throw codedError("UPLOAD_RESTORE_TARGET_NOT_CONFIRMED", "Restore target alohida restore-test papka bo'lishi va aynan tasdiqlanishi kerak.");
  }
  return target;
}

async function runUploadRestoreDrill({ projectRoot, snapshotDirectory, targetDirectory, confirmation, fsImpl = fs }) {
  const snapshot = path.resolve(snapshotDirectory);
  const manifest = await verifyUploadSnapshot({ snapshotDirectory: snapshot, fsImpl });
  const target = assertSafeRestoreDirectory({ targetDirectory, confirmation, projectRoot, snapshotDirectory: snapshot });
  if (await pathExists(target, fsImpl)) {
    throw codedError("UPLOAD_RESTORE_TARGET_EXISTS", "Restore target oldindan mavjud bo'lishi mumkin emas.");
  }

  await fsImpl.mkdir(path.dirname(target), { recursive: true });
  const effectiveTarget = await assertDestinationOutsideRoots(
    target,
    resolveRoots(projectRoot),
    fsImpl,
    "UNSAFE_UPLOAD_RESTORE_TARGET",
    "Jonli upload papkasi restore drill target bo'lishi mumkin emas."
  );
  const realSnapshot = await fsImpl.realpath(snapshot);
  if (isSameOrWithin(realSnapshot, effectiveTarget) || isSameOrWithin(effectiveTarget, realSnapshot)) {
    throw codedError("UNSAFE_UPLOAD_RESTORE_TARGET", "Snapshot va restore target bir-birining ichida bo'lishi mumkin emas.");
  }
  const temporary = `${target}.partial-${process.pid}-${randomUUID()}`;
  let operationError;
  try {
    await fsImpl.mkdir(temporary, { recursive: false, mode: 0o700 });
    for (const root of ROOTS) {
      const destinationRoot = path.join(temporary, ...root.sourceRelative.split("/"));
      await fsImpl.mkdir(destinationRoot, { recursive: true, mode: 0o700 });
      for (const file of manifest.files.filter(({ root: key }) => key === root.key)) {
        const source = path.join(snapshot, "data", root.key, ...file.path.split("/"));
        const destination = path.join(destinationRoot, ...file.path.split("/"));
        await fsImpl.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await fsImpl.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        await fsImpl.chmod(destination, 0o600);
      }
    }
    await verifyFiles({
      manifest,
      resolveRoot: ({ sourceRelative }) => path.join(temporary, ...sourceRelative.split("/")),
      fsImpl,
    });
    await fsImpl.writeFile(path.join(temporary, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await fsImpl.rename(temporary, target);
    return { targetDirectory: target, manifest };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      if (await pathExists(temporary, fsImpl)) await removeTemporaryDirectory(temporary, target, fsImpl);
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
      operationError.cleanupError = cleanupError;
    }
  }
}

module.exports = {
  MANIFEST_FILE,
  assertSafeRelativePath,
  assertSafeRestoreDirectory,
  createUploadSnapshot,
  runUploadRestoreDrill,
  verifyUploadSnapshot,
};
