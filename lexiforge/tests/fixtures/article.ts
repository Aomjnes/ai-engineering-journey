/** Original fixture article (written for tests) wrapped in realistic news-page chrome. */
export const ARTICLE_PARAGRAPHS = [
  "City officials in Rotterdam have approved an ambitious plan to convert three disused harbour warehouses into floating classrooms, a move they say could ease chronic overcrowding in local primary schools within two years.",
  "The proposal, which won the support of a narrow majority on the council on Tuesday evening, will cost an estimated 48 million euros. Supporters argue that the buildings are structurally sound and that refurbishing them is considerably cheaper than constructing new schools on scarce land.",
  "Critics, however, have raised concerns about safety and long-term maintenance. Several opposition councillors pointed out that the warehouses sit on a stretch of water that is regularly affected by storm surges, and they questioned whether insurers would cover the risk.",
  "Parents' groups have reacted cautiously. Many welcome any attempt to reduce class sizes, which have risen steadily over the past decade, but some fear that children will face long journeys across the city to reach the new sites.",
  "The education department insists that the plan has been carefully designed with these issues in mind. A spokesperson said engineers had modelled the effect of severe weather and concluded that the floating structures would remain stable even in extreme conditions.",
  "Construction is expected to begin next spring. If the first classroom opens on schedule, officials say they will consider extending the scheme to other parts of the port, where dozens of similar buildings currently stand empty.",
  "Urban planners elsewhere in Europe are watching closely. Cities from Hamburg to Copenhagen face similar pressures on land and housing, and several have already sent delegations to study the Rotterdam model before committing to projects of their own.",
];

export function articleHtml(title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} | Example News</title>
<style>.ad{display:block}</style><script>window.analytics = {};</script></head>
<body>
<header><nav><a href="/">Home</a> <a href="/world">World</a> <a href="/science">Science</a> <a href="/sport">Sport</a></nav></header>
<div class="ad">Advertisement</div>
<main><article>
<h1>${title}</h1>
<p class="byline">By Jane Example</p>
${ARTICLE_PARAGRAPHS.map((p) => `<p>${p}</p>`).join("\n")}
<p>Advertisement</p>
</article></main>
<aside><h3>Most read</h3><ul><li><a href="/a">Story one</a></li><li><a href="/b">Story two</a></li></ul></aside>
<footer>Copyright Example News 2026. All rights reserved.</footer>
</body></html>`;
}

export function rssXml(base: string, items: Array<{ path: string; title: string; date: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Example News</title><link>${base}</link><description>Test feed</description>
${items.map((i) => `<item><title>${i.title}</title><link>${base}${i.path}?utm_source=rss&amp;utm_medium=feed</link><pubDate>${i.date}</pubDate><description>Summary of ${i.title}</description></item>`).join("\n")}
</channel></rss>`;
}
