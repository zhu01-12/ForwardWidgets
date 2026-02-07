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

async function searchDanmu(params) {
  const { tmdbId, type, title, season, link, videoUrl, server } = params;

  let queryTitle = title;
  console.log(`搜索弹幕: queryTitle=${queryTitle}, server=${server}`);

  // 解析多个服务器地址（用逗号分隔）
  const servers = parseServers(server);
  
  // 同时从所有服务器搜索
  const searchPromises = servers.map(serverUrl => 
    Widget.http.get(
      `${serverUrl}/api/v2/search/anime?keyword=${encodeURIComponent(queryTitle)}`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
      }
    ).then(response => {
      if (!response) {
        console.log(`服务器 ${serverUrl} 返回空响应`);
        return null;
      }
      
      let data;
      try {
        data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      } catch (error) {
        console.log(`服务器 ${serverUrl} 返回的数据解析失败:`, error);
        return null;
      }
      
      // 检查API返回状态
      if (!data.success) {
        console.log(`服务器 ${serverUrl} 搜索失败: ${data.errorMessage || "未知错误"}`);
        return null;
      }
      
      // 为每个结果添加服务器标记和完整服务器信息
      if (data.animes && data.animes.length > 0) {
        data.animes.forEach(anime => {
          anime._server = serverUrl; // 添加服务器标记
          // 创建一个组合的ID，包含服务器信息和原始ID
          anime._combinedId = `${serverUrl}|${anime.animeId}`;
        });
      }
      
      return data;
    }).catch(error => {
      console.log(`服务器 ${serverUrl} 请求失败: ${error.message}`);
      return null;
    })
  );

  // 等待所有服务器响应
  const results = await Promise.allSettled(searchPromises);
  
  // 合并所有搜索结果
  let allAnimes = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      if (data.animes && data.animes.length > 0) {
        allAnimes = allAnimes.concat(data.animes);
        console.log(`服务器 ${servers[index]} 返回 ${data.animes.length} 个结果`);
      }
    } else {
      console.log(`服务器 ${servers[index]} 请求失败或返回无效数据`);
    }
  });

  console.log(`总共收到 ${allAnimes.length} 个搜索结果`);

  // 如果没有搜索结果
  if (allAnimes.length === 0) {
    throw new Error("所有服务器均未找到相关弹幕");
  }

  // 开始过滤数据
  let animes = allAnimes;
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
  
  return {
    animes: animes,
  };
}

// 解析多个服务器地址
function parseServers(serverInput) {
  if (!serverInput) {
    throw new Error("请配置至少一个服务器地址");
  }
  
  // 按逗号分割服务器地址
  const servers = serverInput.split(',').map(s => s.trim()).filter(s => s);
  
  if (servers.length === 0) {
    throw new Error("请配置至少一个有效的服务器地址");
  }
  
  console.log(`使用 ${servers.length} 个服务器:`, servers);
  return servers;
}

function matchSeason(anime, queryTitle, season) {
  console.log("start matchSeason: ", anime.animeTitle, queryTitle, season);
  let res = false;
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
  const { server, animeId } = params;
  
  console.log("getDetailById params:", params);
  
  // 解析多个服务器地址
  const servers = parseServers(server);
  
  // 提取服务器地址和原始animeId
  let targetServer = servers[0]; // 默认使用第一个服务器
  let actualAnimeId = animeId;
  
  // 检查animeId是否包含服务器标记（格式：server|animeId）
  if (animeId.includes('|')) {
    const parts = animeId.split('|');
    if (parts.length >= 2) {
      // 提取服务器地址（第一个部分）
      targetServer = parts[0];
      // 提取实际的animeId（剩下的部分）
      actualAnimeId = parts.slice(1).join('|');
      console.log(`解析出服务器: ${targetServer}, animeId: ${actualAnimeId}`);
    }
  } else {
    // 如果没有服务器标记，尝试从server参数中获取第一个服务器
    console.log(`animeId不包含服务器标记，使用默认服务器: ${targetServer}`);
  }
  
  console.log(`请求详情: ${targetServer}/api/v2/bangumi/${actualAnimeId}`);
  
  try {
    const response = await Widget.http.get(
      `${targetServer}/api/v2/bangumi/${actualAnimeId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
      }
    );

    if (!response) {
      throw new Error(`从服务器 ${targetServer} 获取数据失败: 响应为空`);
    }

    let data;
    try {
      data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    } catch (error) {
      throw new Error(`从服务器 ${targetServer} 获取的数据解析失败: ${error.message}`);
    }

    console.log("getDetailById 返回数据:", data);

    if (!data.bangumi || !data.bangumi.episodes) {
      console.warn(`服务器 ${targetServer} 返回的数据可能不包含剧集列表`);
      // 返回空数组，而不是抛出错误
      return [];
    }

    // 为每个剧集添加服务器标记
    if (data.bangumi.episodes && data.bangumi.episodes.length > 0) {
      data.bangumi.episodes.forEach(episode => {
        episode._server = targetServer;
        // 创建带服务器标记的commentId
        if (episode.commentId) {
          // 使用一个特殊的分隔符，确保不会与commentId本身冲突
          episode.commentId = `${targetServer}#${episode.commentId}`;
        }
      });
    }

    return data.bangumi.episodes || [];
  } catch (error) {
    console.error(`从服务器 ${targetServer} 获取详情失败:`, error);
    // 返回空数组而不是抛出错误，让用户可以选择其他结果
    return [];
  }
}

async function getCommentsById(params) {
  const { server, commentId, link, videoUrl, season, episode, tmdbId, type, title } = params;

  console.log("getCommentsById params:", params);

  if (!commentId) {
    console.log("commentId为空，无法获取弹幕");
    // 返回空的弹幕数据而不是null
    return { comments: [] };
  }

  // 解析多个服务器地址
  const servers = parseServers(server);
  
  // 提取服务器地址和原始commentId
  let targetServer = servers[0]; // 默认使用第一个服务器
  let actualCommentId = commentId;
  
  // 检查commentId是否包含服务器标记（格式：server#commentId）
  if (commentId.includes('#')) {
    const parts = commentId.split('#');
    if (parts.length >= 2) {
      // 提取服务器地址（第一个部分）
      targetServer = parts[0];
      // 提取实际的commentId（剩下的部分）
      actualCommentId = parts.slice(1).join('#');
      console.log(`解析出服务器: ${targetServer}, commentId: ${actualCommentId}`);
    }
  } else if (commentId.includes('|')) {
    // 兼容之前的格式
    const parts = commentId.split('|');
    if (parts.length >= 2) {
      targetServer = parts[0];
      actualCommentId = parts.slice(1).join('|');
      console.log(`解析出服务器(兼容格式): ${targetServer}, commentId: ${actualCommentId}`);
    }
  } else {
    // 如果没有服务器标记，尝试从server参数中获取第一个服务器
    console.log(`commentId不包含服务器标记，使用默认服务器: ${targetServer}, commentId: ${actualCommentId}`);
  }

  console.log(`请求弹幕: ${targetServer}/api/v2/comment/${actualCommentId}?withRelated=true&chConvert=1`);

  try {
    // 只从指定服务器获取弹幕
    const response = await Widget.http.get(
      `${targetServer}/api/v2/comment/${actualCommentId}?withRelated=true&chConvert=1`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ForwardWidgets/1.0.0",
        },
      }
    );

    if (!response) {
      console.error(`从服务器 ${targetServer} 获取弹幕失败: 响应为空`);
      return { comments: [] };
    }

    let data;
    try {
      data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    } catch (error) {
      console.error(`从服务器 ${targetServer} 获取的弹幕数据解析失败:`, error);
      return { comments: [] };
    }

    console.log(`服务器 ${targetServer} 返回弹幕数量: ${data.comments ? data.comments.length : 0}`);
    
    if (!data.comments || data.comments.length === 0) {
      console.log(`服务器 ${targetServer} 返回的弹幕列表为空`);
      // 确保返回的数据结构正确
      if (!data.comments) data.comments = [];
    }

    return data;
  } catch (error) {
    console.error(`从服务器 ${targetServer} 获取弹幕失败:`, error);
    // 返回空的弹幕数据而不是抛出错误
    return { comments: [] };
  }
}
