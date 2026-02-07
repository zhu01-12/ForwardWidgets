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
 */

WidgetMetadata = {
  id: "forward.auto.danmu_api",
  title: "LogVar",
  version: "5.2.0",
  requiredVersion: "0.0.2",
  description: "从LogVar获取弹幕（支持多服务器合并）",
  author: "小振ℓινє",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    {
      name: "server",
      title: "弹幕服务器地址（一行一个，弹幕将从所有服务器合并获取）\n自部署项目地址：https://github.com/huangxd-/danmu_api.git",
      type: "textarea",
      placeholders: [
        {
          title: "示例",
          value: "https://danmu1.example.com/token1\nhttps://danmu2.example.com/token2",
        },
      ],
    },
  ],
  modules: [
    {
      id: "searchDanmu",
      title: "搜索弹幕",
      functionName: "searchDanmu",
      type: "danmu",
      params: [],
    },
    {
      id: "getDetail",
      title: "获取详情",
      functionName: "getDetailById",
      type: "danmu",
      params: [],
    },
    {
      id: "getComments",
      title: "获取弹幕",
      functionName: "getCommentsById",
      type: "danmu",
      params: [],
    },
  ],
};

// ========================
// 工具函数
// ========================

function convertChineseNumber(chineseNumber) {
  if (/^\d+$/.test(chineseNumber)) {
    return Number(chineseNumber);
  }

  const digits = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9,
    '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5,
    '陸': 6, '柒': 7, '捌': 8, '玖': 9
  };

  const units = {
    '十': 10, '百': 100, '千': 1000,
    '拾': 10, '佰': 100, '仟': 1000
  };

  let result = 0;
  let current = 0;
  let lastUnit = 1;

  for (let i = 0; i < chineseNumber.length; i++) {
    const char = chineseNumber[i];
    if (digits[char] !== undefined) {
      current = digits[char];
    } else if (units[char] !== undefined) {
      const unit = units[char];
      if (current === 0) current = 1;
      if (unit >= lastUnit) {
        result = current * unit;
      } else {
        result += current * unit;
      }
      lastUnit = unit;
      current = 0;
    }
  }

  if (current > 0) {
    result += current;
  }

  return result;
}

function matchSeason(anime, queryTitle, season) {
  console.log("start matchSeason: ", anime.animeTitle, queryTitle, season);
  let res = false;
  if (anime.animeTitle.includes(queryTitle)) {
    const title = anime.animeTitle.split("(")[0].trim();
    if (title.startsWith(queryTitle)) {
      const afterTitle = title.substring(queryTitle.length).trim();
      console.log("start matchSeason afterTitle: ", afterTitle);
      if (afterTitle === '' && season.toString() === "1") {
        res = true;
      }
      const seasonIndex = afterTitle.match(/\d+/);
      if (seasonIndex && seasonIndex[0].toString() === season.toString()) {
        res = true;
      }
      const chineseNumber = afterTitle.match(/[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+/);
      if (chineseNumber && convertChineseNumber(chineseNumber[0]).toString() === season.toString()) {
        res = true;
      }
    }
  }
  console.log("start matchSeason res: ", res);
  return res;
}

// ========================
// 核心函数
// ========================

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server } = params;

  const servers = (server || "")
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s);

  const primaryServer = servers[0];
  if (!primaryServer) {
    throw new Error("未配置弹幕服务器地址");
  }

  const queryTitle = encodeURIComponent(title);

  const response = await Widget.http.get(
    `${primaryServer}/api/v2/search/anime?keyword=${queryTitle}`,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    }
  );

  if (!response) {
    throw new Error("获取数据失败");
  }

  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  if (!data.success) {
    throw new Error(data.errorMessage || "API调用失败");
  }

  let animes = [];
  if (data.animes && data.animes.length > 0) {
    animes = data.animes;
    if (season) {
      const matchedAnimes = [];
      const nonMatchedAnimes = [];

      animes.forEach((anime) => {
        if (matchSeason(anime, title, season) && !(title.includes("电影") || title.includes("movie"))) {
          matchedAnimes.push(anime);
        } else {
          nonMatchedAnimes.push(anime);
        }
      });
      animes = [...matchedAnimes, ...nonMatchedAnimes];
    } else {
      const matchedAnimes = [];
      const nonMatchedAnimes = [];

      animes.forEach((anime) => {
        if (title.includes("电影") || title.includes("movie")) {
          matchedAnimes.push(anime);
        } else {
          nonMatchedAnimes.push(anime);
        }
      });
      animes = [...matchedAnimes, ...nonMatchedAnimes];
    }
  }

  return { animes };
}

async function getDetailById(params) {
  const { server, animeId } = params;

  const servers = (server || "")
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s);

  const primaryServer = servers[0];
  if (!primaryServer) {
    throw new Error("未配置弹幕服务器地址");
  }

  const response = await Widget.http.get(
    `${primaryServer}/api/v2/bangumi/${animeId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    }
  );

  if (!response) {
    throw new Error("获取数据失败");
  }

  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  return data.bangumi.episodes;
}

async function getCommentsById(params) {
  const { server, commentId } = params;

  if (!commentId) {
    return null;
  }

  const servers = (server || "")
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s);

  if (servers.length === 0) {
    throw new Error("未配置弹幕服务器地址");
  }

  console.log(`[弹幕] 并行从 ${servers.length} 个服务器获取弹幕`);

  const promises = servers.map(async (currentServer) => {
    try {
      const response = await Widget.http.get(
        `${currentServer}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "ForwardWidgets/1.0.0",
          },
        }
      );

      if (!response) return [];

      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      return Array.isArray(data?.comments) ? data.comments : [];
    } catch (error) {
      console.warn(`[弹幕] 服务器 ${currentServer} 请求失败:`, error.message);
      return [];
    }
  });

  const allCommentsArrays = await Promise.all(promises);

  let mergedComments = [];
  for (const comments of allCommentsArrays) {
    mergedComments = mergedComments.concat(comments);
  }

  // 去重：基于 content + time（保留一位小数精度）
  const seen = new Set();
  mergedComments = mergedComments.filter(comment => {
    const key = `${comment.content}|${Math.round(comment.time * 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 按时间排序
  mergedComments.sort((a, b) => a.time - b.time);

  console.log(`[弹幕] 合并完成，共 ${mergedComments.length} 条`);

  return {
    success: true,
    comments: mergedComments,
    count: mergedComments.length,
  };
}
