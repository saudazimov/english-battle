function resolveOwnedUserId(rawUserId, authenticatedUserId) {
  if (typeof rawUserId !== "string" || !/^[1-9]\d*$/.test(rawUserId)) {
    return { status: "invalid" };
  }

  const userId = Number(rawUserId);
  if (!Number.isSafeInteger(userId)) return { status: "invalid" };
  if (userId !== authenticatedUserId) return { status: "forbidden" };
  return { status: "valid", userId };
}

module.exports = { resolveOwnedUserId };
