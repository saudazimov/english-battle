const createUserPublicProfileRoutes = require("./userPublicProfileRoutes");
const createProfilePictureRoutes = require("./profilePictureRoutes");

const defaultFactories = {
  createPublicProfile: createUserPublicProfileRoutes,
  createProfilePicture: createProfilePictureRoutes,
};

function registerPublicRoutes({ app, pool, factories = defaultFactories }) {
  app.use(factories.createPublicProfile({ pool }));
}

function registerPictureRoutes({
  app,
  upload,
  uploadedContentMatches,
  removeUploadedFile,
  uploadsDirectory,
  factories = defaultFactories,
}) {
  app.use(factories.createProfilePicture({
    upload,
    uploadedContentMatches,
    removeUploadedFile,
    uploadsDirectory,
  }));
}

module.exports = {
  registerPublicRoutes,
  registerPictureRoutes,
};
