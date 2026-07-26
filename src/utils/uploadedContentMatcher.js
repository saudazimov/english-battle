const fs = require("fs");

// Client yuborgan MIME qiymatiga ishonmaymiz; haqiqiy magic byte'larni tekshiramiz.
function createUploadedContentMatcher({ fileSystem = fs } = {}) {
  return function uploadedContentMatches(file) {
    if (!file || !file.path) return false;
    let head;
    try {
      const descriptor = fileSystem.openSync(file.path, "r");
      head = Buffer.alloc(32);
      const bytesRead = fileSystem.readSync(descriptor, head, 0, head.length, 0);
      fileSystem.closeSync(descriptor);
      head = head.subarray(0, bytesRead);
    } catch (_) {
      return false;
    }
    const hex = head.toString("hex");
    const ascii = head.toString("ascii");
    switch (file.mimetype) {
      case "image/jpeg": return hex.startsWith("ffd8ff");
      case "image/png": return hex.startsWith("89504e470d0a1a0a");
      case "image/gif": return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
      case "image/webp": return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
      case "application/pdf": return ascii.startsWith("%PDF-");
      case "application/msword":
      case "application/vnd.ms-powerpoint":
      case "application/vnd.ms-excel": return hex.startsWith("d0cf11e0a1b11ae1");
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return hex.startsWith("504b0304");
      case "text/plain": return !head.includes(0);
      default: return false;
    }
  };
}

const uploadedContentMatches = createUploadedContentMatcher();

module.exports = { createUploadedContentMatcher, uploadedContentMatches };
