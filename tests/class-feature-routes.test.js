const test = require("node:test");
const assert = require("node:assert/strict");

const { createClassFeatureRoutes } = require("../src/routes/classFeatureRoutes");

test("class feature preserves phased registrar order and membership instance", () => {
  const calls = [];
  const app = {};
  const membershipDependencies = { pool: {}, premium: {}, io: {} };
  const routes = {
    registerTeacherManagement(dependencies) {
      calls.push(["teacher-management", dependencies]);
    },
    createStudentMembership(dependencies) {
      calls.push(["create-membership", dependencies]);
      return {
        registerEntryRoutes(receivedApp) {
          calls.push(["membership-entry", receivedApp]);
        },
        registerPostAnnouncementRoutes(receivedApp) {
          calls.push(["membership-post-announcement", receivedApp]);
        },
      };
    },
    registerAnnouncements(dependencies) {
      calls.push(["announcements", dependencies]);
    },
    registerLearning(dependencies) {
      calls.push(["learning", dependencies]);
    },
  };
  const feature = createClassFeatureRoutes({ routes });
  const teacherDependencies = { app, sanitizeText() {}, logAudit() {} };
  const announcementDependencies = { app, io: {} };
  const learningDependencies = { app, pool: {} };

  feature.registerTeacherManagementRoutes(teacherDependencies);
  feature.initializeStudentMembershipRoutes(membershipDependencies);
  feature.registerStudentEntryRoutes(app);
  feature.registerAnnouncementRoutes(announcementDependencies);
  feature.registerStudentPostAnnouncementRoutes(app);
  feature.registerLearningRoutes(learningDependencies);

  assert.deepEqual(calls, [
    ["teacher-management", teacherDependencies],
    ["create-membership", membershipDependencies],
    ["membership-entry", app],
    ["announcements", announcementDependencies],
    ["membership-post-announcement", app],
    ["learning", learningDependencies],
  ]);
});
