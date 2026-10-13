// Static sketch: setup() draws once and returns nothing.
// After the classic one-liner: 10 PRINT CHR$(205.5+RND(1)); : GOTO 10
export default {
  title: '10 PRINT',
  setup({ ctx, width, height, random }) {
    const size = random.pick([16, 24, 32, 48]);

    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e8e6e3';
    ctx.lineWidth = size / 8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        if (random.chance()) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + size, y + size);
        } else {
          ctx.moveTo(x + size, y);
          ctx.lineTo(x, y + size);
        }
      }
    }
    ctx.stroke();
  },
};
