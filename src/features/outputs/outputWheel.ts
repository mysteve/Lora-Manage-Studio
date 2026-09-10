export function wheelPixels(delta: number, mode: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? 600 : 1);
}

export function wheelScale(scale: number, delta: number) {
  return Math.max(1, Math.min(8, scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002)));
}

// 对触控板小幅事件累积，连续滚动限速，避免一次滚动越过多张图片。
export function wheelNavigation() {
  let sum = 0;
  let lastEvent = -Infinity;
  let lastMove = -Infinity;
  return (delta: number, now: number): -1 | 1 | null => {
    if (now - lastEvent > 200 || Math.sign(delta) !== Math.sign(sum)) sum = 0;
    lastEvent = now;
    if (now - lastMove < 280) return null;
    sum += delta;
    if (Math.abs(sum) < 40) return null;
    const direction = sum > 0 ? 1 : -1;
    sum = 0;
    lastMove = now;
    return direction;
  };
}
