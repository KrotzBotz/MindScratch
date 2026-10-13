import { createNoise3D } from 'simplex-noise';

// Animated sketch: setup() returns a draw function that runs every frame.
export default {
  title: 'Flow Field',
  setup({ ctx, width, height, random }) {
    const noise = createNoise3D(random);
    const hue = random(360);
    const bg = '11, 11, 15';

    ctx.fillStyle = `rgb(${bg})`;
    ctx.fillRect(0, 0, width, height);

    const spawn = () => ({ x: random(width), y: random(height), hue: hue + random(-30, 30) });
    const particles = Array.from({ length: 1500 }, spawn);

    return ({ time }) => {
      // A translucent wash each frame fades old strokes into trails.
      ctx.fillStyle = `rgba(${bg}, 0.04)`;
      ctx.fillRect(0, 0, width, height);
      ctx.lineWidth = 1;

      for (const p of particles) {
        const angle = noise(p.x * 0.002, p.y * 0.002, time * 0.05) * Math.PI * 2;
        const nx = p.x + Math.cos(angle) * 1.5;
        const ny = p.y + Math.sin(angle) * 1.5;

        ctx.strokeStyle = `hsla(${p.hue}, 70%, 65%, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        p.x = nx;
        p.y = ny;
        if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) Object.assign(p, spawn());
      }
    };
  },
};
