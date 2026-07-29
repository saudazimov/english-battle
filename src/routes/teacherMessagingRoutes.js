const teacherConversationsRoutes = require("./teacherConversationsRoutes");
const teacherConversationMessagesListRoutes = require(
  "./teacherConversationMessagesListRoutes"
);
const teacherConversationMessageSendRoutes = require(
  "./teacherConversationMessageSendRoutes"
);
const studentTeacherMessageSendRoutes = require(
  "./studentTeacherMessageSendRoutes"
);

const defaultRouteFactories = {
  conversations: teacherConversationsRoutes,
  messagesList: teacherConversationMessagesListRoutes,
  teacherMessageSend: teacherConversationMessageSendRoutes,
  studentMessageSend: studentTeacherMessageSendRoutes,
};

function registerTeacherMessagingRoutes({
  app,
  teacherStudentLinked,
  directMessageLimiter,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.conversations({ onlineUsers }));
  app.use(routeFactories.messagesList({ teacherStudentLinked }));

  const messageSendDependencies = {
    teacherStudentLinked,
    directMessageLimiter,
    sanitizeText,
    filterProfanity,
    onlineUsers,
    io,
    createNotification,
  };

  app.use(routeFactories.teacherMessageSend(messageSendDependencies));
  app.use(routeFactories.studentMessageSend(messageSendDependencies));
}

module.exports = registerTeacherMessagingRoutes;
