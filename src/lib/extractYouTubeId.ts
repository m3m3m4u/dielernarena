export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  let input = url.trim();
  if (/^[a-zA-Z0-9_-]{6,}$/.test(input) && !input.includes('.') && !input.includes('/')) return input;
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[a-zA-Z0-9_-]{6,}$/.test(seg)) return seg;
    }
    if (host.endsWith('youtube.com')) {
      const vParam = u.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{6,}$/.test(vParam)) return vParam;
      let m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
    }
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && /^[a-zA-Z0-9_-]{6,}$/.test(last)) return last;
    return null;
  } catch {
    const m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
    if (m) return m[1];
    return null;
  }
}
