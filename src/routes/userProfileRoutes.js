const createUserPublicProfileRoutes = require("./userPublicProfileRoutes");
const createProfilePictureRoutes = require("./profilePictureRoutes");
const createUserProfileUpdateRoutes = require("./userProfileUpdateRoutes");

const defaultFactories = {
  createPublicProfile: createUserPublicProfileRoutes,
  createProfileUpdate: createUserProfileUpdateRoutes,
  createProfilePicture: createProfilePictureRoutes,
};

function registerPublicRoutes({ app, pool, factories = defaultFactories }) {
  app.use(factories.createPublicProfile({ pool }));
  app.use(factories.createProfileUpdate({ pool }));
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
