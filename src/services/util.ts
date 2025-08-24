export function randomUid(prefix='lc') {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}
