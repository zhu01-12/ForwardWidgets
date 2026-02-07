/**
 * 弹幕示例模块 - 多服务器版
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
  title: "LogVar (多服务器)",
  version: "5.3.0",
  requiredVersion: "0.0.2",
  description: "从多个LogVar服务器获取弹幕",
  author: "小振ℓινє",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    {
      name: "servers",
      title: "弹幕服务器列表(每行一个)",
      type: "textarea",
      placeholders: [
        {
          title: "示例",
          value: "https://api.dandanplay.net\nhttps://danmu.example.com",
        },
      ],
    },
    {
      name: "timeout",
      title: "请求超时(毫秒)",
      type: "input",
      placeholders: [{ title: "默认3000", value: "3000" }],
    },
    {
      name: "retryCount",
      title: "重试次数",
      type: "input",
      placeholders: [{ title: "默认2", value: "2" }],
    },
    {
      name: "enableHealthCheck",
      title: "启用健康检查",
      type: "checkbox",
      default: true,
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

// 服务器健康状态缓存
let serverCache = {
  servers: [],
  healthStatus: {}, // {server: {success: 0, fail: 0, responseTime: [], lastCheck: timestamp}}
  lastUpdate: 0
};

/**
 * 健康检查函数
 * @param {string} server - 服务器地址
 * @returns {Promise<boolean>} 是否健康
 */
async function healthCheck(server) {
  try {
    const startTime = Date.now();
    const response = await Widget.http.get(`${server}/api/v2/search/anime?keyword=test`, {
      timeout: 3000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    });
    const responseTime = Date.now() - startTime;
    
    // 更新健康状态
    if (serverCache.healthStatus[server]) {
      serverCache.healthStatus[server].success++;
      serverCache.healthStatus[server].responseTime.push(responseTime);
      serverCache.healthStatus[server].lastCheck = Date.now();
      // 保留最近10次响应时间
      if (serverCache.healthStatus[server].responseTime.length > 10) {
        serverCache.healthStatus[server].responseTime.shift();
      }
    } else {
      serverCache.healthStatus[server] = {
        success: 1,
        fail: 0,
        responseTime: [responseTime],
        lastCheck: Date.now()
      };
    }
    
    console.log(`服务器 ${server} 健康检查通过，响应时间: ${responseTime}ms`);
    return true;
  } catch (error) {
    console.log(`服务器 ${server} 健康检查失败: ${error.message}`);
    if (serverCache.healthStatus[server]) {
      serverCache.healthStatus[server].fail++;
      serverCache.healthStatus[server].lastCheck = Date.now();
    } else {
      serverCache.healthStatus[server] = {
        success: 0,
        fail: 1,
        responseTime: [],
        lastCheck: Date.now()
      };
    }
    return false;
  }
}

/**
 * 批量健康检查
 * @param {string[]} serverList - 服务器列表
 */
async function batchHealthCheck(serverList) {
  const now = Date.now();
  // 10分钟内只检查一次
  if (now - serverCache.lastUpdate < 10 * 60 * 1000) {
    return;
  }
  
  console.log("开始批量健康检查...");
  const promises = serverList.map(server => healthCheck(server));
  await Promise.allSettled(promises);
  serverCache.lastUpdate = now;
}

/**
 * 获取服务器评分
 * @param {string} server - 服务器地址
 * @returns {number} 评分
 */
function getServerScore(server) {
  const stats = serverCache.healthStatus[server];
  if (!stats) return 0;
  
  const totalRequests = stats.success + stats.fail;
  if (totalRequests === 0) return 0.5; // 默认中等评分
  
  const successRate = stats.success / totalRequests;
  
  // 计算平均响应时间
  let avgResponseTime = 1000; // 默认值
  if (stats.responseTime.length > 0) {
    avgResponseTime = stats.responseTime.reduce((a, b) => a + b, 0) / stats.responseTime.length;
  }
  
  // 综合评分：成功率权重0.6，响应时间权重0.3，新鲜度权重0.1
  const freshness = Math.max(0, 1 - (Date.now() - stats.lastCheck) / (30 * 60 * 1000)); // 30分钟新鲜度
  
  const score = (successRate * 0.6) + 
                (1000 / (avgResponseTime + 100)) * 0.3 + 
                freshness * 0.1;
  
  return Math.max(0, Math.min(1, score)); // 确保在0-1之间
}

/**
 * 获取最佳服务器
 * @param {string} servers - 服务器列表字符串
 * @returns {string|null} 最佳服务器地址
 */
function getBestServer(servers) {
  const serverList = servers.split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (serverList.length === 0) return null;
  
  // 计算每个服务器的评分
  const scoredServers = serverList.map(server => ({
    server,
    score: getServerScore(server)
  }));
  
  // 按分数降序排序
  scoredServers.sort((a, b) => b.score - a.score);
  
  console.log("服务器评分:", scoredServers);
  return scoredServers[0].server;
}

/**
 * 顺序尝试多个服务器
 * @param {string} servers - 服务器列表字符串
 * @param {Function} requestFunc - 请求函数
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 结果
 */
async function tryMultipleServers(servers, requestFunc, params) {
  const serverList = servers.split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (serverList.length === 0) {
    throw new Error("未配置服务器地址");
  }
  
  const timeout = parseInt(params.timeout) || 3000;
  const retryCount = parseInt(params.retryCount) || 2;
  const enableHealthCheck = params.enableHealthCheck !== false;
  
  // 如果需要健康检查，先进行批量检查
  if (enableHealthCheck) {
    await batchHealthCheck(serverList);
  }
  
  let bestServer = null;
  let otherServers = [...serverList];
  
  // 如果有健康检查数据，优先选择最佳服务器
  if (enableHealthCheck && Object.keys(serverCache.healthStatus).length > 0) {
    bestServer = getBestServer(servers);
    if (bestServer) {
      otherServers = serverList.filter(s => s !== bestServer);
      console.log(`优先使用最佳服务器: ${bestServer}`);
    }
  }
  
  // 如果找到了最佳服务器，先尝试它
  if (bestServer) {
    try {
      const result = await executeRequest(bestServer, requestFunc, params, timeout, retryCount);
      return {
        data: result,
        server: bestServer,
        fromCache: false
      };
    } catch (error) {
      console.log(`最佳服务器 ${bestServer} 失败，尝试其他服务器: ${error.message}`);
    }
  }
  
  // 尝试其他服务器
  let lastError = null;
  for (const server of otherServers) {
    try {
      const result = await executeRequest(server, requestFunc, params, timeout, retryCount);
      return {
        data: result,
        server: server,
        fromCache: false
      };
    } catch (error) {
      console.log(`服务器 ${server} 失败: ${error.message}`);
      lastError = error;
    }
  }
  
  throw new Error(`所有服务器都失败: ${lastError ? lastError.message : '未知错误'}`);
}

/**
 * 执行请求（带重试）
 * @param {string} server - 服务器地址
 * @param {Function} requestFunc - 请求函数
 * @param {Object} params - 参数
 * @param {number} timeout - 超时时间
 * @param {number} retryCount - 重试次数
 * @returns {Promise<any>} 结果
 */
async function executeRequest(server, requestFunc, params, timeout, retryCount) {
  for (let retry = 0; retry <= retryCount; retry++) {
    try {
      console.log(`尝试服务器 ${server} (第${retry + 1}次)`);
      
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`请求超时 (${timeout}ms)`)), timeout);
      });
      
      // 执行实际请求
      const response = await Promise.race([
        requestFunc(server, params),
        timeoutPromise
      ]);
      
      console.log(`服务器 ${server} 请求成功`);
      return response;
      
    } catch (error) {
      console.log(`服务器 ${server} 失败 (第${retry + 1}次): ${error.message}`);
      
      // 如果不是最后一次重试，等待一段时间再试
      if (retry < retryCount) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 等待500ms
      } else {
        throw error; // 最后一次重试失败，抛出错误
      }
    }
  }
}

/**
 * 搜索弹幕
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 搜索结果
 */
async function searchDanmu(params) {
  const { servers, tmdbId, type, title, season, link, videoUrl } = params;
  
  const result = await tryMultipleServers(servers, async (server) => {
    let queryTitle = title;
    
    // 调用弹弹play搜索API
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

    console.log(`搜索响应来自 ${server}:`, data);

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
    return { animes: animes, _fromServer: server };
  }, params);

  return result.data;
}

/**
 * 匹配季数
 */
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

/**
 * 转换中文数字
 */
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

/**
 * 获取详情
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 详情数据
 */
async function getDetailById(params) {
  const { servers, animeId } = params;
  
  const result = await tryMultipleServers(servers, async (server) => {
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

    console.log(`详情响应来自 ${server}:`, data);

    return data.bangumi.episodes;
  }, params);

  return result.data;
}

/**
 * 获取弹幕
 * @param {Object} params - 参数
 * @returns {Promise<Object>} 弹幕数据
 */
async function getCommentsById(params) {
  const { servers, commentId, link, videoUrl, season, episode, tmdbId, type, title } = params;

  if (commentId) {
    const result = await tryMultipleServers(servers, async (server) => {
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

      console.log(`弹幕响应来自 ${server}:`, data);

      return data;
    }, params);

    return result.data;
  }
  
  // 如果没有commentId，尝试从视频链接匹配
  if (videoUrl) {
    return await searchCommentsByVideoUrl(servers, videoUrl, params);
  }
  
  return null;
}

/**
 * 根据视频链接搜索弹幕
 */
async function searchCommentsByVideoUrl(servers, videoUrl, params) {
  const result = await tryMultipleServers(servers, async (server) => {
    // 从视频链接提取特征，比如文件名等
    const filename = videoUrl.split('/').pop().split('?')[0];
    
    const response = await Widget.http.get(
      `${server}/api/v2/search/video?filename=${encodeURIComponent(filename)}`,
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
    
    console.log(`视频搜索响应来自 ${server}:`, data);
    
    return data;
  }, params);

  return result.data;
}

/**
 * 清理服务器健康状态
 */
function cleanupServerCache() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  
  Object.keys(serverCache.healthStatus).forEach(server => {
    const status = serverCache.healthStatus[server];
    if (now - status.lastCheck > thirtyMinutes) {
      delete serverCache.healthStatus[server];
    }
  });
}

// 初始化时清理过期的缓存
cleanupServerCache();
