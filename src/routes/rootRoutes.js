const express = require("express");
const { root } = require("../controllers/rootController");

function createRootRoutes() {
  const router = express.Router();
  router.get("/", root);
  return router;
}

module.exports = createRootRoutes;
