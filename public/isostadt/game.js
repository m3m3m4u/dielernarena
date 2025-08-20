document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('c');
  if (!c) return;
  const ctx = c.getContext('2d');
  // Hintergrund
  ctx.fillStyle = '#e6f2ff';
  ctx.fillRect(0, 0, c.width, c.height);
  // Title
  ctx.fillStyle = '#1b1b1b';
  ctx.font = '28px Inter, Arial, sans-serif';
  ctx.fillText('Isostadt – Demo', 20, 44);

  // Versuche CSV Preview
  fetch('/exports/isostadt-items.csv')
    .then(r => {
      if (!r.ok) throw new Error('not found');
      return r.text();
    })
    .then(text => {
      const lines = text.split('\n').slice(0, 6);
      ctx.font = '13px monospace';
      ctx.fillStyle = '#111';
      ctx.fillText('CSV preview:', 20, 80);
      lines.forEach((l, i) => ctx.fillText(l.replace(/\r/, ''), 20, 100 + i * 16));
    })
    .catch(() => {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#666';
      ctx.fillText('CSV nicht gefunden unter /exports/isostadt-items.csv', 20, 80);
    });
});
