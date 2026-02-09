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
  description: "从LogVar获取弹幕",
  author: "小振ℓινє",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
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
      name: "server2",
      title: "备用服务器(可选)",
      type: "input",
      placeholders: [
        {
          title: "备用API地址",
          value: "https://danmu-api-69c8.vercel.app",
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

// 辅助函数：尝试多个服务器
async function tryServers(urlPaths, params) {
  const { server, server2 } = params;
  const servers = [server];
  
  // 如果有备用服务器，添加到列表
  if (server2 && server2.trim()) {
    servers.push(server2.trim());
  }
  
  let lastError = null;
  
  // 尝试每个服务器
  for (const baseUrl of servers) {
    try {
      const url = Array.isArray(urlPaths) ? 
        urlPaths.map(path => `${baseUrl}/${path}`).join(';') : 
        `${baseUrl}/${urlPaths}`;
      
      const response = await Widget.http.get(url, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
      });
      
      if (response) {
        return response;
      }
    } catch (error) {
      console.log(`服务器 ${baseUrl} 请求失败: ${error.message}`);
      lastError = error;
      // 继续尝试下一个服务器
    }
  }
  
  // 所有服务器都失败
  if (lastError) {
    throw new Error(`所有服务器请求失败，最后一个错误: ${lastError.message}`);
  }
  throw new Error("获取数据失败");
}

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server, server2 } = params;

  let queryTitle = title;

  // 尝试多个服务器获取数据
  const response = await tryServers(`api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`, params);
  
  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  console.log("搜索结果:", data);

  // 检查API返回状态
  if (!data.success) {
    throw new Error(data.errorMessage || "API调用失败");
  }

  // 开始过滤数据
  let animes = [];
  if (data.animes && data.animes.length > 0) {
    animes = data.animes;
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
  
  // 尝试多个服务器获取数据
  const response = await tryServers(`api/v2/bangumi/${animeId}`, params);
  
  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  console.log("详情数据:", data);

  return data.bangumi.episodes;
}

async function getCommentsById(params) {
  const { commentId, link, videoUrl, season, episode, tmdbId, type, title } = params;

  if (commentId) {
    // 尝试多个服务器获取弹幕数据
    const response = await tryServers(`api/v2/comment/${commentId}?withRelated=true&chConvert=1`, params);
    
    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

    return data;
  }
  return null;
}

// 新增：直接搜索弹幕的备用方案
async function searchDanmuDirectly(params) {
  const { title, season, episode, type } = params;
  
  // 构建搜索关键词
  let keyword = title;
  if (type === 'tv' && season) {
    keyword += ` 第${season}季`;
  }
  
  try {
    // 这里可以添加直接搜索弹幕的备用API
    // 例如：使用一些公开的弹幕搜索API
    const directSearchUrl = `https://api.example.com/search?keyword=${encodeURIComponent(keyword)}&type=${type}`;
    
    const response = await Widget.http.get(directSearchUrl, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    });
    
    if (response) {
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      return data;
    }
  } catch (error) {
    console.log("直接搜索弹幕失败:", error);
  }
  
  return null;
}
