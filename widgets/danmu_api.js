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
  title: "LogVar",
  version: "5.2.0",
  requiredVersion: "0.0.2",
  description: "从多个源获取弹幕",
  author: "小振ℓινє",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    {
      name: "danmuSource",
      title: "弹幕源选择",
      type: "select",
      value: ["auto", "danmu_api", "bangumi"],
      default: "auto",
      desc: "auto:自动选择; danmu_api:LogVar; bangumi:番组计划"
    },
    {
      name: "server",
      title: "自定义服务器(自部署项目地址：https://github.com/huangxd-/danmu_api.git)",
      type: "input",
      placeholders: [
        {
          title: "示例danmu_api",
          value: "https://{domain}/{token}",
        },
      ],
    },
    {
      name: "bangumiServer",
      title: "Bangumi服务器",
      type: "input",
      placeholders: [
        {
          title: "示例bangumi",
          value: "https://api.bangumi.tv",
        },
      ],
      default: "https://api.bangumi.tv"
    },
    {
      name: "filterWords",
      title: "屏蔽词(用逗号分隔)",
      type: "input",
      placeholders: [
        {
          title: "例如:广告,网址,违禁词",
          value: "",
        },
      ],
      default: ""
    },
    {
      name: "enableFilter",
      title: "启用屏蔽词过滤",
      type: "select",
      value: ["true", "false"],
      default: "true"
    }
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

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server, danmuSource, bangumiServer } = params;

  let queryTitle = title;
  let results = [];

  // 根据配置选择API源
  if (danmuSource === "auto" || danmuSource === "danmu_api") {
    try {
      const danmuApiResults = await searchDanmuAPI(server, queryTitle, season);
      danmuApiResults.forEach(item => {
        item.source = "danmu_api";
        item.sourceName = "LogVar";
      });
      results = results.concat(danmuApiResults);
    } catch (error) {
      console.error("Danmu API搜索失败:", error);
    }
  }

  if (danmuSource === "auto" || danmuSource === "bangumi") {
    try {
      const bangumiResults = await searchBangumi(bangumiServer, queryTitle, season);
      bangumiResults.forEach(item => {
        item.source = "bangumi";
        item.sourceName = "番组计划";
      });
      results = results.concat(bangumiResults);
    } catch (error) {
      console.error("Bangumi搜索失败:", error);
    }
  }

  // 去重处理：按标题和季数去重
  const uniqueResults = [];
  const seen = new Set();
  
  results.forEach(item => {
    const key = `${item.animeTitle}_${item.season || 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(item);
    }
  });

  // 排序：优先匹配季数的结果
  uniqueResults.sort((a, b) => {
    const aHasSeason = season && a.season === parseInt(season);
    const bHasSeason = season && b.season === parseInt(season);
    
    if (aHasSeason && !bHasSeason) return -1;
    if (!aHasSeason && bHasSeason) return 1;
    return 0;
  });

  return {
    animes: uniqueResults,
  };
}

// Danmu API搜索
async function searchDanmuAPI(server, queryTitle, season) {
  const response = await Widget.http.get(
    `${server}/api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`,
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
    
    // 添加季数匹配逻辑
    animes.forEach(anime => {
      anime.season = extractSeasonFromTitle(anime.animeTitle, queryTitle);
    });

    if (season) {
      animes.sort((a, b) => {
        const aMatch = a.season === parseInt(season);
        const bMatch = b.season === parseInt(season);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }
  }
  
  return animes;
}

// Bangumi搜索
async function searchBangumi(bangumiServer, queryTitle, season) {
  const response = await Widget.http.get(
    `${bangumiServer}/search/subject/${encodeURIComponent(queryTitle)}?type=2&responseGroup=large`,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    }
  );

  if (!response) {
    throw new Error("获取Bangumi数据失败");
  }

  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  
  let animes = [];
  if (data.list && data.list.length > 0) {
    animes = data.list.map(item => {
      // 提取季数信息
      const seasonInfo = extractSeasonFromBangumi(item.name, item.name_cn);
      
      return {
        animeId: item.id,
        animeTitle: item.name_cn || item.name,
        season: seasonInfo.season,
        episodeCount: item.eps || 0,
        type: item.type === 2 ? "tv" : "movie", // Bangumi类型映射
        rating: item.rating ? item.rating.score : 0,
        image: item.images ? item.images.large : null
      };
    });

    // 如果有季数信息，进行排序
    if (season) {
      animes.sort((a, b) => {
        const aMatch = a.season === parseInt(season);
        const bMatch = b.season === parseInt(season);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }
  }
  
  return animes;
}

// 从Bangumi标题中提取季数
function extractSeasonFromBangumi(jpTitle, cnTitle) {
  const titles = [jpTitle, cnTitle].filter(Boolean);
  let season = 1;
  
  for (const title of titles) {
    // 匹配季数模式：第二季、Season 2、S2等
    const seasonMatch = title.match(/(?:第\s*([一二三四五六七八九十\d]+)\s*季|Season\s*(\d+)|S\s*(\d+))/i);
    if (seasonMatch) {
      const num = seasonMatch[1] || seasonMatch[2] || seasonMatch[3];
      if (num) {
        const parsed = convertChineseNumber(num.toString());
        if (parsed > 0) {
          season = parsed;
          break;
        }
      }
    }
  }
  
  return { season };
}

// 从标题中提取季数
function extractSeasonFromTitle(animeTitle, queryTitle) {
  // 尝试从标题中提取季数
  const cleanTitle = animeTitle.replace(/【.*?】/g, '').trim();
  
  // 匹配季数模式
  const seasonPatterns = [
    /第\s*([一二三四五六七八九十\d]+)\s*季/,
    /Season\s*(\d+)/i,
    /S\s*(\d+)/i,
    /(?:Part|part)\s*(\d+)/i,
    /(\d+)(?:nd|rd|th|st)\s*Season/i
  ];
  
  for (const pattern of seasonPatterns) {
    const match = cleanTitle.match(pattern);
    if (match && match[1]) {
      return convertChineseNumber(match[1]);
    }
  }
  
  // 如果没有明确季数，默认为第1季
  return 1;
}

function matchSeason(anime, queryTitle, season) {
  console.log("start matchSeason: ", anime.animeTitle, queryTitle, season);
  let res = false;
  
  // 如果有明确的季数字段
  if (anime.season && anime.season.toString() === season.toString()) {
    return true;
  }
  
  if (anime.animeTitle && anime.animeTitle.includes(queryTitle)) {
    const title = anime.animeTitle.split("(")[0].trim();
    if (title.startsWith(queryTitle)) {
      const afterTitle = title.substring(queryTitle.length).trim();
      console.log("start matchSeason afterTitle: ", afterTitle);
      if (afterTitle === '' && season.toString() === "1") {
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
  if (!chineseNumber) return 1;
  
  // 如果是阿拉伯数字，直接转换
  if (/^\d+$/.test(chineseNumber)) {
    return Number(chineseNumber);
  }

  // 中文数字映射（简体+繁体）
  const digits = {
    // 简体
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9,
    // 繁体
    '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5,
    '陸': 6, '柒': 7, '捌': 8, '玖': 9
  };

  // 单位映射（简体+繁体）
  const units = {
    // 简体
    '十': 10, '百': 100, '千': 1000,
    // 繁体
    '拾': 10, '佰': 100, '仟': 1000
  };

  let result = 0;
  let current = 0;
  let lastUnit = 1;

  const str = chineseNumber.toString();
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];

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

  return result || 1;
}

async function getDetailById(params) {
  const { server, animeId, source, bangumiServer } = params;
  
  if (source === "bangumi") {
    // 使用Bangumi API获取详情
    return await getBangumiDetail(bangumiServer, animeId);
  } else {
    // 使用默认Danmu API
    const response = await Widget.http.get(
      `${server}/api/v2/bangumi/${animeId}`,
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

    console.log(data);

    return data.bangumi.episodes;
  }
}

// Bangumi获取详情
async function getBangumiDetail(bangumiServer, animeId) {
  const response = await Widget.http.get(
    `${bangumiServer}/v0/episodes?subject_id=${animeId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    }
  );

  if (!response) {
    throw new Error("获取Bangumi详情失败");
  }

  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  
  if (data && data.data) {
    // 转换为标准格式
    return data.data.map(ep => ({
      episodeId: ep.id,
      name: ep.name || `第${ep.sort}集`,
      sort: ep.sort,
      duration: ep.duration || "24:00",
      airdate: ep.airdate
    }));
  }
  
  return [];
}

async function getCommentsById(params) {
  const { server, commentId, link, videoUrl, season, episode, tmdbId, type, title, source, bangumiServer, filterWords, enableFilter } = params;

  let commentsData = null;

  if (source === "bangumi") {
    // 使用Bangumi API获取评论（这里Bangumi没有弹幕，我们用评论替代）
    commentsData = await getBangumiComments(bangumiServer, commentId);
  } else {
    // 调用弹弹play弹幕API
    const response = await Widget.http.get(
      `${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`,
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
    commentsData = data;
  }

  // 启用屏蔽词过滤
  if (commentsData && commentsData.comments && enableFilter === "true" && filterWords) {
    const words = filterWords.split(',').map(word => word.trim()).filter(word => word.length > 0);
    if (words.length > 0) {
      commentsData.comments = commentsData.comments.filter(comment => {
        const content = comment.content || comment.text || '';
        return !words.some(word => content.includes(word));
      });
    }
  }

  return commentsData;
}

// Bangumi获取评论（作为弹幕替代）
async function getBangumiComments(bangumiServer, subjectId) {
  const response = await Widget.http.get(
    `${bangumiServer}/v0/subjects/${subjectId}/comments?limit=100`,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    }
  );

  if (!response) {
    throw new Error("获取Bangumi评论失败");
  }

  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  
  if (data && data.data) {
    // 将评论转换为弹幕格式
    const comments = data.data.map(item => ({
      content: item.content,
      time: 0,
      color: "16777215",
      mode: 1,
      fontSize: 25,
      user: item.user ? item.user.nickname : "匿名用户",
      timestamp: item.created_at
    }));
    
    return {
      comments: comments,
      count: comments.length,
      source: "bangumi"
    };
  }
  
  return { comments: [], count: 0, source: "bangumi" };
}
