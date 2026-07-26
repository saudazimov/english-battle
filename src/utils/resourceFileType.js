function detectFileType(mimetype) {
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype.indexOf("word") !== -1 || mimetype === "application/msword") return "doc";
  if (mimetype.indexOf("presentation") !== -1 || mimetype.indexOf("powerpoint") !== -1) return "ppt";
  if (mimetype.indexOf("sheet") !== -1 || mimetype.indexOf("excel") !== -1) return "xls";
  if (mimetype.startsWith("image/")) return "image";
  return "other";
}

module.exports = { detectFileType };
