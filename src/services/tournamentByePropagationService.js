// Bye g'oliblarini keyingi raundga avtomatik joylashtirish
async function propagateByes(client, tid) {
  // 1-raunddagi 'done' (bye) matchlardan g'oliblarni keyingi raundga qo'yamiz
  const roundOne = await client.query(
    "SELECT match_no, winner_school, winner_school_key FROM tournament_matches WHERE tournament_id = $1 AND round = 1 AND status = 'done' ORDER BY match_no",
    [tid]
  );
  for (const row of roundOne.rows) {
    if (!row.winner_school || !row.winner_school_key) continue;
    // Keyingi raunddagi match: (match_no+1)/2, tomonni aniqlaymiz
    const nextMatchNo = Math.ceil(row.match_no / 2);
    const isA = (row.match_no % 2 === 1);
    const column = isA ? "school_a" : "school_b";
    const keyColumn = isA ? "school_a_key" : "school_b_key";
    await client.query(
      `UPDATE tournament_matches SET ${column} = $1, ${keyColumn} = $2 WHERE tournament_id = $3 AND round = 2 AND match_no = $4`,
      [row.winner_school, row.winner_school_key, tid, nextMatchNo]
    );
  }
}

module.exports = { propagateByes };
