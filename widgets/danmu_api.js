/**
 * 弹幕示例模块
 * 给 module 指定 type 为 danmu 后，默认会携带以下参数：
 * tmdbId: TMDB ID，Optional
 * type: 类型，tv | movie
 * title: 标题
 * season: 季，电影时为空
 * episode: 集，电影时为空
 * link: 链接，Optional
 * videoUrl: 视频链接，Optional
 * commentId: 弹幕ID，Optional。在搜索到弹幕列表后实际加载时会携带
 * animeId: 动漫ID，Optional。在搜索到动漫列表后实际加载时会携带
 *
 */
WidgetMetadata = {
  id: "forward.auto.danmu_api",
  title: "LoaVar",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "从接口中获取弹幕",
  author: "，"小振ℓινє
  site: "https://github.com/h05n/ForwardWidgets",
  globalParams: [
    {
      name: "server",
      title: "自定义服务器",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
    {
      name: "server2",
      title: "自定义服务器2",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://danmu-api-69c8.vercel.app",
        },
      ],
    },
    {
      name: "server3",
      title: "自定义服务器3",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
    {
      name: "server4",
      title: "自定义服务器4",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
    {
      name: "server5",
      title: "自定义服务器5",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
    {
      name: "server6",
      title: "自定义服务器6",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
  ],
  modules: [
    {
      //id需固定为searchDanmu
      id: "searchDanmu",
      title: "搜索弹幕",
      functionName: "searchDanmu",
      type: "danmu",
      params: [],
    },
    {
      //id需固定为getDetail
      id: "getDetail",
      title: "获取详情",
      functionName: "getDetailById",
      type: "danmu",
      params: [],
    },
    {
      //id需固定为getComments
      id: "getComments",
      title: "获取弹幕",
      functionName: "getCommentsById",
      type: "danmu",
      params: [],
    },
  ],
};

function normalizeServer(s) {
  if (!s || typeof s !== "string") return "";
  let x = s.trim();
  // 去掉末尾 /
  x = x.replace(/\/+$/, "");
  return x;
}

// 未填写 / 还是示例模板（https://{domain}/{token}）就不请求
function isValidServer(s) {
  const x = normalizeServer(s);
  if (!x) return false;
  // 如果用户把示例模板当作真实值填了，也跳过
  if (x.includes("{domain}") || x.includes("{token}") || (x.includes("{") && x.includes("}"))) return false;
  // 简单限制为 http/https
  if (!/^https?:\/\//i.test(x)) return false;
  return true;
}

function getServersFromParams(params) {
  const servers = [
    params.server,
    params.server2,
    params.server3,
    params.server4,
    params.server5,
    params.server6,
  ]
    .map(normalizeServer)
    .filter(isValidServer);

  // 去重
  return Array.from(new Set(servers));
}

async function safeGet(url, options) {
  try {
    const response = await Widget.http.get(url, options);
    if (!response) return { ok: false, error: "empty_response" };
    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function searchDanmu(params) {
  const { title, season } = params;

  let queryTitle = title;
  const servers = getServersFromParams(params);

  // 没填任何 server，直接返回空
  if (!servers.length) {
    return { animes: [] };
  }

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "ForwardWidgets/1.0.0",
  };

  // 并发请求：所有填写了的 server 都会请求
  const tasks = servers.map((server) =>
    safeGet(`${server}/api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`, { headers })
  );

  const results = await Promise.all(tasks);

  // 合并所有服务器的 animes（忽略失败的）
  let animes = [];
  results.forEach((r) => {
    if (!r.ok) return;
    const data = r.data;
    if (data && data.success && Array.isArray(data.animes) && data.animes.length > 0) {
      animes = animes.concat(data.animes);
    }
  });

  // 原有排序逻辑尽量保持不变
  if (animes.length > 0) {
    if (season) {
      // order by season
      const matchedAnimes = [];
      const nonMatchedAnimes = [];

      animes.forEach((anime) => {
        if (matchSeason(anime, queryTitle, season) && !(queryTitle.includes("电影") || queryTitle.includes("movie"))) {
          matchedAnimes.push(anime);
        } else {
          nonMatchedAnimes.push(anime);
        }
      });

      // Combine matched and non-matched animes, with matched ones at the front
      animes = [...matchedAnimes, ...nonMatchedAnimes];
    } else {
      // order by type
      const matchedAnimes = [];
      const nonMatchedAnimes = [];

      animes.forEach((anime) => {
        if (queryTitle.includes("电影") || queryTitle.includes("movie")) {
          matchedAnimes.push(anime);
        } else {
          nonMatchedAnimes.push(anime);
        }
      });

      // Combine matched and non-matched animes, with matched ones at the front
      animes = [...matchedAnimes, ...nonMatchedAnimes];
    }
  }

  return {
    animes: animes,
  };
}

function matchSeason(anime, queryTitle, season) {
  console.log("start matchSeason: ", anime.animeTitle, queryTitle, season);
  let res = false;
  if (anime.animeTitle.includes(queryTitle)) {
    const title = anime.animeTitle.split("(")[0].trim();
    if (title.startsWith(queryTitle)) {
      const afterTitle = title.substring(queryTitle.length).trim();
      console.log("start matchSeason afterTitle: ", afterTitle);
      if (afterTitle === "" && season.toString() === "1") {
        res = true;
      }
      // match number from afterTitle
      const seasonIndex = afterTitle.match(/\d+/);
      if (seasonIndex && seasonIndex[0].toString() === season.toString()) {
        res = true;
      }
      // match chinese number
      const chineseNumber = afterTitle.match(/[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+/);
      if (chineseNumber && convertChineseNumber(chineseNumber[0]).toString() === season.toString()) {
        res = true;
      }
    }
  }
  console.log("start matchSeason res: ", res);
  return res;
}

function convertChineseNumber(chineseNumber) {
  // 如果是阿拉伯数字，直接转换
  if (/^\d+$/.test(chineseNumber)) {
    return Number(chineseNumber);
  }

  // 中文数字映射（简体+繁体）
  const digits = {
    // 简体
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    // 繁体
    壹: 1,
    貳: 2,
    參: 3,
    肆: 4,
    伍: 5,
    陸: 6,
    柒: 7,
    捌: 8,
    玖: 9,
  };

  // 单位映射（简体+繁体）
  const units = {
    // 简体
    十: 10,
    百: 100,
    千: 1000,
    // 繁体
    拾: 10,
    佰: 100,
    仟: 1000,
  };

  let result = 0;
  let current = 0;
  let lastUnit = 1;

  for (let i = 0; i < chineseNumber.length; i++) {
    const char = chineseNumber[i];

    if (digits[char] !== undefined) {
      // 数字
      current = digits[char];
    } else if (units[char] !== undefined) {
      // 单位
      const unit = units[char];

      if (current === 0) current = 1;

      if (unit >= lastUnit) {
        // 更大的单位，重置结果
        result = current * unit;
      } else {
        // 更小的单位，累加到结果
        result += current * unit;
      }

      lastUnit = unit;
      current = 0;
    }
  }

  // 处理最后的个位数
  if (current > 0) {
    result += current;
  }

  return result;
}

async function getDetailById(params) {
  const { animeId } = params;
  const servers = getServersFromParams(params);

  if (!servers.length) return [];

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "ForwardWidgets/1.0.0",
  };

  // 全部请求，失败的忽略
  const tasks = servers.map((server) =>
    safeGet(`${server}/api/v2/bangumi/${animeId}`, { headers })
  );

  const results = await Promise.all(tasks);

  // 合并 episodes（轻量去重：按 episodeId 或 id 或 name + episodeNumber）
  const episodes = [];
  const seen = new Set();

  results.forEach((r) => {
    if (!r.ok) return;
    const data = r.data;
    if (!data || !data.bangumi || !Array.isArray(data.bangumi.episodes)) return;

    data.bangumi.episodes.forEach((ep) => {
      const key =
        (ep.episodeId !== undefined ? `eid:${ep.episodeId}` : "") ||
        (ep.id !== undefined ? `id:${ep.id}` : "") ||
        `mix:${ep.episodeTitle || ""}#${ep.episodeNumber || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      episodes.push(ep);
    });
  });

  return episodes;
}

async function getCommentsById(params) {
  const { commentId } = params;
  const servers = getServersFromParams(params);

  if (!commentId) return null;
  if (!servers.length) return null;

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "ForwardWidgets/1.0.0",
  };

  // 全部请求，失败的忽略
  const tasks = servers.map((server) =>
    safeGet(`${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`, { headers })
  );

  const results = await Promise.all(tasks);

  // 合并弹幕：尽量保持原返回结构，取第一个成功的为 base，然后把 danmakus 合并进去
  let base = null;
  const danmakus = [];
  const seen = new Set();

  results.forEach((r) => {
    if (!r.ok) return;
    const data = r.data;
    if (!data) return;

    if (!base) base = data;

    // 兼容不同字段名（有些接口返回 danmakus，有些返回 comments）
    const list = Array.isArray(data.danmakus)
      ? data.danmakus
      : Array.isArray(data.comments)
      ? data.comments
      : null;

    if (!list) return;

    list.forEach((d) => {
      const key =
        (d.cid !== undefined ? `cid:${d.cid}` : "") ||
        (d.id !== undefined ? `id:${d.id}` : "") ||
        `mix:${d.p || d.time || ""}|${d.m || d.text || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      danmakus.push(d);
    });
  });

  if (!base) return null;

  // 把合并后的结果放回 base
  if (Array.isArray(base.danmakus)) {
    base.danmakus = danmakus;
  } else if (Array.isArray(base.comments)) {
    base.comments = danmakus;
  } else {
    // 若原本没有对应字段，也补一个 danmakus
    base.danmakus = danmakus;
  }

  return base;
}
