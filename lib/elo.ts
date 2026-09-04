export const BASE_RATING = 1500;
const K = 24;

export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/** Returns the pair's new ratings. `score` is A's result: 1 win, 0.5 tie, 0 loss. */
export function updateElo(ra: number, rb: number, score: number) {
  const ea = expected(ra, rb);
  return {
    a: Math.round((ra + K * (score - ea)) * 10) / 10,
    b: Math.round((rb + K * (1 - score - (1 - ea))) * 10) / 10,
  };
}
