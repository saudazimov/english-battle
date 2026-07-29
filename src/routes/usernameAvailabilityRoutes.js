const express = require("express");
const {
  createUsernameAvailabilityController,
} = require("../controllers/usernameAvailabilityController");

function usernameAvailabilityRoutes({
  pool,
  usernameLookupLimiter,
  usernameRegex,
}) {
  const router = express.Router();
  const controller = createUsernameAvailabilityController({ pool, usernameRegex });

  router.post("/check-username", usernameLookupLimiter, controller.check);

  return router;
}

module.exports = usernameAvailabilityRoutes;
