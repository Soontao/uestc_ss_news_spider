'use strict';

import log4js from "log4js"
import request from "request-promise"
import cheerio from "cheerio"

var log = log4js.getLogger("reptileService");

// reptileService 爬虫
export default class extends think.service.base {


    init(...args) {
        super.init(...args);
    }

    static domain = "http://www.ss.uestc.edu.cn"
    static notice_page = `http://www.ss.uestc.edu.cn/notice.do`

    /**
     * 获取系统最大的id
     */
    static async recentid() {
        let result = 0;
        try {
            let $ = await request({
                url: 'http://www.ss.uestc.edu.cn/find.do',
                method: "POST",
                headers: {
                    'Referer': 'http://www.ss.uestc.edu.cn',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36'
                },
                form: {
                    keyword: "%", //模糊查询
                },
                transform: function (body) {
                    return cheerio.load(body, {
                        decodeEntities: false
                    });
                }
            });
            result = $(".span10 > ul:nth-child(1) > li:nth-child(1) > h5:nth-child(1) > a:nth-child(1)")[0].attribs.href;
            result = result.split("?id=")[1];
            log.debug("recent id is " + result);

        } catch (e) {
            log.warn("cheerio parse error||request err");
            log.warn(e.message);
        } finally {
            return result;
        }

    }

    /**
     * 根据url解析文章
     */
    static async parse_article(url) {
        let article = {}
        try {
            // 请求并解析
            let $ = await request({
                url: url,
                headers: {
                    'Referer': 'http://www.ss.uestc.edu.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36'
                },
                transform: function (body) {
                    return cheerio.load(body, {
                        decodeEntities: false
                    });
                }
            });
            // 通过选择器获取数据
            article.id = parseInt(url.split("id=")[1]) || undefined;
            article.type = $(".breadcrumbs > div:nth-child(1)").text().trim() + "-" + $(".span9 > div:nth-child(1) > h3:nth-child(1)").text();
            article.title = $(".blog > h3:nth-child(1)").text();
            article.pubtime = $(".inline > li:nth-child(1)").text().substr(5);
            article.publisher = $(".inline > li:nth-child(2)").text().substr(4)
            article.author = $(".inline > li:nth-child(3)").text().substr(3)
            article.readnum = parseInt($(".inline > li:nth-child(4)").text().substr(3)) || undefined
            article.content = $(".contenttext").html().trim();
            let imgs = $(".contenttext img");
            article.img = (imgs && imgs[0] && !imgs[0].attribs.src.endsWith("icon_default.png") && imgs[0].attribs.src) || undefined;
        } catch (e) {
            log.warn(e.message)
            log.warn("cheerio parse error||request err")
        } finally {
            return article;
        }
    }

    /**
     * 从信软官网获取新闻的列表
     * 并且解析，存入数据库
     */
    static async update_news() {
        let page = 1;
        let addnum = 0;
        let end = false;
        let articles = think.model("articles", think.config("db"), "home");
        while (true) {
            let list = await this.official_list(page);
            if (list && list.length > 0)
                for (let i = 0; i < list.length; i++) {
                    let ele = list[i];
                    let tmp_article = await this.parse_article(ele.url);
                    let result = await articles.thenAdd(tmp_article, {
                        id: tmp_article.id
                    });
                    // 如果已经有相应id
                    if (result && result.type && result.type == "exist") {
                        end = true;
                        break;
                    } else if (result) {
                        addnum += 1;
                    } else {
                        log.warn('reptile result was undefined');
                        end = true;
                        break;
                    }
                } else {
                end = true;
            }
            if (end) break;
            else {
                page += 1;
            }
        }
        if (addnum > 0) {
            log.info(`从信软官网获取最新新闻，更新${addnum}条数据`);
        }
        return {
            addnum: addnum
        }
    }

    static async refresh_readnum() {
        const atcl_table = think.model("articles", think.config("db"), "home");
        const rd_num_table = think.model("readnum", think.config("db"), "home");
        const end = await this.recentid();
        log.info("start add read number records");
        // current_article_id
        for (let c_arti_id = 100; c_arti_id <= end; c_arti_id++) {
            let c_arti = {};
            try {
                c_arti = await this.parse_article(`${this.notice_page}?id=${c_arti_id}`);
                if (c_arti && c_arti.content && c_arti.readnum) {
                    await rd_num_table.add({ article_id: c_arti.id, read_num: c_arti.readnum });
                }
            } catch (error) {
                try {
                    if (c_arti) {
                        log.info(`check readnum but no article in db, try to create the article ${c_arti_id}`)
                        await atcl_table.add(c_arti);
                    }
                } catch (error) {
                    log.warn(error)
                }
            }

        }

        log.info("add read num records finished");
    }

    /**
     * 从页面获取id，url和标题
     */
    static async official_list(page) {
        let idarr = [];
        try {
            let $ = await request({
                method: "POST",
                url: "http://www.ss.uestc.edu.cn/find.do",
                // post方法
                // 设定头部信息
                headers: {
                    'Referer': 'http://www.ss.uestc.edu.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36'
                },
                form: {
                    keyword: "%", //模糊查询
                    page: page || 1 // 如果没有page参数，默认返回第一页
                },
                transform: (body) => {
                    return cheerio.load(body, {
                        decodeEntities: false
                    });
                }
            });
            $(".span10  ul li h5 a").each((idx, ele) => {
                idarr.push({
                    title: ele.attribs.title,
                    url: "http://www.ss.uestc.edu.cn/" + ele.attribs.href,
                    id: ele.attribs.href.split("?id=")[1]
                })
            });
        } catch (e) {
            log.warn(e.message);
        } finally {
            return idarr;
        }
    }
}