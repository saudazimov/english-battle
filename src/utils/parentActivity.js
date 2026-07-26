function activityLabel(timestamp) {
  if (!timestamp) return "Hali faollik yo'q";
  const days = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000);
  if (days <= 0) return "Bugun";
  if (days === 1) return "Kecha";
  if (days <= 7) return "Shu hafta";
  if (days <= 30) return "Shu oy";
  return "30 kundan oldin";
}

module.exports = { activityLabel };
