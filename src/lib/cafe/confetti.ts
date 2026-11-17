/** A few seconds of canvas confetti in café colours; no dependency needed. */
export function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.className = "pointer-events-none fixed inset-0 z-[100]";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  const colors = ["#6f4e37", "#c8a27a", "#e6c9a8", "#b45309", "#f5e6d3", "#be123c", "#047857"];
  const bits = Array.from({ length: 160 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height / 3,
    vx: (Math.random() - 0.5) * 16,
    vy: Math.random() * -14 - 4,
    r: Math.random() * Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const start = performance.now();
  const frame = (now: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
      b.r += 0.2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.color;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
    if (now - start < 3000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
