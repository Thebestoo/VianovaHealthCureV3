// Shared time-bucketing for "trend over time" charts (cases, billing claims,
// etc). Originally lived only in Dashboard.jsx for the Cases Over Time chart;
// extracted so Billing (and any future page) can build the same
// daily/weekly/monthly/lifetime buckets from its own records without
// re-implementing the bucket math.

function startOfHour(d) {
  const x = new Date(d)
  x.setMinutes(0, 0, 0)
  return x
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d) {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

export const RANGE_OPTIONS = [
  { key: 'daily',    label: 'Daily',    chartLabel: 'Last 24 hours', suffix: 'today' },
  { key: 'weekly',   label: 'Weekly',   chartLabel: 'Last 7 days',   suffix: 'last 7 days' },
  { key: 'monthly',  label: 'Monthly',  chartLabel: 'Last 30 days',  suffix: 'last 30 days' },
  { key: 'lifetime', label: 'Lifetime', chartLabel: 'Last 12 months', suffix: 'all time' },
]

export function filterByRange(items, range, dateField = 'created_at') {
  if (range === 'lifetime') return items
  const now = new Date()
  const cutoff = new Date(now)
  if (range === 'daily') return items.filter(it => new Date(it[dateField]) >= startOfDay(now))
  if (range === 'weekly') cutoff.setDate(cutoff.getDate() - 7)
  if (range === 'monthly') cutoff.setDate(cutoff.getDate() - 30)
  return items.filter(it => new Date(it[dateField]) >= cutoff)
}

// Builds `count` buckets stepping backward from now by `stepMs`-ish units (via
// `advance`), so daily/weekly/monthly/lifetime views all share one shape of series.
// `reduce(bucket, item)` accumulates each item into its bucket — defaults to a
// plain count, but callers (e.g. billing revenue) can sum a numeric field instead.
function buildSeries(items, { count, floor, advance, format, dateField = 'created_at', reduce }) {
  const buckets = []
  const now = floor(new Date())
  for (let i = count - 1; i >= 0; i--) {
    const start = advance(new Date(now), -i)
    buckets.push({ start, label: format(start), count: 0, value: 0 })
  }
  const accumulate = reduce || ((b) => { b.count++ })
  items.forEach(item => {
    const start = floor(new Date(item[dateField]))
    const slot = buckets.find(b => b.start.getTime() === start.getTime())
    if (slot) accumulate(slot, item)
  })
  return buckets.map(b => ({ bucket: b.label, count: b.count, value: b.value }))
}

export function buildRangeSeries(items, range, { dateField = 'created_at', reduce } = {}) {
  const opts = { dateField, reduce }
  if (range === 'daily') {
    return buildSeries(items, {
      ...opts, count: 24, floor: startOfHour,
      advance: (d, i) => { d.setHours(d.getHours() + i); return d },
      format: d => d.toLocaleTimeString('en-US', { hour: 'numeric' }),
    })
  }
  if (range === 'weekly') {
    return buildSeries(items, {
      ...opts, count: 7, floor: startOfDay,
      advance: (d, i) => { d.setDate(d.getDate() + i); return d },
      format: d => d.toLocaleDateString('en-US', { weekday: 'short' }),
    })
  }
  if (range === 'monthly') {
    return buildSeries(items, {
      ...opts, count: 30, floor: startOfDay,
      advance: (d, i) => { d.setDate(d.getDate() + i); return d },
      format: d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
  }
  return buildSeries(items, {
    ...opts, count: 12, floor: startOfMonth,
    advance: (d, i) => { d.setMonth(d.getMonth() + i); return d },
    format: d => d.toLocaleDateString('en-US', { month: 'short' }),
  })
}
