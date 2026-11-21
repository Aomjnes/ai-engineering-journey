/** Default high-signal RSS sources. Seeded into SourceFeed; editable in the DB. */
export const DEFAULT_FEEDS = [
  { name: "BBC News — World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", homepage: "https://www.bbc.com/news", topic: "world" },
  { name: "BBC News — Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", homepage: "https://www.bbc.com/news", topic: "science" },
  { name: "The Guardian — World", url: "https://www.theguardian.com/world/rss", homepage: "https://www.theguardian.com", topic: "world" },
  { name: "The Guardian — Science", url: "https://www.theguardian.com/science/rss", homepage: "https://www.theguardian.com", topic: "science" },
  { name: "NPR — News", url: "https://feeds.npr.org/1001/rss.xml", homepage: "https://www.npr.org", topic: "news" },
  { name: "Aeon — Essays", url: "https://aeon.co/feed.rss", homepage: "https://aeon.co", topic: "ideas" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", homepage: "https://techcrunch.com", topic: "technology" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", homepage: "https://www.theverge.com", topic: "technology" },
  { name: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/", homepage: "https://www.quantamagazine.org", topic: "science" },
] as const;
