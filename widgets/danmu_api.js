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
  title: "多源弹幕",
  version: "5.4.0",
  requiredVersion: "0.0.2",
  description: "从多个API源获取弹幕，支持屏蔽和切换",
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
      title: "备用服务器地址",
      type: "input",
      placeholders: [
        {
          title: "备用API地址",
          value: "https://another.com/danmu_api",
        },
      ],
    },
    {
      name: "blockKeywords",
      title: "屏蔽关键词(每行一个)",
      type: "text",
      placeholders: [
        {
          title: "输入要屏蔽的关键词，每行一个",
          value: "广告\n测试\n预览",
        },
      ],
    },
    {
      name: "enableBlocking",
      title: "启用屏蔽功能",
      type: "switch",
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

// 全局变量存储多源搜索结果
let multiSourceResults = {};
let currentSource = 'server1';

// 辅助函数：请求单个服务器
async function requestServer(serverUrl, urlPath, params) {
  if (!serverUrl || !serverUrl.trim()) {
    return null;
  }
  
  const url = `${serverUrl.trim()}/${urlPath}`;
  try {
    const response = await Widget.http.get(url, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
      },
      timeout: 10000 // 10秒超时
    });
    
    if (response) {
      return {
        success: true,
        data: typeof response.data === "string" ? JSON.parse(response.data) : response.data,
        server: serverUrl
      };
    }
  } catch (error) {
    console.log(`服务器 ${serverUrl} 请求失败: ${error.message}`);
    return {
      success: false,
      error: error.message,
      server: serverUrl
    };
  }
  
  return null;
}

// 屏蔽功能：过滤不需要的搜索结果
function filterBlockedItems(items, blockKeywords, enabled) {
  if (!enabled || !blockKeywords || !blockKeywords.trim() || !items || items.length === 0) {
    return items;
  }
  
  const keywords = blockKeywords.trim().split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    return items;
  }
  
  console.log("应用屏蔽关键词:", keywords);
  
  return items.filter(item => {
    // 检查标题是否包含屏蔽关键词
    const title = item.animeTitle || '';
    const lowerTitle = title.toLowerCase();
    
    for (const keyword of keywords) {
      if (keyword && lowerTitle.includes(keyword.toLowerCase())) {
        console.log(`屏蔽项目: ${title} (关键词: ${keyword})`);
        return false;
      }
    }
    
    return true;
  });
}

// 格式化搜索结果，添加来源标识
function formatResults(results, serverName) {
  if (!results || results.length === 0) {
    return [];
  }
  
  return results.map(item => {
    // 添加来源信息到对象中（不修改原始标题，以免影响显示）
    return {
      ...item,
      _source: serverName,
      _originalTitle: item.animeTitle,
      // 如果需要，可以在标题后添加来源标记
      animeTitle: `${item.animeTitle} [${serverName.substring(0, 3)}]`
    };
  });
}

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server, server2, blockKeywords, enableBlocking } = params;

  let queryTitle = title;
  
  // 清空之前的搜索结果
  multiSourceResults = {};
  
  // 同时发起两个服务器的请求
  const promises = [];
  
  // 主服务器请求
  if (server && server.trim()) {
    promises.push(
      requestServer(server, `api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`, params)
        .then(result => {
          if (result && result.success && result.data && result.data.animes) {
            // 应用屏蔽功能
            const filteredAnimes = filterBlockedItems(result.data.animes, blockKeywords, enableBlocking);
            
            // 保存到全局变量
            multiSourceResults.server1 = {
              animes: filteredAnimes,
              source: '主服务器',
              serverUrl: result.server,
              success: true
            };
            
            // 格式化结果
            return {
              animes: formatResults(filteredAnimes, '主服务器'),
              source: '主服务器',
              success: true
            };
          }
          return {
            animes: [],
            source: '主服务器',
            success: false,
            error: result?.error || '请求失败'
          };
        })
    );
  }
  
  // 备用服务器请求
  if (server2 && server2.trim()) {
    promises.push(
      requestServer(server2, `api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`, params)
        .then(result => {
          if (result && result.success && result.data && result.data.animes) {
            // 应用屏蔽功能
            const filteredAnimes = filterBlockedItems(result.data.animes, blockKeywords, enableBlocking);
            
            // 保存到全局变量
            multiSourceResults.server2 = {
              animes: filteredAnimes,
              source: '备用服务器',
              serverUrl: result.server,
              success: true
            };
            
            // 格式化结果
            return {
              animes: formatResults(filteredAnimes, '备用服务器'),
              source: '备用服务器',
              success: true
            };
          }
          return {
            animes: [],
            source: '备用服务器',
            success: false,
            error: result?.error || '请求失败'
          };
        })
    );
  }
  
  if (promises.length === 0) {
    throw new Error("请至少配置一个服务器地址");
  }
  
  // 等待所有请求完成
  const results = await Promise.allSettled(promises);
  
  console.log("多源搜索结果:", results);
  
  // 处理结果
  const successfulResults = results
    .filter(r => r.status === 'fulfilled' && r.value && r.value.success && r.value.animes.length > 0)
    .map(r => r.value);
  
  // 默认使用第一个成功的源
  if (successfulResults.length > 0) {
    const defaultResult = successfulResults[0];
    currentSource = defaultResult.source === '主服务器' ? 'server1' : 'server2';
    
    return {
      animes: defaultResult.animes,
      _multiSource: {
        hasMultiple: successfulResults.length > 1,
        sources: Object.keys(multiSourceResults),
        currentSource: currentSource
      }
    };
  }
  
  // 所有请求都失败或没有结果
  throw new Error("所有服务器请求失败或无搜索结果");
}

// 切换搜索结果源（可以通过其他方式调用，如按钮）
function switchSource(sourceKey) {
  if (multiSourceResults[sourceKey] && multiSourceResults[sourceKey].animes) {
    currentSource = sourceKey;
    const sourceData = multiSourceResults[sourceKey];
    
    return {
      animes: formatResults(sourceData.animes, sourceData.source),
      _multiSource: {
        hasMultiple: Object.keys(multiSourceResults).length > 1,
        sources: Object.keys(multiSourceResults),
        currentSource: currentSource
      }
    };
  }
  return null;
}

function matchSeason(anime, queryTitle, season) {
  console.log("start matchSeason: ", anime.animeTitle, queryTitle, season);
  let res = false;
  // 注意：现在anime.animeTitle可能包含来源标记，需要处理
  const originalTitle = anime._originalTitle || anime.animeTitle;
  
  if (originalTitle.includes(queryTitle)) {
    const title = originalTitle.split("(")[0].trim();
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
  const { animeId, server, server2 } = params;
  
  // 从全局变量中获取当前使用的服务器
  const currentSourceData = multiSourceResults[currentSource];
  let targetServer = server;
  
  if (currentSourceData && currentSourceData.serverUrl) {
    targetServer = currentSourceData.serverUrl;
  } else if (currentSource === 'server2' && server2) {
    targetServer = server2;
  }
  
  const response = await requestServer(targetServer, `api/v2/bangumi/${animeId}`, params);
  
  if (response && response.success) {
    return response.data.bangumi.episodes;
  }
  
  throw new Error("获取详情失败");
}

async function getCommentsById(params) {
  const { commentId } = params;
  
  if (!commentId) {
    return null;
  }
  
  // 从全局变量中获取当前使用的服务器
  const currentSourceData = multiSourceResults[currentSource];
  const { server, server2 } = params;
  let targetServer = server;
  
  if (currentSourceData && currentSourceData.serverUrl) {
    targetServer = currentSourceData.serverUrl;
  } else if (currentSource === 'server2' && server2) {
    targetServer = server2;
  }
  
  const response = await requestServer(targetServer, `api/v2/comment/${commentId}?withRelated=true&chConvert=1`, params);
  
  if (response && response.success) {
    return response.data;
  }
  
  throw new Error("获取弹幕失败");
}

// 新增：获取所有服务器的状态
function getServerStatus() {
  const status = {};
  
  for (const [key, data] of Object.entries(multiSourceResults)) {
    status[key] = {
      source: data.source,
      success: data.success,
      count: data.animes ? data.animes.length : 0,
      serverUrl: data.serverUrl
    };
  }
  
  return status;
}

// 新增：手动触发重新搜索
async function refreshSearch(params) {
  // 重新执行搜索
  return await searchDanmu(params);
}
