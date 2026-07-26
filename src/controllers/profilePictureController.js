function createProfilePictureController({
  pool,
  uploadedContentMatches,
  removeUploadedFile,
  fileSystem,
  pathModule,
  uploadsDirectory,
  logger = console,
}) {
  async function update(req, res) {
    try {
      const userId = req.user.id;
      if (!req.file) {
        return res.status(400).json({ error: "Rasm yuklanmadi" });
      }
      if (!uploadedContentMatches(req.file)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: "Fayl haqiqiy rasm emas" });
      }

      const filePath = "/uploads/" + req.file.filename;
      const oldPicture = await pool.query(
        "SELECT profile_picture FROM users WHERE id = $1",
        [userId]
      );

      await pool.query(
        "UPDATE users SET profile_picture = $1 WHERE id = $2",
        [filePath, userId]
      );

      const previous = oldPicture.rows[0] && oldPicture.rows[0].profile_picture;
      if (previous && previous.startsWith("/uploads/user_")) {
        const oldAbsolutePath = pathModule.join(uploadsDirectory, pathModule.basename(previous));
        try {
          if (fileSystem.existsSync(oldAbsolutePath)) fileSystem.unlinkSync(oldAbsolutePath);
        } catch (error) {
          // Eski fayl allaqachon yo'q bo'lishi mumkin.
        }
      }

      return res.json({ message: "Rasm yangilandi", profile_picture: filePath });
    } catch (error) {
      removeUploadedFile(req.file);
      logger.error("Rasm yuklash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { update };
}

module.exports = { createProfilePictureController };
