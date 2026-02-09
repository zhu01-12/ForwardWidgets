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
  version: "5.3.0",
  requiredVersion: "0.0.2",
  description: "从多个API源获取弹幕",
  author: "小振ℓινє",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    {
      name: "server",
      title: "主服务器地址",
      type: "input",
      placeholders: [
        {
          title: "主API地址",
          value: "https://example.com/danmu_api",
        },
      ],
    },
    {
      name: "server2",
      title: "副服务器地址(同时使用)",
      type: "input",
      placeholders: [
        {
          title: "备用API地址",
          value: "https://another.com/danmu_api",
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

// 辅助函数：同时请求多个服务器，合并结果
async function requestMultipleServers(urlPath, params, options = {}) {
  const { server, server2 } = params;
  const servers = [];
  
  // 添加主服务器
  if (server && server.trim()) {
    servers.push(server.trim());
  }
  
  // 添加副服务器
  if (server2 && server2.trim()) {
    servers.push(server2.trim());
  }
  
  if (servers.length === 0) {
    throw new Error("请至少配置一个服务器地址");
  }
  
  // 创建所有请求的Promise
  const requests = servers.map(baseUrl => {
    const url = `${baseUrl}/${urlPath}`;
    return Widget.http.get(url, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
      ...options
    }).catch(error => {
      console.log(`服务器 ${baseUrl} 请求失败: ${error.message}`);
      return null; // 返回null而不是抛出错误，这样其他请求可以继续
    });
  });
  
  // 等待所有请求完成
  const responses = await Promise.all(requests);
  
  // 过滤掉失败的请求
  const validResponses = responses.filter(response => response && response.data);
  
  if (validResponses.length === 0) {
    throw new Error("所有服务器请求失败");
  }
  
  return validResponses;
}

// 去重函数：根据animeId去重
function deduplicateAnimes(animesList) {
  const seen = new Set();
  const result = [];
  
  // 合并所有animes
  const allAnimes = animesList.flat();
  
  for (const anime of allAnimes) {
    if (!seen.has(anime.animeId)) {
      seen.add(anime.animeId);
      result.push(anime);
    }
  }
  
  return result;
}

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server, server2 } = params;

  let queryTitle = title;

  // 同时请求所有配置的服务器
  const responses = await requestMultipleServers(
    `api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`, 
    params
  );
  
  console.log("收到服务器响应数量:", responses.length);
  
  // 处理所有响应数据
  const allAnimes = [];
  let lastErrorMessage = "";
  
  for (const response of responses) {
    try {
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      
      console.log("服务器响应数据:", data);
      
      // 检查API返回状态
      if (data.success && data.animes && data.animes.length > 0) {
        allAnimes.push(data.animes);
      } else {
        lastErrorMessage = data.errorMessage || "API调用失败";
      }
    } catch (error) {
      console.log("解析响应数据失败:", error);
    }
  }
  
  // 合并所有animes并去重
  const mergedAnimes = deduplicateAnimes(allAnimes);
  
  console.log("合并后animes数量:", mergedAnimes.length);
  
  if (mergedAnimes.length === 0) {
    throw new Error(lastErrorMessage || "未找到相关弹幕");
  }
  
  // 开始过滤和排序数据
  let finalAnimes = [...mergedAnimes];
  
  if (season) {
    // 按季匹配排序
    const matchedAnimes = [];
    const nonMatchedAnimes = [];

    finalAnimes.forEach((anime) => {
      if (matchSeason(anime, queryTitle, season) && !(queryTitle.includes("电影") || queryTitle.includes("movie"))) {
          matchedAnimes.push(anime);
      } else {
          nonMatchedAnimes.push(anime);
      }
    });

    // 合并匹配和不匹配的animes，匹配的放在前面
    finalAnimes = [...matchedAnimes, ...nonMatchedAnimes];
  } else {
    // 按类型排序
    const matchedAnimes = [];
    const nonMatchedAnimes = [];

    finalAnimes.forEach((anime) => {
      if (queryTitle.includes("电影") || queryTitle.includes("movie")) {
          matchedAnimes.push(anime);
      } else {
          nonMatchedAnimes.push(anime);
      }
    });

    // 合并匹配和不匹配的animes，匹配的放在前面
    finalAnimes = [...matchedAnimes, ...nonMatchedAnimes];
  }
  
  return {
    animes: finalAnimes,
    sourceCount: responses.length // 返回实际使用的源数量
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
  
  // 同时请求所有服务器，使用第一个成功的响应
  const responses = await requestMultipleServers(`api/v2/bangumi/${animeId}`, params);
  
  // 使用第一个成功的响应
  const response = responses[0];
  const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

  console.log("详情数据:", data);

  return data.bangumi.episodes;
}

async function getCommentsById(params) {
  const { commentId } = params;

  if (commentId) {
    // 同时请求所有服务器，使用第一个成功的响应
    const responses = await requestMultipleServers(
      `api/v2/comment/${commentId}?withRelated=true&chConvert=1`, 
      params
    );
    
    // 使用第一个成功的响应
    const response = responses[0];
    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

    return data;
  }
  return null;
}

// 新增：智能选择最优服务器（基于响应时间）
async function getOptimalServer(params, urlPath) {
  const { server, server2 } = params;
  const servers = [];
  
  if (server && server.trim()) {
    servers.push(server.trim());
  }
  
  if (server2 && server2.trim()) {
    servers.push(server2.trim());
  }
  
  if (servers.length === 0) {
    throw new Error("请至少配置一个服务器地址");
  }
  
  // 测试每个服务器的响应时间
  const serverTests = servers.map(async (baseUrl) => {
    const startTime = Date.now();
    try {
      const url = `${baseUrl}/${urlPath}`;
      const response = await Widget.http.get(url, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
        timeout: 5000 // 5秒超时
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      return {
        server: baseUrl,
        responseTime,
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        server: baseUrl,
        responseTime: Infinity,
        success: false,
        error: error.message
      };
    }
  });
  
  const results = await Promise.all(serverTests);
  
  // 过滤成功的响应，并按响应时间排序
  const successfulResults = results
    .filter(result => result.success)
    .sort((a, b) => a.responseTime - b.responseTime);
  
  if (successfulResults.length > 0) {
    // 返回最快的服务器
    return successfulResults[0];
  }
  
  throw new Error("所有服务器请求失败");
}
