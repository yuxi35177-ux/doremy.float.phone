export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return Response.json({ ok: false, error: '未检测到文本' }, { status: 400 });
    }

    const urlMatch = text.match(
      /https?:\/\/(?:xhslink\.cn|xhslink\.com|(?:www\.)?xiaohongshu\.com)\/[^\s"'<>，。！；）】]+/i
    );
    if (!urlMatch) {
      return Response.json({ ok: false, error: '未识别到小红书链接' }, { status: 400 });
    }

    const rawUrl = urlMatch[0];
    const res = await fetch(rawUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const html = await res.text();
    const pickMeta = (names: string[]) => {
      for (const name of names) {
        const reg1 = new RegExp(
          `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,
          'i'
        );
        const reg2 = new RegExp(
          `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`,
          'i'
        );
        const m = html.match(reg1) || html.match(reg2);
        if (m && m[1]) return m[1].trim();
      }
      return '';
    };

    let title = pickMeta(['og:title', 'twitter:title']);
    if (!title) {
      const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = tMatch ? tMatch[1].replace(/\s*-\s*小红书.*$/, '').trim() : '小红书笔记';
    }

    const desc = pickMeta(['description', 'og:description']);
    const imgMatches = [
      ...html.matchAll(
        /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi
      ),
    ];
    const images = Array.from(new Set(imgMatches.map((m) => m[1]))).slice(0, 4);

    return Response.json({
      ok: true,
      url: res.url || rawUrl,
      title: title.replace(/\s*-\s*小红书$/, ''),
      desc,
      images,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || '解析失败' },
      { status: 500 }
    );
  }
}
