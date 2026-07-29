const express = require("express");
const {
  createSchoolInviteVerificationController,
} = require("../controllers/schoolInviteVerificationController");

function schoolInviteVerificationRoutes({
  pool,
  schoolInvite,
  schoolCodeLookupLimiter,
}) {
  const router = express.Router();
  const controller = createSchoolInviteVerificationController({ pool, schoolInvite });

  router.post(
    "/verify-school-code",
    schoolCodeLookupLimiter,
    controller.verify
  );

  return router;
}

module.exports = schoolInviteVerificationRoutes;
