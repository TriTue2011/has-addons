// zca-js khong ho tro huy login dang chay. Generation ngan ket qua cua lan da
// timeout ghi de account/listener/cookie cua retry moi hon.
export function beginReconnectAttempt(states, ownId, state) {
  state.generation = (state.generation || 0) + 1;
  const generation = state.generation;
  return () => states.get(ownId) === state && state.generation === generation;
}

export function invalidateReconnectAttempt(state) {
  state.generation = (state.generation || 0) + 1;
}
