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
  version: "5.4.0",
  requiredVersion: "0.0.2",
  description: "从多个API源获取弹幕，支持屏蔽词过滤",
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
    {
      name: "blockWords",
      title: "屏蔽词（多个用逗号分隔）",
      type: "input",
      placeholders: [
        {
          title: "例如：不良,违禁,不需要",
          value: "",
        },
      ],
    },
    {
      name: "enableBlockFilter",
      title: "启用屏蔽词过滤",
      type: "select",
      options: [
        { title: "启用", value: "true" },
        { title: "禁用", value: "false" }
      ],
      defaultValue: "true"
    },
    {
      name: "mergeStrategy",
      title: "合并策略",
      type: "select",
      options: [
        { title: "全部合并去重", value: "merge_all" },
        { title: "主服务器优先", value: "primary_first" },
        { title: "智能选择最快", value: "smart_fast" }
      ],
      defaultValue: "merge_all"
    },
    {
      name: "timeout",
      title: "请求超时(毫秒)",
      type: "input",
      placeholders: [
        {
          title: "默认5000毫秒",
          value: "5000",
        },
      ],
    }
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

// 辅助函数：同时请求多个服务器
async function requestMultipleServers(urlPath, params, options = {}) {
  const { server, server2, mergeStrategy = "merge_all", timeout = 5000 } = params;
  const servers = [];
  
  // 添加主服务器
  if (server && server.trim()) {
    servers.push({ url: server.trim(), type: "primary" });
  }
  
  // 添加副服务器
  if (server2 && server2.trim()) {
    servers.push({ url: server2.trim(), type: "secondary" });
  }
  
  if (servers.length === 0) {
    throw new Error("请至少配置一个服务器地址");
  }
  
  // 根据合并策略处理
  if (mergeStrategy === "primary_first" && servers.length > 0) {
    // 主服务器优先，只使用主服务器
    const primaryServer = servers.find(s => s.type === "primary");
    if (primaryServer) {
      const url = `${primaryServer.url}/${urlPath}`;
      try {
        const response = await Widget.http.get(url, {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "ForwardWidgets/1.0.0",
          },
          timeout: parseInt(timeout),
          ...options
        });
        return [{ data: response.data, server: primaryServer.url }];
      } catch (error) {
        console.log(`主服务器请求失败: ${error.message}`);
        // 主服务器失败，尝试副服务器
        const secondaryServer = servers.find(s => s.type === "secondary");
        if (secondaryServer) {
          const url = `${secondaryServer.url}/${urlPath}`;
          try {
            const response = await Widget.http.get(url, {
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "ForwardWidgets/1.0.0",
              },
              timeout: parseInt(timeout),
              ...options
            });
            return [{ data: response.data, server: secondaryServer.url }];
          } catch (error2) {
            throw new Error(`所有服务器请求失败: ${error2.message}`);
          }
        }
        throw error;
      }
    }
  }
  
  if (mergeStrategy === "smart_fast") {
    // 智能选择最快服务器
    return [await getFastestServer(urlPath, params)];
  }
  
  // 默认：全部合并去重
  const requests = servers.map(serverInfo => {
    const url = `${serverInfo.url}/${urlPath}`;
    return Widget.http.get(url, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
      timeout: parseInt(timeout),
      ...options
    }).then(response => ({
      data: response.data,
      server: serverInfo.url,
      type: serverInfo.type
    })).catch(error => {
      console.log(`服务器 ${serverInfo.url} 请求失败: ${error.message}`);
      return null;
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

// 获取最快的服务器
async function getFastestServer(urlPath, params) {
  const { server, server2, timeout = 5000 } = params;
  const servers = [];
  
  if (server && server.trim()) {
    servers.push(server.trim());
  }
  
  if (server2 && server2.trim()) {
    servers.push(server2.trim());
  }
  
  const speedTests = servers.map(async (serverUrl) => {
    const startTime = Date.now();
    try {
      const url = `${serverUrl}/${urlPath}`;
      await Widget.http.get(url, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
        timeout: parseInt(timeout)
      });
      const endTime = Date.now();
      return {
        url: serverUrl,
        speed: endTime - startTime,
        success: true
      };
    } catch (error) {
      return {
        url: serverUrl,
        speed: Infinity,
        success: false,
        error: error.message
      };
    }
  });
  
  const results = await Promise.all(speedTests);
  const successfulResults = results.filter(r => r.success).sort((a, b) => a.speed - b.speed);
  
  if (successfulResults.length === 0) {
    throw new Error("所有服务器请求失败");
  }
  
  // 使用最快的服务器进行实际请求
  const fastestServer = successfulResults[0];
  const url = `${fastestServer.url}/${urlPath}`;
  const response = await Widget.http.get(url, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ForwardWidgets/1.0.0",
    },
    timeout: parseInt(timeout)
  });
  
  return {
    data: response.data,
    server: fastestServer.url,
    speed: fastestServer.speed
  };
}

// 屏蔽词过滤函数
function filterByBlockWords(items, blockWords, enableFilter = true) {
  if (!enableFilter || !blockWords || blockWords.trim() === '') {
    return items;
  }
  
  const words = blockWords.split(',').map(word => word.trim().toLowerCase()).filter(word => word);
  
  if (words.length === 0) {
    return items;
  }
  
  return items.filter(item => {
    if (!item.animeTitle) return true;
    
    const title = item.animeTitle.toLowerCase();
    // 检查是否包含任何屏蔽词
    return !words.some(word => title.includes(word));
  });
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
  const { tmdbId, type, title, season, link, videoUrl, server, server2, blockWords, enableBlockFilter = "true" } = params;

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
        allAnimes.push({
          animes: data.animes,
          server: response.server
        });
      } else {
        lastErrorMessage = data.errorMessage || "API调用失败";
      }
    } catch (error) {
      console.log("解析响应数据失败:", error);
    }
  }
  
  // 合并所有animes并去重
  const allAnimeItems = allAnimes.flatMap(item => item.animes);
  const mergedAnimes = deduplicateAnimes([allAnimeItems]);
  
  console.log("合并后animes数量:", mergedAnimes.length);
  
  if (mergedAnimes.length === 0) {
    throw new Error(lastErrorMessage || "未找到相关弹幕");
  }
  
  // 应用屏蔽词过滤
  const enableFilter = enableBlockFilter === "true";
  const filteredAnimes = filterByBlockWords(mergedAnimes, blockWords, enableFilter);
  
  console.log("屏蔽词过滤后数量:", filteredAnimes.length);
  
  if (filteredAnimes.length === 0) {
    throw new Error("所有结果已被屏蔽词过滤");
  }
  
  // 开始过滤和排序数据
  let finalAnimes = [...filteredAnimes];
  
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
    sourceCount: responses.length,
    filteredCount: mergedAnimes.length - filteredAnimes.length
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
