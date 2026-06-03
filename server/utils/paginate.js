export function paginate(opts = {}) {
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
