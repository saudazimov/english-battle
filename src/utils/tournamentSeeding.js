// Standart seeding tartibi (kuchlilar finalda uchrashadi).
function seedOrder(size) {
  // 2 lik asosдан boshlab rekursiv quramiz.
  const rounds = Math.log2(size);
  let order = [1, 2];
  for (let round = 1; round < rounds; round++) {
    const next = [];
    const sum = order.length * 2 + 1;
    for (const seed of order) {
      next.push(seed);
      next.push(sum - seed);
    }
    order = next;
  }
  return order;
}

module.exports = { seedOrder };
