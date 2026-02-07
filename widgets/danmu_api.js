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
      name: "primaryServer",
      title: "主服务器地址",
      type: "input",
      placeholders: [
        {
          title: "示例：https://api.example1.com",
          value: "https://api.example1.com",
        },
      ],
    },
    {
      name: "secondaryServer",
      title: "备用服务器地址",
      type: "input",
      placeholders: [
        {
          title: "示例：https://api.example2.com",
          value: "https://api.example2.com",
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

// 同时向多个服务器发起请求，使用最先返回的结果
async function raceMultipleServers(requestFunc, params, serverParamNames) {
  const promises = [];
  const servers = [];
  
  // 收集所有有效的服务器
  for (const serverParamName of serverParamNames) {
    const server = params[serverParamName];
    if (server && server.trim() !== '') {
      servers.push(server);
    }
  }
  
  if (servers.length === 0) {
    throw new Error('没有可用的服务器地址');
  }
  
  // 为每个服务器创建请求Promise
  for (const server of servers) {
    const promise = requestFunc(server, params)
      .then(result => ({
        success: true,
        server: server,
        data: result,
        error: null
      }))
      .catch(error => ({
        success: false,
        server: server,
        data: null,
        error: error
      }));
    
    promises.push(promise);
  }
  
  // 等待第一个成功的响应
  let firstSuccess = null;
  let allErrors = [];
  
  const results = await Promise.allSettled(promises);
  
  // 首先检查成功的响应
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      firstSuccess = result.value;
      break;
    } else if (result.status === 'fulfilled' && !result.value.success) {
      allErrors.push({
        server: result.value.server,
        error: result.value.error
      });
    }
  }
  
  if (firstSuccess) {
    console.log(`使用服务器 ${firstSuccess.server} 的响应`);
    return firstSuccess.data;
  }
  
  // 如果没有成功响应，抛出所有错误
  if (allErrors.length > 0) {
    const errorMessages = allErrors.map(err => `${err.server}: ${err.error.message}`).join('; ');
    throw new Error(`所有服务器请求失败: ${errorMessages}`);
  }
  
  throw new Error('未知错误');
}

// 备选方案：使用Promise.race但处理失败
async function raceServersWithTimeout(requestFunc, params, serverParamNames) {
  const servers = [];
  
  // 收集所有有效的服务器
  for (const serverParamName of serverParamNames) {
    const server = params[serverParamName];
    if (server && server.trim() !== '') {
      servers.push(server);
    }
  }
  
  if (servers.length === 0) {
    throw new Error('没有可用的服务器地址');
  }
  
  // 为每个服务器创建带有超时的请求Promise
  const requests = servers.map(server => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`服务器 ${server} 请求超时`));
      }, 8000); // 8秒超时
      
      requestFunc(server, params)
        .then(result => {
          clearTimeout(timeout);
          resolve({
            server: server,
            data: result
          });
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(new Error(`服务器 ${server} 失败: ${error.message}`));
        });
    });
  });
  
  // 使用Promise.race获取最快响应的服务器
  try {
    const fastestResult = await Promise.race(requests);
    console.log(`最快响应来自服务器: ${fastestResult.server}`);
    return fastestResult.data;
  } catch (error) {
    // 如果最快的请求失败了，尝试其他的
    console.log(`最快请求失败: ${error.message}`);
    
    // 等待所有请求完成，看是否有成功的
    const allResults = await Promise.allSettled(requests);
    
    for (const result of allResults) {
      if (result.status === 'fulfilled') {
        console.log(`使用备选服务器: ${result.value.server}`);
        return result.value.data;
      }
    }
    
    // 如果所有都失败了，抛出错误
    const errors = allResults
      .filter(r => r.status === 'rejected')
      .map(r => r.reason.message)
      .join('; ');
    
    throw new Error(`所有服务器都失败: ${errors}`);
  }
}

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, primaryServer, secondaryServer } = params;

  let queryTitle = title;

  // 定义请求函数
  const searchRequest = async (server, params) => {
    const { queryTitle } = params;
    // 调用弹弹play搜索API - 使用Widget.http.get
    const response = await Widget.http.get(
      `${server}/api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
        timeout: 10000, // 10秒超时
      }
    );

    if (!response) {
      throw new Error("获取数据失败");
    }

    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

    console.log(`从服务器 ${server} 获取数据:`, data);

    // 检查API返回状态
    if (!data.success) {
      throw new Error(data.errorMessage || "API调用失败");
    }

    return data;
  };

  // 同时向多个服务器发起请求，使用最快的响应
  const data = await raceServersWithTimeout(searchRequest, 
    { ...params, queryTitle }, 
    ['primaryServer', 'secondaryServer']);

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
  const { animeId, primaryServer, secondaryServer } = params;
  
  // 定义请求函数
  const detailRequest = async (server, params) => {
    const { animeId } = params;
    const response = await Widget.http.get(
      `${server}/api/v2/bangumi/${animeId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
        timeout: 10000, // 10秒超时
      }
    );

    if (!response) {
      throw new Error("获取数据失败");
    }

    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

    console.log(`从服务器 ${server} 获取详情数据:`, data);

    return data;
  };

  // 同时向多个服务器发起请求，使用最快的响应
  const data = await raceServersWithTimeout(detailRequest, params, ['primaryServer', 'secondaryServer']);

  return data.bangumi.episodes;
}

async function getCommentsById(params) {
  const { commentId, link, videoUrl, season, episode, tmdbId, type, title, primaryServer, secondaryServer } = params;

  if (commentId) {
    // 定义请求函数
    const commentsRequest = async (server, params) => {
      const { commentId } = params;
      // 调用弹弹play弹幕API - 使用Widget.http.get
      const response = await Widget.http.get(
        `${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "ForwardWidgets/1.0.0",
          },
          timeout: 10000, // 10秒超时
        }
      );

      if (!response) {
        throw new Error("获取数据失败");
      }

      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

      console.log(`从服务器 ${server} 获取弹幕数据:`, data);

      return data;
    };

    // 同时向多个服务器发起请求，使用最快的响应
    const data = await raceServersWithTimeout(commentsRequest, params, ['primaryServer', 'secondaryServer']);
    
    return data;
  }
  return null;
}
