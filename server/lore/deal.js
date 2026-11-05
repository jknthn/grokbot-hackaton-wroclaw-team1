function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeal(entries) {
  return function deal(count) {
    const n = Math.max(0, Number(count) || 0);
    if (n > entries.length) {
      const err = new Error("not enough lore names");
      err.code = "LORE_SHORT";
      throw err;
    }
    return shuffle(entries).slice(0, n);
  };
}

module.exports = { shuffle, makeDeal };
