// خادم بسيط يجلب أخبار "مجموعة العمل من أجل فلسطينيي سورية" من واجهة WordPress
// الخاصة بموقعهم من جهة الخادم (server-side)، فلا تطبّق عليه قيود CORS
// التي تواجه المتصفح عند الاتصال المباشر بموقع خارجي.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SITE = 'https://actionpal.org.uk';
const API_URL = `${SITE}/wp-json/wp/v2/posts?per_page=8&_embed`;

// ذاكرة تخزين مؤقت بسيطة في الذاكرة لتقليل عدد الطلبات على موقع المصدر
let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 دقائق

app.use(express.static(path.join(__dirname, 'public')));

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').trim();
}

function extractCategory(post) {
  const groups = (post._embedded && post._embedded['wp:term']) || [];
  for (const group of groups) {
    for (const term of group) {
      if (term.taxonomy === 'category') return term.name;
    }
  }
  return 'أخبار';
}

function extractImage(post) {
  const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  return (media && media.source_url) || null;
}

app.get('/api/news', async (req, res) => {
  const now = Date.now();

  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return res.json({ source: 'cache', posts: cache.data });
  }

  try {
    const response = await fetch(API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ActionpalNewsApp/1.0 (+contact: app-support)',
      },
    });

    if (!response.ok) {
      throw new Error(`WordPress API responded with status ${response.status}`);
    }

    const rawPosts = await response.json();

    const posts = rawPosts.map((post) => ({
      id: post.id,
      title: stripHtml(post.title?.rendered),
      excerpt: stripHtml(post.excerpt?.rendered).slice(0, 160),
      link: post.link,
      date: post.date,
      category: extractCategory(post),
      image: extractImage(post),
    }));

    cache = { data: posts, timestamp: now };
    res.json({ source: 'live', posts });
  } catch (err) {
    console.error('[news] fetch failed:', err.message);

    // في حال الفشل، أعد آخر نسخة محفوظة إن وجدت بدل رسالة خطأ فارغة
    if (cache.data) {
      return res.json({ source: 'stale-cache', posts: cache.data });
    }

    res.status(502).json({
      error: 'تعذر جلب الأخبار من الموقع الرسمي حالياً',
      detail: err.message,
    });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✔ الخادم يعمل على المنفذ ${PORT}`);
  console.log(`  افتح http://localhost:${PORT} للمعاينة محلياً`);
});
