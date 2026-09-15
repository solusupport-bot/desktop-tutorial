const fmtDate = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');

const badge = (value) => `<span class="badge ${String(value)}">${value}</span>`;

const countBy = (items, keyFn) => {
  const counts = {};
  items.forEach((item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

module.exports = { fmtDate, badge, countBy };
